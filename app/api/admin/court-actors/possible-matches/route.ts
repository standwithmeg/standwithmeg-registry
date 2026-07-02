import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../../lib/require-auth";
import { actorLooseNameKey, courtActorLocationKey, type CourtActorRowReviewDecision } from "../../../../../lib/court-actors";
import { isCourtActorRoleOption, normalizeCourtActorRoleLabel } from "../../../../../lib/court-actor-roles";
import { refreshPublicActorCache } from "../../../survey/court-actors/route";
import { after } from "next/server";
import {
  buildSuggestedClusters,
  buildClusterKey,
  damerauLevenshtein,
  type ActorRowForClustering,
  type SuggestedCluster,
} from "../../../../../lib/court-actor-similarity";
import { isPublicShareableSubmission } from "../../../../../lib/submission-public-visibility";

/**
 * Admin-only: returns clusters of close-spelling court-actor variants
 * within the same location. The admin reviews each cluster and either
 * marks it as the same actor (folding the variants into one canonical
 * name for public counting) or keeps the variants separate.
 *
 * GET   — list clusters that still need a decision, plus existing
 *         decisions so the UI can show what was already reviewed.
 *
 * POST  — save a decision for one cluster:
 *         { cluster_key, decision, location_key, name_keys, variants,
 *           canonical_name?, canonical_role?, note? }
 *
 * No public exposure — service-role + admin email gate only.
 */

type SubmissionShape = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  state_of_occurrence: string | null;
  outside_us_country: string | null;
  case_county: string | null;
  permission_to_share: string | null;
  approved: boolean | null;
};

type Row = {
  id: string;
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  source: string | null;
  submission_id: string;
  notes: string | null;
  created_at: string | null;
  survey_submissions: SubmissionShape | SubmissionShape[] | null;
};

function joinedSubmission(row: Row) {
  return Array.isArray(row.survey_submissions)
    ? row.survey_submissions[0] ?? null
    : row.survey_submissions;
}

function actorLocation(row: Row): string | null {
  if (row.location_key?.trim()) return row.location_key.trim();
  const submission = joinedSubmission(row);
  return courtActorLocationKey(
    submission?.state_of_occurrence || null,
    submission?.outside_us_country || null,
  );
}

type AliasDecisionRecord = {
  cluster_key: string;
  location_key: string | null;
  decision: "same_actor" | "keep_separate";
  canonical_name: string | null;
  canonical_role: string | null;
  name_keys: string[];
  variants: unknown;
  note: string | null;
  decided_by: string | null;
  decided_at: string;
  updated_at: string;
};

async function requireAdminEmail() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email) ? user.email : null;
}

// The full-table read + O(N²) name-similarity clustering is the most
// expensive computation in the admin (thousands of Damerau-Levenshtein
// comparisons across ~9k rows). It only changes when submissions or review
// decisions change, so cache the result per location filter for a short
// window (per warm serverless instance). The panel's explicit Refresh button
// and post-decision reloads send ?refresh=1 to bypass it.
const CLUSTERS_TTL_MS = 3 * 60 * 1000;
const clustersCache = new Map<string, { at: number; rows: Row[]; clusters: SuggestedCluster[] }>();

export async function GET(request: Request) {
  try {
    if (!(await requireAdminEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const locationFilter = searchParams.get("location")?.trim() || null;
    const forceRefresh = searchParams.get("refresh") === "1";
    const requestedNameKey =
      searchParams.get("name_key")?.trim()
      || (searchParams.get("q") ? actorLooseNameKey(searchParams.get("q") ?? "") : "");

    const sb = createAdminSupabaseClient();

    const cacheKey = locationFilter ?? "__all__";
    const cachedEntry = clustersCache.get(cacheKey);
    let rows: Row[];
    let allClustersUnfiltered: SuggestedCluster[];

    if (!forceRefresh && cachedEntry && Date.now() - cachedEntry.at < CLUSTERS_TTL_MS) {
      rows = cachedEntry.rows;
      allClustersUnfiltered = cachedEntry.clusters;
    } else {
    // Load row-level review decisions (migration 022). Empty when not migrated.
    const rowReviewMap = new Map<string, CourtActorRowReviewDecision>();
    {
      const { data, error } = await sb
        .from("court_actor_row_review")
        .select("row_id, decision");
      if (error) {
        const missing = error.code === "42P01"
          || error.code === "PGRST205"
          || /Could not find the table/i.test(error.message ?? "");
        if (!missing) {
          console.error("possible-matches row_review error:", error);
        }
      } else {
        for (const r of (data ?? []) as Array<{ row_id: string; decision: CourtActorRowReviewDecision }>) {
          rowReviewMap.set(r.row_id, r.decision);
        }
      }
    }

    const pageSize = 1000;
    rows = [];
    let includeLocationKey = true;

    // Page 0 probes whether location_key exists; remaining pages fetch in
    // parallel (the old loop awaited ~9 sequential 1000-row round trips).
    const buildQuery = (start: number, withLocation: boolean) => {
      const select = withLocation
        ? "id, role, name, court_or_county, state_code, location_key, notes, source, submission_id, created_at, survey_submissions(email, first_name, last_name, state_of_occurrence, outside_us_country, case_county, permission_to_share, approved)"
        : "id, role, name, court_or_county, state_code, notes, source, submission_id, created_at, survey_submissions(email, first_name, last_name, state_of_occurrence, outside_us_country, case_county, permission_to_share, approved)";
      let query = sb
        .from("court_actors")
        .select(select)
        .order("created_at", { ascending: false })
        .range(start, start + pageSize - 1);
      if (withLocation && locationFilter) {
        query = query.eq("location_key", locationFilter);
      }
      query = query.order("id", { ascending: false });
      return query;
    };

    let firstPage: Row[] = [];
    while (true) {
      const { data, error } = await buildQuery(0, includeLocationKey);
      if (error) {
        if (includeLocationKey && error.code === "42703") {
          includeLocationKey = false;
          continue;
        }
        console.error("possible-matches court_actors error:", error);
        return Response.json({ clusters: [], decisions: [], error: "Failed to load." }, { status: 500 });
      }
      firstPage = (data ?? []) as unknown as Row[];
      break;
    }
    const normalizeRow = (r: Row): Row => ({
      ...r,
      location_key: includeLocationKey ? r.location_key : null,
    });
    rows.push(...firstPage.map(normalizeRow));
    if (firstPage.length === pageSize) {
      let countQuery = sb.from("court_actors").select("id", { count: "exact", head: true });
      if (includeLocationKey && locationFilter) countQuery = countQuery.eq("location_key", locationFilter);
      const { count } = await countQuery;
      const total = count ?? 0;
      const pageStarts: number[] = [];
      for (let start = pageSize; start < total; start += pageSize) pageStarts.push(start);
      const pages = await Promise.all(pageStarts.map(start => buildQuery(start, includeLocationKey)));
      for (const page of pages) {
        if (page.error) {
          console.error("possible-matches court_actors page error:", page.error);
          return Response.json({ clusters: [], decisions: [], error: "Failed to load." }, { status: 500 });
        }
        rows.push(...((page.data ?? []) as unknown as Row[]).map(normalizeRow));
      }
    }

    let forClustering: ActorRowForClustering[] = rows.flatMap(r => {
      const submission = joinedSubmission(r);
      if (!isPublicShareableSubmission(submission)) return [];
      const reporterName = submission
        ? [submission.first_name, submission.last_name].filter(Boolean).join(" ") || null
        : null;
      return [{
        id: r.id,
        name: r.name,
        role: r.role,
        location_key: actorLocation(r),
        court_or_county: r.court_or_county,
        source: r.source,
        submission_id: r.submission_id,
        reporter_email: submission?.email ?? null,
        reporter_name: reporterName,
        reporter_case_county: submission?.case_county ?? null,
        notes: r.notes,
        created_at: r.created_at,
        review_decision: rowReviewMap.get(r.id) ?? null,
      }];
    });

    // Actor-detail and search views only need clusters near the queried name.
    // Clustering every variant in a large state was the main latency source.
    if (requestedNameKey) {
      const MAX_NAME_DISTANCE = 2;
      const nearKeys = new Set<string>();
      for (const row of forClustering) {
        const key = actorLooseNameKey(row.name);
        if (!key) continue;
        if (
          key === requestedNameKey
          || key.includes(requestedNameKey)
          || requestedNameKey.includes(key)
          || damerauLevenshtein(key, requestedNameKey) <= MAX_NAME_DISTANCE
        ) {
          nearKeys.add(key);
        }
      }
      if (nearKeys.size > 0) {
        forClustering = forClustering.filter(row => nearKeys.has(actorLooseNameKey(row.name)));
      }
    }

    allClustersUnfiltered = buildSuggestedClusters(forClustering, {
      onlyFormDirect: true,
    });
    clustersCache.set(cacheKey, { at: Date.now(), rows, clusters: allClustersUnfiltered });
    }
    const allClusters: SuggestedCluster[] = requestedNameKey
      ? allClustersUnfiltered.filter(cluster =>
        cluster.variants.some(variant =>
          variant.name_key === requestedNameKey
          || actorLooseNameKey(variant.display_name) === requestedNameKey
        )
      )
      : allClustersUnfiltered;

    const permissionBySubmissionId = new Map<string, string | null>();
    for (const row of rows) {
      const submission = joinedSubmission(row);
      permissionBySubmissionId.set(row.submission_id, submission?.permission_to_share ?? null);
    }

    // Load comment merges (migration 023) and enrich each cluster sample so
    // the UI can show "merged into" / "primary of merge" badges and pre-fill
    // the merge-comments modal. Pre-migration this loop is a no-op.
    {
      const mergesResult = await sb
        .from("court_actor_comment_merges")
        .select("primary_row_id, merged_row_ids, merged_comment");
      if (mergesResult.error) {
        const e = mergesResult.error;
        const missing = e.code === "42P01"
          || e.code === "PGRST205"
          || /Could not find the table/i.test(e.message ?? "");
        if (!missing) {
          console.error("possible-matches comment_merges error:", e);
        }
      } else {
        const byPrimary = new Map<string, { merged_row_ids: string[]; merged_comment: string }>();
        const byMerged = new Map<string, string>();
        for (const r of (mergesResult.data ?? []) as Array<{
          primary_row_id: string;
          merged_row_ids: string[];
          merged_comment: string;
        }>) {
          byPrimary.set(r.primary_row_id, {
            merged_row_ids: r.merged_row_ids ?? [],
            merged_comment: r.merged_comment,
          });
          for (const m of r.merged_row_ids ?? []) byMerged.set(m, r.primary_row_id);
        }
        for (const cluster of allClusters) {
          for (const variant of cluster.variants) {
            for (const sample of variant.samples) {
              const primary = byPrimary.get(sample.row_id);
              const mergedInto = byMerged.get(sample.row_id) ?? null;
              sample.merged_into = mergedInto;
              sample.merge_primary_for = primary?.merged_row_ids ?? null;
              sample.merged_comment = primary?.merged_comment ?? null;
            }
          }
        }
      }
    }

    // Load existing decisions so the UI can show resolved clusters
    // separately and so we can suppress already-decided suggestions.
    let decisions: AliasDecisionRecord[] = [];
    const decisionsResult = await sb
      .from("court_actor_alias_decisions")
      .select("cluster_key, location_key, decision, canonical_name, canonical_role, name_keys, variants, note, decided_by, decided_at, updated_at")
      .order("decided_at", { ascending: false });
    if (decisionsResult.error) {
      const e = decisionsResult.error;
      const missing = e.code === "42P01"
        || e.code === "PGRST205"
        || /Could not find the table/i.test(e.message ?? "");
      if (!missing) {
        console.error("alias_decisions select error:", e.message);
      }
    } else {
      decisions = (decisionsResult.data ?? []) as AliasDecisionRecord[];
    }

    if (locationFilter) {
      decisions = decisions.filter(d => (d.location_key ?? null) === locationFilter);
    }
    if (requestedNameKey) {
      decisions = decisions.filter(d => (d.name_keys ?? []).includes(requestedNameKey));
    }

    const decidedKeys = new Set(decisions.map(d => d.cluster_key));
    const pending = allClusters.filter(c => !decidedKeys.has(c.cluster_key));

    // Load research notes (migration 021). Pre-migration this returns
    // an empty list; the rest of the panel still loads.
    type ResearchRow = {
      id: string;
      cluster_key: string;
      location_key: string | null;
      name_keys: string[];
      note: string;
      source_url: string | null;
      created_by: string | null;
      created_at: string;
      updated_at: string;
    };
    let research: ResearchRow[] = [];
    let researchAvailable = true;
    const researchResult = await sb
      .from("court_actor_cluster_research")
      .select("id, cluster_key, location_key, name_keys, note, source_url, created_by, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (researchResult.error) {
      const e = researchResult.error;
      const missing = e.code === "42P01"
        || e.code === "PGRST205"
        || /Could not find the table/i.test(e.message ?? "");
      if (missing) {
        researchAvailable = false;
      } else {
        console.error("cluster_research select error:", e.message);
      }
    } else {
      research = (researchResult.data ?? []) as ResearchRow[];
    }

    const researchByCluster = new Map<string, ResearchRow[]>();
    for (const r of research) {
      const list = researchByCluster.get(r.cluster_key) ?? [];
      list.push(r);
      researchByCluster.set(r.cluster_key, list);
    }

    type ClusterWithResearch = SuggestedCluster & { research_notes: ResearchRow[] };
    const pendingWithResearch: ClusterWithResearch[] = pending.map(c => ({
      ...c,
      research_notes: researchByCluster.get(c.cluster_key) ?? [],
    }));

    const pendingWithResearchAndPermissions = pendingWithResearch.map(c => ({
      ...c,
      variants: c.variants.map(v => ({
        ...v,
        samples: v.samples.map(s => ({
          ...s,
          permission_to_share: permissionBySubmissionId.get(s.submission_id) ?? null,
        })),
      })),
    }));

    return Response.json({
      clusters: pendingWithResearchAndPermissions,
      decisions,
      cluster_count: allClusters.length,
      pending_count: pending.length,
      decided_count: decisions.length,
      research_available: researchAvailable,
    });
  } catch (err) {
    console.error("GET /api/admin/court-actors/possible-matches error:", err);
    return Response.json({ error: "Failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json();
    const decision = body?.decision;
    const clusterKey = typeof body?.cluster_key === "string" ? body.cluster_key.trim() : "";
    const locationKey = typeof body?.location_key === "string" && body.location_key.trim()
      ? body.location_key.trim()
      : null;
    const nameKeys = Array.isArray(body?.name_keys)
      ? Array.from(new Set((body.name_keys as unknown[]).map(k => String(k)).filter(Boolean)))
      : [];
    const canonicalName = typeof body?.canonical_name === "string" ? body.canonical_name.trim() : "";
    const canonicalRole = typeof body?.canonical_role === "string" && body.canonical_role.trim()
      ? normalizeCourtActorRoleLabel(body.canonical_role)
      : null;
    const note = typeof body?.note === "string" ? body.note.trim() : null;
    const variants = Array.isArray(body?.variants) ? body.variants : [];

    if (decision !== "same_actor" && decision !== "keep_separate") {
      return Response.json({ error: "decision must be 'same_actor' or 'keep_separate'." }, { status: 400 });
    }
    if (!clusterKey) {
      return Response.json({ error: "cluster_key is required." }, { status: 400 });
    }
    if (nameKeys.length < 2) {
      return Response.json({ error: "At least two variant name_keys are required." }, { status: 400 });
    }
    if (decision === "same_actor" && !canonicalName) {
      return Response.json({ error: "canonical_name is required when marking as the same actor." }, { status: 400 });
    }
    if (decision === "same_actor" && canonicalRole && !isCourtActorRoleOption(canonicalRole)) {
      return Response.json({ error: "canonical_role must be selected from the court actor role list." }, { status: 400 });
    }

    // Re-derive the cluster_key from the supplied name_keys + location to
    // protect against client tampering. If they differ, we trust the
    // server-derived value so decisions stay deterministic.
    const expectedKey = buildClusterKey(nameKeys, locationKey);
    const finalClusterKey = expectedKey || clusterKey;

    const sb = createAdminSupabaseClient();
    const { error } = await sb
      .from("court_actor_alias_decisions")
      .upsert(
        {
          cluster_key: finalClusterKey,
          location_key: locationKey,
          decision,
          canonical_name: decision === "same_actor" ? canonicalName : null,
          canonical_role: decision === "same_actor" ? canonicalRole : null,
          name_keys: nameKeys,
          variants,
          note,
          decided_by: adminEmail,
          decided_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cluster_key" },
      );
    if (error) {
      const missing = error.code === "42P01"
        || error.code === "PGRST205"
        || /Could not find the table/i.test(error.message ?? "");
      const message = missing
        ? "The court_actor_alias_decisions Supabase migration (020) needs to be run before decisions can save."
        : error.message;
      console.error("POST possible-matches upsert error:", error);
      return Response.json({ error: message }, { status: 500 });
    }

    after(() => refreshPublicActorCache(sb).catch(err => {
      console.error("public actor cache refresh failed after alias decision:", err);
    }));

    return Response.json({ success: true, cluster_key: finalClusterKey });
  } catch (err) {
    console.error("POST /api/admin/court-actors/possible-matches error:", err);
    return Response.json({ error: "Save failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const clusterKey = typeof body?.cluster_key === "string" ? body.cluster_key.trim() : "";
    if (!clusterKey) {
      return Response.json({ error: "cluster_key is required." }, { status: 400 });
    }

    const sb = createAdminSupabaseClient();
    const { error } = await sb
      .from("court_actor_alias_decisions")
      .delete()
      .eq("cluster_key", clusterKey);
    if (error) {
      console.error("DELETE possible-matches error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    after(() => refreshPublicActorCache(sb).catch(err => {
      console.error("public actor cache refresh failed after alias decision delete:", err);
    }));
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/court-actors/possible-matches error:", err);
    return Response.json({ error: "Delete failed." }, { status: 500 });
  }
}
