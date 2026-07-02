import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorBucketKeyWithLocation, publicActorRoleEntries, resolveFamilyKey, type CourtActorRowReviewDecision } from "../../../../lib/court-actors";
import { AliasResolver, type AliasDecisionRow } from "../../../../lib/court-actor-similarity";
import { isCountableSubmission } from "../../../../lib/submission-public-visibility";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

const ACTORS_ALL_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=900, stale-while-revalidate=3600",
  "CDN-Cache-Control": "public, max-age=900, stale-while-revalidate=3600",
  "Vercel-CDN-Cache-Control": "public, max-age=900, stale-while-revalidate=3600",
};

const FORM_DIRECT_ACTOR_SELECT = [
  "id",
  "role",
  "name",
  "court_or_county",
  "state_code",
  "location_key",
  "submission_id",
  "email",
  "permission_to_share",
  "approved",
].join(", ");

let formDirectRowsCache:
  | { expiresAt: number; promise: Promise<ActorRow[]> }
  | null = null;

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
  email: string | null;
  permission_to_share: string | null;
  approved: boolean | null;
};

type ActorBucketId = string;

function joinedSubmission(row: ActorRow) {
  return {
    email: row.email,
    permission_to_share: row.permission_to_share,
    approved: row.approved,
  };
}

function actorLocation(row: ActorRow): string | null {
  if (row.location_key?.trim()) return row.location_key.trim();
  const stateCode = row.state_code?.trim().toUpperCase();
  return stateCode || null;
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

async function loadFormDirectActorRows(sb: AdminClient): Promise<ActorRow[]> {
  const now = Date.now();
  if (formDirectRowsCache && formDirectRowsCache.expiresAt > now) {
    return formDirectRowsCache.promise;
  }

  const promise = (async () => {
    let from = 0;
    const pageSize = 1000;
    const all: ActorRow[] = [];
    while (true) {
      // Stable unique sort key is required for correct range pagination —
      // without it rows near a page boundary are dropped/duplicated, which
      // undercounts families for actors whose rows span >1000 rows.
      const { data, error } = await sb
        .from("court_actors_public_safe")
        .select(FORM_DIRECT_ACTOR_SELECT)
        .eq("source", "form_direct")
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        throw error;
      }
      if (!data || data.length === 0) break;
      all.push(...(data as unknown as ActorRow[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  })();

  formDirectRowsCache = {
    expiresAt: now + 5 * 60 * 1000,
    promise,
  };

  try {
    return await promise;
  } catch (error) {
    if (formDirectRowsCache?.promise === promise) {
      formDirectRowsCache = null;
    }
    throw error;
  }
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
  const sorted = publicActorRoleEntries(roles);
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

    let all: ActorRow[];
    try {
      all = await loadFormDirectActorRows(sb);
    } catch (error) {
      console.error("GET /api/actors/all error:", (error as { message?: string }).message ?? error);
      return Response.json(
        { actors: [], total_actors: 0, total_reports: 0, at_threshold: 0, states_count: 0, threshold: COURT_ACTOR_PUBLIC_THRESHOLD, error: "Failed to load court actors." },
        { status: 500, headers: ACTORS_ALL_CACHE_HEADERS }
      );
    }

    const rowReviewMap = await loadRowReviewMap(sb);
    const aliasResolver = await loadAliasResolver(sb);

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
    let totalActorMentions = 0;
    for (const a of all) {
      if (!a.role || !a.name) continue;
      const submission = joinedSubmission(a);
      if (!isCountableSubmission(submission)) continue;
      const location = actorLocation(a);
      if (!location) continue;
      const fk = familyKey(a, rowReviewMap);
      if (fk === null) continue;
      totalActorMentions += 1;
      const aliasHit = aliasResolver?.resolve(a.name, location) ?? null;
      const effectiveName = aliasHit?.canonical_name ?? a.name;
      const normalizedName = actorBucketKeyWithLocation(effectiveName, a.role, location);
      if (!normalizedName.split("|")[0]) continue;
      const key = normalizedName;
      if (!buckets.has(key)) {
        buckets.set(key, {
          role: aliasHit?.canonical_role ?? a.role,
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
      const casingName = aliasHit?.canonical_name ?? a.name;
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
    const locations = new Set<string>();
    for (const a of actors) {
      if (a.state_code) states.add(a.state_code);
      const location = a.location_key || a.state_code;
      if (location) locations.add(location);
    }

    return Response.json(
      {
        actors,
        total_actors: actors.length,
        total_actor_mentions: totalActorMentions,
        // Backward-compatible alias for any older UI code. This is not the
        // total family report count; /api/survey owns that dashboard number.
        total_reports: totalActorMentions,
        at_threshold: atThreshold,
        states_count: states.size,
        locations_count: locations.size,
        threshold: COURT_ACTOR_PUBLIC_THRESHOLD,
      },
      { headers: ACTORS_ALL_CACHE_HEADERS },
    );
  } catch (err) {
    console.error("GET /api/actors/all error:", err);
    return Response.json(
      { actors: [], total_actors: 0, total_reports: 0, at_threshold: 0, states_count: 0, threshold: COURT_ACTOR_PUBLIC_THRESHOLD, error: "Failed to load court actors." },
      { status: 500, headers: ACTORS_ALL_CACHE_HEADERS }
    );
  }
}
