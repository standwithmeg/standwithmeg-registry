import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorBucketKeyWithLocation, courtActorLocationKey, resolveFamilyKey, type CourtActorRowReviewDecision } from "../../../../lib/court-actors";
import { isPublicShareableSubmission } from "../../../../lib/submission-public-visibility";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

/**
 * Loads court_actor_row_review and returns row_id -> decision map.
 * Empty map (not null) when the migration has not been applied yet.
 */
async function loadRowReviewMap(sb: AdminClient): Promise<Map<string, CourtActorRowReviewDecision>> {
  const { data, error } = await sb
    .from("court_actor_row_review")
    .select("row_id, decision");
  if (error) {
    const missing = error.code === "42P01"
      || error.code === "PGRST205"
      || /Could not find the table/i.test(error.message ?? "");
    if (missing) return new Map();
    console.error("court_actor_row_review select error:", error.message);
    return new Map();
  }
  const map = new Map<string, CourtActorRowReviewDecision>();
  for (const r of (data ?? []) as Array<{ row_id: string; decision: CourtActorRowReviewDecision }>) {
    map.set(r.row_id, r.decision);
  }
  return map;
}

/**
 * Returns court actors named by enough different families to cross the
 * shared auto-publish threshold. Names are matched conservatively on normalized name +
 * location_key, so casing, punctuation, common titles, middle initials,
 * repeated-letter misspellings, and different role labels do not split the
 * same person. Families are deduped by email + location, so one family naming
 * the same person twice still only counts once.
 *
 * Never exposes: notes, submission_id, reporter identity.
 *
 * Query params:
 *   - state (optional) — Legacy US state code, filters to that location only.
 *   - location (optional) — Location key, filters to that location only.
 *
 * Response:
 *   { actors: [{ role, name, court_or_county?, state_code, location_key, count }] }
 */

type ActorRow = {
  id: string;
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  created_at: string;
  submission_id: string;
  survey_submissions:
    | { email: string | null; state_of_occurrence: string | null; outside_us_country: string | null; permission_to_share: string | null; approved: boolean | null }
    | { email: string | null; state_of_occurrence: string | null; outside_us_country: string | null; permission_to_share: string | null; approved: boolean | null }[]
    | null;
};

function joinedSubmission(row: ActorRow) {
  const submission = Array.isArray(row.survey_submissions)
    ? row.survey_submissions[0]
    : row.survey_submissions;
  return submission ?? null;
}

function actorLocation(row: ActorRow): string | null {
  // Prefer direct location_key if available (post-migration)
  if (row.location_key?.trim()) {
    return row.location_key.trim();
  }
  // Fallback: compute from submission data for compatibility
  const submission = joinedSubmission(row);
  return courtActorLocationKey(submission?.state_of_occurrence || null, submission?.outside_us_country || null);
}

function familyKey(row: ActorRow, reviewMap: Map<string, CourtActorRowReviewDecision>): string | null {
  const location = actorLocation(row) ?? null;
  const submission = joinedSubmission(row);
  return resolveFamilyKey({
    row_id: row.id,
    reporter_email: submission?.email ?? null,
    submission_id: row.submission_id,
    location_key: location,
    review_decision: reviewMap.get(row.id) ?? null,
  });
}

// Pick the most-frequent casing as canonical display.
function mostFrequent<T>(m: Map<T, number>): T | null {
  let best: T | null = null;
  let max = 0;
  for (const entry of Array.from(m.entries())) {
    const [k, v] = entry;
    if (v > max) { max = v; best = k; }
  }
  return best;
}

function roleSummary(roles: Map<string, number>) {
  // Show every role this actor has been named under, joined by " / ".
  // Mirrors app/api/actors/all/route.ts.
  const sorted = Array.from(roles.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length === 0) return "Court Actor";
  if (sorted.length <= 3) return sorted.map(s => s[0]).join(" / ");
  const head = sorted.slice(0, 2).map(s => s[0]).join(" / ");
  const remaining = sorted.length - 2;
  return `${head} + ${remaining} more role${remaining === 1 ? "" : "s"}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const stateFilter = searchParams.get("state")?.trim().toUpperCase() || null;
    const locationFilter = searchParams.get("location")?.trim() || null;

    const sb = createAdminSupabaseClient();

    // Paginate through all court_actors — table could grow. Filter by location
    // server-side when one is provided.
    let from = 0;
    const pageSize = 1000;
    const all: ActorRow[] = [];
    while (true) {
      // Public threshold only counts form_direct rows. Extracted rows
      // (regex / AI scans of legacy free-text) are admin-only signals;
      // they never surface names publicly on their own.

      // Try with location_key first
      const qWithLocation = sb.from("court_actors")
        .select("id, role, name, court_or_county, state_code, location_key, created_at, submission_id, survey_submissions(email, state_of_occurrence, outside_us_country, permission_to_share, approved)")
        .eq("source", "form_direct");

      const { data, error } = await qWithLocation.range(from, from + pageSize - 1);
      if (error) {
        // If location_key doesn't exist yet, fallback to old query
        if (error.code === "42703") { // column doesn't exist
          const q = sb.from("court_actors")
            .select("id, role, name, court_or_county, state_code, created_at, submission_id, survey_submissions(email, state_of_occurrence, outside_us_country, permission_to_share, approved)")
            .eq("source", "form_direct");
          const { data: fallbackData, error: fallbackError } = await q.range(from, from + pageSize - 1);
          if (fallbackError) {
            console.error("GET /api/survey/court-actors (non-blocking):", fallbackError.message);
            return Response.json(
              { actors: [], threshold: COURT_ACTOR_PUBLIC_THRESHOLD, error: "Failed to load court actor patterns." },
              { status: 500 }
            );
          }
          if (!fallbackData || fallbackData.length === 0) break;
          // Add null location_key to fallback data
          const dataWithNullLocation = (fallbackData as unknown as ActorRow[]).map(row => ({ ...row, location_key: null }));
          all.push(...dataWithNullLocation);
          if (fallbackData.length < pageSize) break;
        } else {
          console.error("GET /api/survey/court-actors (non-blocking):", error.message);
          return Response.json(
            { actors: [], threshold: COURT_ACTOR_PUBLIC_THRESHOLD, error: "Failed to load court actor patterns." },
            { status: 500 }
          );
        }
      } else {
        if (!data || data.length === 0) break;
        all.push(...(data as unknown as ActorRow[]));
        if (data.length < pageSize) break;
      }
      from += pageSize;
    }

    // Load per-row review decisions so duplicate-marked rows are excluded
    // from family counts and count_separately rows count as their own family.
    const rowReviewMap = await loadRowReviewMap(sb);

    // Bucket by normalized (name + location). Count DISTINCT families
    // per bucket (not distinct rows — the threshold is different families,
    // so one family naming the same person twice only counts once).
    type Bucket = {
      role: string;
      name: string;           // preserves the most common casing seen
      court_or_county: string | null;
      state_code: string | null;
      location_key: string | null;
      families: Set<string>;
      roleCounts: Map<string, number>;
      casingCounts: Map<string, number>;
      courtCounts: Map<string, number>;
      latest_reported_at: string | null;
    };

    const buckets = new Map<string, Bucket>();
    for (const a of all) {
      if (!a.role || !a.name) continue;
      const submission = joinedSubmission(a);
      if (!isPublicShareableSubmission(submission)) continue;
      const location = actorLocation(a);
      if (!location) continue;

      // Support both legacy state filter and new location filter
      if (stateFilter && location !== stateFilter) continue;
      if (locationFilter && location !== locationFilter) continue;

      const fk = familyKey(a, rowReviewMap);
      // Skip rows the admin marked as duplicate. Their testimony stays
      // in court_actors but contributes nothing to public counts.
      if (fk === null) continue;

      const effectiveName = a.name;
      const normalizedName = actorBucketKeyWithLocation(effectiveName, a.role, location);
      if (!normalizedName.split("|")[0]) continue;
      const key = normalizedName;
      if (!buckets.has(key)) {
        buckets.set(key, {
          role: a.role,
          name: effectiveName,
          court_or_county: a.court_or_county,
          state_code: a.state_code,
          location_key: location,
          families: new Set(),
          roleCounts: new Map(),
          casingCounts: new Map(),
          courtCounts: new Map(),
          latest_reported_at: a.created_at ?? null,
        });
      }
      const b = buckets.get(key)!;
      if (a.created_at && (!b.latest_reported_at || a.created_at > b.latest_reported_at)) {
        b.latest_reported_at = a.created_at;
      }
      b.families.add(fk);
      b.roleCounts.set(a.role, (b.roleCounts.get(a.role) ?? 0) + 1);
      const casingName = a.name;
      b.casingCounts.set(casingName, (b.casingCounts.get(casingName) ?? 0) + 1);
      if (a.court_or_county) {
        b.courtCounts.set(a.court_or_county, (b.courtCounts.get(a.court_or_county) ?? 0) + 1);
      }
    }

    const publicActors = Array.from(buckets.values())
      .filter(b => b.families.size >= COURT_ACTOR_PUBLIC_THRESHOLD)
      .map(b => ({
        role: roleSummary(b.roleCounts),
        name: mostFrequent(b.casingCounts) ?? b.name,
        court_or_county: mostFrequent(b.courtCounts),
        state_code: b.state_code,
        location_key: b.location_key,
        count: b.families.size,
        latest_reported_at: b.latest_reported_at,
      }))
      .sort((a, b) => {
        // Newest public patterns first, then most families, then name A-Z.
        // Frontend (CourtActorPanel) can re-sort via the dropdown — this is
        // only the default ordering for the API response.
        const newest = (b.latest_reported_at ?? "").localeCompare(a.latest_reported_at ?? "");
        return newest || b.count - a.count || a.name.localeCompare(b.name);
      });

    return Response.json({ actors: publicActors, threshold: COURT_ACTOR_PUBLIC_THRESHOLD });
  } catch (err) {
    console.error("GET /api/survey/court-actors error:", err);
    return Response.json(
      { actors: [], threshold: COURT_ACTOR_PUBLIC_THRESHOLD, error: "Failed to load court actor patterns." },
      { status: 500 }
    );
  }
}
