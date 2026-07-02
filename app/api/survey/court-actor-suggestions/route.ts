import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorLooseNameKey } from "../../../../lib/court-actors";
import { AliasResolver, type AliasDecisionRow } from "../../../../lib/court-actor-similarity";

type Row = {
  id: string;
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  submission_id: string;
  survey_submissions:
    | { email: string | null; state_of_occurrence: string | null; approved: boolean | null; permission_to_share: string | null }
    | { email: string | null; state_of_occurrence: string | null; approved: boolean | null; permission_to_share: string | null }[]
    | null;
};

function joinedSubmission(row: Row) {
  return Array.isArray(row.survey_submissions)
    ? row.survey_submissions[0] ?? null
    : row.survey_submissions;
}

function mostFrequent<T>(m: Map<T, number>): T | null {
  let best: T | null = null;
  let max = 0;
  for (const [k, v] of m.entries()) {
    if (v > max) {
      best = k;
      max = v;
    }
  }
  return best;
}

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

async function loadAliasResolver(sb: AdminClient): Promise<AliasResolver | null> {
  const { data, error } = await sb
    .from("court_actor_alias_decisions")
    .select("cluster_key, location_key, decision, canonical_name, canonical_role, name_keys")
    .eq("decision", "same_actor");
  if (error) {
    const missing = error.code === "42P01"
      || error.code === "42703"
      || error.code === "PGRST205"
      || /Could not find the table/i.test(error.message ?? "");
    if (missing) return null;
    console.error("court_actor_alias_decisions select error:", error.message);
    return null;
  }
  return new AliasResolver((data ?? []) as AliasDecisionRow[]);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state")?.trim().toUpperCase() || "";
    const q = searchParams.get("q")?.trim() || "";
    const qKey = actorLooseNameKey(q);
    if (!state || qKey.length < 3) {
      return Response.json({ suggestions: [] });
    }
    // `state` is interpolated into the PostgREST .or() filter below, so reject
    // anything beyond state codes / country names. Commas, parens, and dots
    // are PostgREST filter metacharacters and would allow filter injection.
    if (!/^[A-Z0-9 '-]{2,40}$/.test(state)) {
      return Response.json({ suggestions: [] });
    }

    const sb = createAdminSupabaseClient();
    const { data, error } = await sb
      .from("court_actors")
      .select("id,role,name,court_or_county,state_code,location_key,submission_id,survey_submissions(email,state_of_occurrence,approved,permission_to_share)")
      .eq("source", "form_direct")
      .or(`location_key.eq.${state},state_code.eq.${state}`)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) {
      console.error("court actor suggestions error:", error.message);
      return Response.json({ suggestions: [] });
    }

    type Bucket = {
      nameCounts: Map<string, number>;
      roleCounts: Map<string, number>;
      courtCounts: Map<string, number>;
      families: Set<string>;
    };

    const buckets = new Map<string, Bucket>();
    const rows = (data ?? []) as unknown as Row[];
    const aliasResolver = await loadAliasResolver(sb);
    const { data: reviews } = rows.length > 0
      ? await sb
        .from("court_actor_row_review")
        .select("row_id, decision")
        .in("row_id", rows.map(row => row.id))
      : { data: [] };
    const hiddenReviewIds = new Set((reviews ?? [])
      .filter(review => review.decision === "duplicate" || review.decision === "submitter_hidden")
      .map(review => String(review.row_id)));

    for (const row of rows) {
      if (hiddenReviewIds.has(row.id)) continue;
      if (!row.name || !row.role) continue;
      const location = row.location_key || row.state_code || joinedSubmission(row)?.state_of_occurrence || "";
      if (location !== state) continue;
      const rawKey = actorLooseNameKey(row.name);
      if (!rawKey) continue;
      const aliasHit = aliasResolver?.resolve(row.name, location) ?? null;
      const effectiveName = aliasHit?.canonical_name ?? row.name;
      const key = actorLooseNameKey(effectiveName);
      if (!key) continue;
      const matches = [rawKey, key].some(candidate =>
        candidate.includes(qKey)
        || qKey.includes(candidate)
        || candidate.split(" ").some(token => token.startsWith(qKey))
      );
      if (!matches) continue;
      const bucket = buckets.get(key) ?? {
        nameCounts: new Map<string, number>(),
        roleCounts: new Map<string, number>(),
        courtCounts: new Map<string, number>(),
        families: new Set<string>(),
      };
      bucket.nameCounts.set(effectiveName, (bucket.nameCounts.get(effectiveName) ?? 0) + 1);
      bucket.roleCounts.set(aliasHit?.canonical_role ?? row.role, (bucket.roleCounts.get(aliasHit?.canonical_role ?? row.role) ?? 0) + 1);
      if (row.court_or_county) bucket.courtCounts.set(row.court_or_county, (bucket.courtCounts.get(row.court_or_county) ?? 0) + 1);
      const email = joinedSubmission(row)?.email?.trim().toLowerCase();
      bucket.families.add(email ? `${email}|${state}` : `submission:${row.submission_id}`);
      buckets.set(key, bucket);
    }

    const suggestions = [...buckets.values()]
      .filter(bucket => bucket.families.size >= COURT_ACTOR_PUBLIC_THRESHOLD)
      .map(bucket => ({
        name: mostFrequent(bucket.nameCounts) ?? "",
        role: mostFrequent(bucket.roleCounts) ?? "",
        court: mostFrequent(bucket.courtCounts),
        state,
        families: bucket.families.size,
      }))
      .filter(item => item.name)
      .sort((a, b) => b.families - a.families || a.name.localeCompare(b.name))
      .slice(0, 6);

    return Response.json({ suggestions });
  } catch (err) {
    console.error("GET /api/survey/court-actor-suggestions error:", err);
    return Response.json({ suggestions: [] });
  }
}
