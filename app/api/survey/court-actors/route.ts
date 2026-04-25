import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { actorBucketKey } from "../../../../lib/court-actors";

/**
 * Returns court actors named by 5+ different survey submissions (the
 * auto-publish threshold). Names are matched conservatively on
 * normalized name + role + state_code, so casing, punctuation, common
 * titles, and middle initials do not split the same person.
 *
 * Never exposes: notes, submission_id, reporter identity.
 *
 * Query params:
 *   - state (optional) — US state code, filters to that state only.
 *
 * Response:
 *   { actors: [{ role, name, court_or_county?, state_code, count }] }
 */

const PUBLIC_THRESHOLD = 5;

type ActorRow = {
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  submission_id: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const stateFilter = searchParams.get("state");

    const sb = createAdminSupabaseClient();

    // Paginate through all court_actors — table could grow. Filter by state
    // server-side when one is provided.
    let from = 0;
    const pageSize = 1000;
    const all: ActorRow[] = [];
    while (true) {
      // Public threshold only counts form_direct rows. Extracted rows
      // (regex / AI scans of legacy free-text) are admin-only signals;
      // they never surface names publicly on their own.
      let q = sb.from("court_actors")
        .select("role, name, court_or_county, state_code, submission_id")
        .eq("source", "form_direct");
      if (stateFilter) q = q.eq("state_code", stateFilter.toUpperCase());
      const { data, error } = await q.range(from, from + pageSize - 1);
      if (error) {
        // Table may not exist yet — return empty list gracefully
        console.error("GET /api/survey/court-actors (non-blocking):", error.message);
        return Response.json({ actors: [] });
      }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Bucket by (lowercase name + role + state). Count DISTINCT submissions
    // per bucket (not distinct rows — the threshold is "5 different families",
    // so one family naming the same person twice only counts once).
    type Bucket = {
      role: string;
      name: string;           // preserves the most common casing seen
      court_or_county: string | null;
      state_code: string | null;
      submissions: Set<string>;
      casingCounts: Map<string, number>;
      courtCounts: Map<string, number>;
    };

    const buckets = new Map<string, Bucket>();
    for (const a of all) {
      if (!a.role || !a.name) continue;
      const normalizedName = actorBucketKey(a.name, a.role, a.state_code);
      if (!normalizedName.split("|")[0]) continue;
      const key = normalizedName;
      if (!buckets.has(key)) {
        buckets.set(key, {
          role: a.role,
          name: a.name,
          court_or_county: a.court_or_county,
          state_code: a.state_code,
          submissions: new Set(),
          casingCounts: new Map(),
          courtCounts: new Map(),
        });
      }
      const b = buckets.get(key)!;
      b.submissions.add(a.submission_id);
      b.casingCounts.set(a.name, (b.casingCounts.get(a.name) ?? 0) + 1);
      if (a.court_or_county) {
        b.courtCounts.set(a.court_or_county, (b.courtCounts.get(a.court_or_county) ?? 0) + 1);
      }
    }

    // Pick the most-frequent casing as canonical display.
    function mostFrequent<T>(m: Map<T, number>): T | null {
      let best: T | null = null;
      let max = 0;
      for (const [k, v] of m) {
        if (v > max) { max = v; best = k; }
      }
      return best;
    }

    const publicActors = [...buckets.values()]
      .filter(b => b.submissions.size >= PUBLIC_THRESHOLD)
      .map(b => ({
        role: b.role,
        name: mostFrequent(b.casingCounts) ?? b.name,
        court_or_county: mostFrequent(b.courtCounts),
        state_code: b.state_code,
        count: b.submissions.size,
      }))
      .sort((a, b) => b.count - a.count);

    return Response.json({ actors: publicActors, threshold: PUBLIC_THRESHOLD });
  } catch (err) {
    console.error("GET /api/survey/court-actors error:", err);
    return Response.json({ actors: [] });
  }
}
