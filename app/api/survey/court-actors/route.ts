import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorBucketKeyWithLocation, courtActorLocationKey } from "../../../../lib/court-actors";

/**
 * Returns court actors named by 3+ different families (the auto-publish
 * threshold). Names are matched conservatively on normalized name +
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
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  submission_id: string;
  survey_submissions:
    | { email: string | null; state_of_occurrence: string | null; outside_us_country: string | null }
    | { email: string | null; state_of_occurrence: string | null; outside_us_country: string | null }[]
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

function familyKey(row: ActorRow): string {
  const location = actorLocation(row) ?? "";
  const submission = joinedSubmission(row);
  const email = submission?.email?.trim().toLowerCase();
  return email ? `${email}|${location}` : `submission:${row.submission_id}`;
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
  const sorted = Array.from(roles.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length === 0) return "Court Actor";
  if (sorted.length === 1) return sorted[0][0];
  return `${sorted[0][0]} + ${sorted.length - 1} role${sorted.length === 2 ? "" : "s"}`;
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
        .select("role, name, court_or_county, state_code, location_key, submission_id, survey_submissions(email, state_of_occurrence, outside_us_country)")
        .eq("source", "form_direct");
        
      const { data, error } = await qWithLocation.range(from, from + pageSize - 1);
      if (error) {
        // If location_key doesn't exist yet, fallback to old query
        if (error.code === "42703") { // column doesn't exist
          const q = sb.from("court_actors")
            .select("role, name, court_or_county, state_code, submission_id, survey_submissions(email, state_of_occurrence, outside_us_country)")
            .eq("source", "form_direct");
          const { data: fallbackData, error: fallbackError } = await q.range(from, from + pageSize - 1);
          if (fallbackError) {
            console.error("GET /api/survey/court-actors (non-blocking):", fallbackError.message);
            return Response.json({ actors: [] });
          }
          if (!fallbackData || fallbackData.length === 0) break;
          // Add null location_key to fallback data
          const dataWithNullLocation = (fallbackData as unknown as ActorRow[]).map(row => ({ ...row, location_key: null }));
          all.push(...dataWithNullLocation);
          if (fallbackData.length < pageSize) break;
        } else {
          console.error("GET /api/survey/court-actors (non-blocking):", error.message);
          return Response.json({ actors: [] });
        }
      } else {
        if (!data || data.length === 0) break;
        all.push(...(data as unknown as ActorRow[]));
        if (data.length < pageSize) break;
      }
      from += pageSize;
    }

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
    };

    const buckets = new Map<string, Bucket>();
    for (const a of all) {
      if (!a.role || !a.name) continue;
      const location = actorLocation(a);
      if (!location) continue;
      
      // Support both legacy state filter and new location filter
      if (stateFilter && location !== stateFilter) continue;
      if (locationFilter && location !== locationFilter) continue;
      
      const normalizedName = actorBucketKeyWithLocation(a.name, a.role, location);
      if (!normalizedName.split("|")[0]) continue;
      const key = normalizedName;
      if (!buckets.has(key)) {
        buckets.set(key, {
          role: a.role,
          name: a.name,
          court_or_county: a.court_or_county,
          state_code: a.state_code,
          location_key: location,
          families: new Set(),
          roleCounts: new Map(),
          casingCounts: new Map(),
          courtCounts: new Map(),
        });
      }
      const b = buckets.get(key)!;
      b.families.add(familyKey(a));
      b.roleCounts.set(a.role, (b.roleCounts.get(a.role) ?? 0) + 1);
      b.casingCounts.set(a.name, (b.casingCounts.get(a.name) ?? 0) + 1);
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
      }))
      .sort((a, b) => b.count - a.count);

    return Response.json({ actors: publicActors, threshold: COURT_ACTOR_PUBLIC_THRESHOLD });
  } catch (err) {
    console.error("GET /api/survey/court-actors error:", err);
    return Response.json({ actors: [] });
  }
}