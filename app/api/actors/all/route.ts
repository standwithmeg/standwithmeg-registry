import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorBucketKeyWithLocation, courtActorLocationKey, resolveFamilyKey, type CourtActorRowReviewDecision } from "../../../../lib/court-actors";
import { isPublicShareableSubmission } from "../../../../lib/submission-public-visibility";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

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
 * Returns ALL court actors named in the registry, grouped by normalized
 * (name + location), with family counts. Mirrors the bucketing logic of
 * /api/survey/court-actors but DROPS the public-threshold filter so the
 * /actors page can show below-threshold patterns too.
 *
 * Public visibility policy preserved by /api/survey/court-actors continues
 * to apply to the gated /report dashboard. This endpoint is consumed by the
 * survey-gated /actors browse view.
 *
 * Never exposes: notes, submission_id, reporter identity.
 */

type ActorRow = {
  id: string;
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  submission_id: string;
  survey_submissions:
    | { email: string | null; state_of_occurrence: string | null; outside_us_country: string | null; permission_to_share: string | null; approved: boolean | null }
    | { email: string | null; state_of_occurrence: string | null; outside_us_country: string | null; permission_to_share: string | null; approved: boolean | null }[]
    | null;
};

type ActorBucketId = string;

function joinedSubmission(row: ActorRow) {
  const submission = Array.isArray(row.survey_submissions)
    ? row.survey_submissions[0]
    : row.survey_submissions;
  return submission ?? null;
}

function actorLocation(row: ActorRow): string | null {
  if (row.location_key?.trim()) return row.location_key.trim();
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
  // Multi-role actors (e.g. an attorney who is also a GAL) are common in
  // family court, and hiding the secondary role behind "+ 1 role" was
  // misleading — readers could not tell that the same person shows up
  // wearing more than one hat. Cap at 3 visible roles to keep card
  // labels from overflowing; 4+ collapses to "top two + N more roles".
  const sorted = Array.from(roles.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length === 0) return "Court Actor";
  if (sorted.length <= 3) return sorted.map(s => s[0]).join(" / ");
  const head = sorted.slice(0, 2).map(s => s[0]).join(" / ");
  const remaining = sorted.length - 2;
  return `${head} + ${remaining} more role${remaining === 1 ? "" : "s"}`;
}

function countyBreakdown(courtCounts: Map<string, number>): string {
  const sorted = Array.from(courtCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted.map(([court, count]) => `${court} (${count})`).join(", ");
}

export async function GET() {
  try {
    const sb = createAdminSupabaseClient();

    let from = 0;
    const pageSize = 1000;
    const all: ActorRow[] = [];
    while (true) {
      const q = sb.from("court_actors")
        .select("id, role, name, court_or_county, state_code, location_key, submission_id, survey_submissions(email, state_of_occurrence, outside_us_country, permission_to_share, approved)")
        .eq("source", "form_direct");
      const { data, error } = await q.range(from, from + pageSize - 1);
      if (error) {
        // Fallback if location_key column missing
        if (error.code === "42703") {
          const fb = sb.from("court_actors")
            .select("id, role, name, court_or_county, state_code, submission_id, survey_submissions(email, state_of_occurrence, outside_us_country, permission_to_share, approved)")
            .eq("source", "form_direct");
          const { data: fbData, error: fbError } = await fb.range(from, from + pageSize - 1);
          if (fbError) {
            console.error("GET /api/actors/all fallback error:", fbError.message);
            return Response.json(
              { actors: [], total_actors: 0, total_reports: 0, at_threshold: 0, states_count: 0, threshold: COURT_ACTOR_PUBLIC_THRESHOLD, error: "Failed to load court actors." },
              { status: 500 }
            );
          }
          if (!fbData || fbData.length === 0) break;
          const withNullLoc = (fbData as unknown as ActorRow[]).map(r => ({ ...r, location_key: null }));
          all.push(...withNullLoc);
          if (fbData.length < pageSize) break;
        } else {
          console.error("GET /api/actors/all error:", error.message);
          return Response.json(
            { actors: [], total_actors: 0, total_reports: 0, at_threshold: 0, states_count: 0, threshold: COURT_ACTOR_PUBLIC_THRESHOLD, error: "Failed to load court actors." },
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

    const rowReviewMap = await loadRowReviewMap(sb);

    type Bucket = {
      role: string;
      name: string;
      state_code: string | null;
      location_key: string | null;
      families: Set<string>;
      roleCounts: Map<string, number>;
      casingCounts: Map<string, number>;
      courtCounts: Map<string, number>;
    };

    const buckets = new Map<ActorBucketId, Bucket>();
    let totalReports = 0;
    for (const a of all) {
      if (!a.role || !a.name) continue;
      const submission = joinedSubmission(a);
      if (!isPublicShareableSubmission(submission)) continue;
      const location = actorLocation(a);
      if (!location) continue;
      const fk = familyKey(a, rowReviewMap);
      if (fk === null) continue;
      totalReports += 1;
      const effectiveName = a.name;
      const normalizedName = actorBucketKeyWithLocation(effectiveName, a.role, location);
      if (!normalizedName.split("|")[0]) continue;
      const key = normalizedName;
      if (!buckets.has(key)) {
        buckets.set(key, {
          role: a.role,
          name: effectiveName,
          state_code: a.state_code,
          location_key: location,
          families: new Set(),
          roleCounts: new Map(),
          casingCounts: new Map(),
          courtCounts: new Map(),
        });
      }
      const b = buckets.get(key)!;
      b.families.add(fk);
      b.roleCounts.set(a.role, (b.roleCounts.get(a.role) ?? 0) + 1);
      const casingName = a.name;
      b.casingCounts.set(casingName, (b.casingCounts.get(casingName) ?? 0) + 1);
      if (a.court_or_county) {
        b.courtCounts.set(a.court_or_county, (b.courtCounts.get(a.court_or_county) ?? 0) + 1);
      }
    }

    const actors = Array.from(buckets.values())
      .map(b => {
        const familyCount = b.families.size;
        return {
          role: roleSummary(b.roleCounts),
          name: mostFrequent(b.casingCounts) ?? b.name,
          state_code: b.state_code,
          location_key: b.location_key,
          county_breakdown: countyBreakdown(b.courtCounts) || "County not listed",
          family_count: familyCount,
          at_threshold: familyCount >= COURT_ACTOR_PUBLIC_THRESHOLD,
          needs_more: Math.max(0, COURT_ACTOR_PUBLIC_THRESHOLD - familyCount),
        };
      })
      .sort((a, b) => b.family_count - a.family_count || a.name.localeCompare(b.name));

    const atThreshold = actors.filter(a => a.at_threshold).length;
    const states = new Set<string>();
    for (const a of actors) {
      if (a.state_code) states.add(a.state_code);
    }

    return Response.json({
      actors,
      total_actors: actors.length,
      total_reports: totalReports,
      at_threshold: atThreshold,
      states_count: states.size,
      threshold: COURT_ACTOR_PUBLIC_THRESHOLD,
    });
  } catch (err) {
    console.error("GET /api/actors/all error:", err);
    return Response.json(
      { actors: [], total_actors: 0, total_reports: 0, at_threshold: 0, states_count: 0, threshold: COURT_ACTOR_PUBLIC_THRESHOLD, error: "Failed to load court actors." },
      { status: 500 }
    );
  }
}
