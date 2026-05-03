import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorBucketKeyWithLocation, courtActorLocationKey } from "../../../../lib/court-actors";

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

function familyKey(row: ActorRow): string {
  const location = actorLocation(row) ?? "";
  const submission = joinedSubmission(row);
  const email = submission?.email?.trim().toLowerCase();
  return email ? `${email}|${location}` : `submission:${row.submission_id}`;
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
  const sorted = Array.from(roles.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length === 0) return "Court Actor";
  if (sorted.length === 1) return sorted[0][0];
  return `${sorted[0][0]} + ${sorted.length - 1} role${sorted.length === 2 ? "" : "s"}`;
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
        .select("role, name, court_or_county, state_code, location_key, submission_id, survey_submissions(email, state_of_occurrence, outside_us_country)")
        .eq("source", "form_direct");
      const { data, error } = await q.range(from, from + pageSize - 1);
      if (error) {
        // Fallback if location_key column missing
        if (error.code === "42703") {
          const fb = sb.from("court_actors")
            .select("role, name, court_or_county, state_code, submission_id, survey_submissions(email, state_of_occurrence, outside_us_country)")
            .eq("source", "form_direct");
          const { data: fbData, error: fbError } = await fb.range(from, from + pageSize - 1);
          if (fbError) {
            console.error("GET /api/actors/all fallback error:", fbError.message);
            return Response.json({ actors: [], total_actors: 0, total_reports: 0, at_threshold: 0, states_count: 0 });
          }
          if (!fbData || fbData.length === 0) break;
          const withNullLoc = (fbData as unknown as ActorRow[]).map(r => ({ ...r, location_key: null }));
          all.push(...withNullLoc);
          if (fbData.length < pageSize) break;
        } else {
          console.error("GET /api/actors/all error:", error.message);
          return Response.json({ actors: [], total_actors: 0, total_reports: 0, at_threshold: 0, states_count: 0 });
        }
      } else {
        if (!data || data.length === 0) break;
        all.push(...(data as unknown as ActorRow[]));
        if (data.length < pageSize) break;
      }
      from += pageSize;
    }

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
      const location = actorLocation(a);
      if (!location) continue;
      totalReports += 1;
      const normalizedName = actorBucketKeyWithLocation(a.name, a.role, location);
      if (!normalizedName.split("|")[0]) continue;
      const key = normalizedName;
      if (!buckets.has(key)) {
        buckets.set(key, {
          role: a.role,
          name: a.name,
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
    const locations = new Set<string>();
    for (const a of actors) {
      if (a.state_code) states.add(a.state_code);
      if (a.location_key) locations.add(a.location_key);
    }

    return Response.json({
      actors,
      total_actors: actors.length,
      total_reports: totalReports,
      at_threshold: atThreshold,
      states_count: states.size,
      locations_count: locations.size,
      threshold: COURT_ACTOR_PUBLIC_THRESHOLD,
    });
  } catch (err) {
    console.error("GET /api/actors/all error:", err);
    return Response.json({ actors: [], total_actors: 0, total_reports: 0, at_threshold: 0, states_count: 0 });
  }
}
