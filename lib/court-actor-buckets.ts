import "server-only";

import {
  actorBucketKeyWithLocation,
  publicActorRoleEntries,
  resolveFamilyKey,
  type CourtActorRowReviewDecision,
} from "./court-actors";
import { isCountableSubmission } from "./submission-public-visibility";
import { AliasResolver, type AliasDecisionRow } from "./court-actor-similarity";
import { createAdminSupabaseClient } from "./supabase-admin";

/**
 * Canonical court-actor bucketing — the single source of truth for "how many
 * distinct families named this court actor."
 *
 * Both the public registry API (`/api/survey/court-actors`) and the Connection
 * Circles matching layer (`lib/connection-circle-matching.ts`) must agree on
 * who counts as one family and which rows collapse into one person. Before this
 * helper existed, the circle did its OWN bespoke matching (exact role, no alias
 * awareness, state_code instead of location_key, raw-email dedup) and therefore
 * undercounted "other parents" relative to the public registry.
 *
 * This module mirrors the registry's authoritative path EXACTLY:
 *   1. Load rows from the `court_actors_public_safe` VIEW, `source = 'form_direct'`,
 *      paginated by `id` for stable range pagination.
 *   2. Apply admin same_actor decisions via AliasResolver (alias-aware).
 *   3. Skip admin-hidden submissions (admin_review_decisions) and rows whose
 *      submission is not countable (isCountableSubmission).
 *   4. Bucket by `actorBucketKeyWithLocation(effectiveName, role, location_key)`
 *      — role is intentionally ignored, so one person under multiple roles is
 *      ONE bucket.
 *   5. Dedup families per bucket via `resolveFamilyKey` (email|location, with
 *      row-review overrides), NOT raw email.
 *
 * A bucket's family count is `families.size`. The registry public list then
 * filters to `families.size >= COURT_ACTOR_PUBLIC_THRESHOLD`, but this helper
 * returns ALL buckets — the circle must surface a user's own actors even below
 * the public threshold (the user reported them, so it's their data to see).
 */

const FORM_DIRECT_ACTOR_SELECT = [
  "id",
  "role",
  "name",
  "court_or_county",
  "state_code",
  "location_key",
  "created_at",
  "submission_id",
  "email",
  "permission_to_share",
  "approved",
].join(", ");

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

export type CourtActorBucketRow = {
  id: string;
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  created_at: string;
  submission_id: string;
  email: string | null;
  permission_to_share: string | null;
  approved: boolean | null;
};

export type CourtActorFamilyMember = {
  // Family-dedup key (resolveFamilyKey output). Stable identity for the family.
  familyKey: string;
  // Reporter email when present (used by the circle to drive the request flow).
  email: string | null;
  // A representative submission id for the family.
  submission_id: string;
};

export type CourtActorBucket = {
  bucketKey: string;
  // Most-common original casing seen for this bucket's name.
  displayName: string;
  // Role summary string ("Judge / GAL" etc.) over every role this person was named under.
  roleSummary: string;
  // Per-role row counts, so callers can build their own role summaries if needed.
  roleCounts: Map<string, number>;
  state_code: string | null;
  location_key: string | null;
  court_or_county: string | null;
  latest_reported_at: string | null;
  // Distinct families that named this bucket. Map keyed by familyKey.
  families: Map<string, CourtActorFamilyMember>;
  // Distinct survey submissions that named this bucket. This is the number of
  // family reports (survey submissions) that named the actor, which is what the
  // public report cards, share slides, and PDF now display.
  submissionIds: Set<string>;
};

function actorLocation(row: CourtActorBucketRow): string | null {
  if (row.location_key?.trim()) {
    return row.location_key.trim();
  }
  const stateCode = row.state_code?.trim().toUpperCase();
  return stateCode || null;
}

function joinedSubmission(row: CourtActorBucketRow) {
  return {
    email: row.email,
    permission_to_share: row.permission_to_share,
    approved: row.approved,
  };
}

function mostFrequent<T>(m: Map<T, number>): T | null {
  let best: T | null = null;
  let max = 0;
  for (const [k, v] of Array.from(m.entries())) {
    if (v > max) {
      max = v;
      best = k;
    }
  }
  return best;
}

/**
 * Loads court_actor_row_review and returns row_id -> decision map.
 * Empty map (not null) when the migration has not been applied yet.
 */
export async function loadRowReviewMap(
  sb: AdminClient,
): Promise<Map<string, CourtActorRowReviewDecision>> {
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
 * Loads survey submissions an admin hid in reporting review. Those rows remain
 * in Supabase, but public actor counts and quotes must treat the linked
 * court_actors rows as hidden until the decision is cleared.
 */
export async function loadHiddenSubmissionIds(sb: AdminClient): Promise<Set<string>> {
  const { data, error } = await sb
    .from("admin_review_decisions")
    .select("source_id")
    .eq("source_table", "survey_submissions")
    .in("decision", ["superseded", "delete"]);
  if (error) {
    const missing = error.code === "42P01"
      || error.code === "42703"
      || error.code === "PGRST205"
      || /Could not find the table/i.test(error.message ?? "");
    if (missing) return new Set();
    console.error("admin_review_decisions hidden submission select error:", error.message);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .map(row => String((row as { source_id: string }).source_id))
      .filter(Boolean),
  );
}

/**
 * Loads admin same_actor decisions so counting picks up canonical names.
 * Without this, counts split by whatever spelling each family typed.
 */
export async function loadAliasResolver(sb: AdminClient): Promise<AliasResolver | null> {
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
 * Loads every form_direct court_actor row from the public-safe view, paginated
 * by primary key. A stable, unique sort key is REQUIRED for correct range
 * pagination — without it PostgREST can shift row order between page requests
 * and silently drop or duplicate rows near a page boundary.
 */
export async function loadFormDirectActorRows(sb: AdminClient): Promise<CourtActorBucketRow[]> {
  // Prefer the materialized view when it exists; it avoids re-computing the
  // public-safe CASE join on every paginated read.
  const table = await publicSafeTableName(sb);

  let from = 0;
  // Supabase/PostgREST caps the number of rows returned per request (default
  // 1000). The loop must continue until a batch returns fewer rows than the
  // page size; using a page size larger than the server limit would make every
  // batch look like the last one and silently truncate the data.
  const pageSize = 1000;
  const all: CourtActorBucketRow[] = [];
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select(FORM_DIRECT_ACTOR_SELECT)
      .eq("source", "form_direct")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as CourtActorBucketRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

let publicSafeTableCache: { table: string; checkedAt: number } | null = null;
async function publicSafeTableName(sb: AdminClient): Promise<string> {
  if (publicSafeTableCache && Date.now() - publicSafeTableCache.checkedAt < 60_000) {
    return publicSafeTableCache.table;
  }
  const table = "mv_court_actors_public_safe";
  try {
    const { error } = await sb.from(table).select("id", { head: true }).limit(1);
    if (!error || error.code === "PGRST116") {
      publicSafeTableCache = { table, checkedAt: Date.now() };
      return table;
    }
  } catch {
    // fall back
  }
  publicSafeTableCache = { table: "court_actors_public_safe", checkedAt: Date.now() };
  return "court_actors_public_safe";
}

export type BuildCourtActorBucketsInput = {
  rows: CourtActorBucketRow[];
  reviewMap: Map<string, CourtActorRowReviewDecision>;
  hiddenSubmissionIds: Set<string>;
  aliasResolver: AliasResolver | null;
};

function roleSummaryFromCounts(roleCounts: Map<string, number>): string {
  // Use the same role-label collapsing as the registry's roleSummary so the
  // circle's role string stays consistent with public surfaces.
  const sorted = publicActorRoleEntries(roleCounts);
  if (sorted.length === 0) return "Court Actor";
  if (sorted.length <= 3) return sorted.map(s => s[0]).join(" / ");
  const head = sorted.slice(0, 2).map(s => s[0]).join(" / ");
  const remaining = sorted.length - 2;
  return `${head} + ${remaining} more role${remaining === 1 ? "" : "s"}`;
}

/**
 * Pure bucketing over already-loaded rows + decisions. Mirrors the registry
 * route's loop exactly so its public output is reproducible from this helper.
 */
export function buildCourtActorBuckets(
  input: BuildCourtActorBucketsInput,
): Map<string, CourtActorBucket> {
  const { rows, reviewMap, hiddenSubmissionIds, aliasResolver } = input;
  const buckets = new Map<string, CourtActorBucket>();
  // Per-bucket casing/court frequency counters, kept out of the exported
  // bucket shape. Used only to pick the most-common display spelling/court.
  const casingCounts = new Map<string, Map<string, number>>();
  const courtCounts = new Map<string, Map<string, number>>();

  for (const a of rows) {
    if (!a.role || !a.name) continue;
    if (hiddenSubmissionIds.has(a.submission_id)) continue;
    if (!isCountableSubmission(joinedSubmission(a))) continue;
    const location = actorLocation(a);
    if (!location) continue;

    const fk = resolveFamilyKey({
      row_id: a.id,
      reporter_email: a.email ?? null,
      submission_id: a.submission_id,
      location_key: location,
      review_decision: reviewMap.get(a.id) ?? null,
    });
    // Skip rows the admin marked duplicate/submitter_hidden — testimony
    // preserved elsewhere, but contributes nothing to family counts.
    if (fk === null) continue;

    const aliasHit = aliasResolver?.resolve(a.name, location) ?? null;
    const effectiveName = aliasHit?.canonical_name ?? a.name;
    const bucketKey = actorBucketKeyWithLocation(effectiveName, a.role, location);
    if (!bucketKey.split("|")[0]) continue;

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        bucketKey,
        displayName: effectiveName,
        roleSummary: "Court Actor",
        roleCounts: new Map(),
        state_code: a.state_code,
        location_key: location,
        court_or_county: null,
        latest_reported_at: a.created_at ?? null,
        families: new Map(),
        submissionIds: new Set(),
      };
      buckets.set(bucketKey, bucket);
    }

    if (a.created_at && (!bucket.latest_reported_at || a.created_at > bucket.latest_reported_at)) {
      bucket.latest_reported_at = a.created_at;
    }

    if (!bucket.families.has(fk)) {
      bucket.families.set(fk, {
        familyKey: fk,
        email: a.email ?? null,
        submission_id: a.submission_id,
      });
    }

    bucket.submissionIds.add(a.submission_id);

    bucket.roleCounts.set(a.role, (bucket.roleCounts.get(a.role) ?? 0) + 1);

    // Track casing using the canonical name (when an alias hit) so all
    // spelling variants collapse to the admin-chosen casing.
    const casingName = aliasHit?.canonical_name ?? a.name;
    let casing = casingCounts.get(bucketKey);
    if (!casing) {
      casing = new Map();
      casingCounts.set(bucketKey, casing);
    }
    casing.set(casingName, (casing.get(casingName) ?? 0) + 1);
    if (a.court_or_county) {
      let court = courtCounts.get(bucketKey);
      if (!court) {
        court = new Map();
        courtCounts.set(bucketKey, court);
      }
      court.set(a.court_or_county, (court.get(a.court_or_county) ?? 0) + 1);
    }
  }

  // Finalize display name / role summary / court from the per-bucket counters.
  for (const [bucketKey, bucket] of buckets.entries()) {
    bucket.displayName = mostFrequent(casingCounts.get(bucketKey) ?? new Map()) ?? bucket.displayName;
    bucket.roleSummary = roleSummaryFromCounts(bucket.roleCounts);
    bucket.court_or_county = mostFrequent(courtCounts.get(bucketKey) ?? new Map());
  }

  return buckets;
}

/**
 * One-call convenience: load everything from the live DB and return the
 * canonical bucket map. Callers that need to share the loaded rows/decisions
 * across multiple computations can use the lower-level loaders + builder.
 */
export async function loadCourtActorBuckets(
  sb: AdminClient = createAdminSupabaseClient(),
): Promise<Map<string, CourtActorBucket>> {
  const rows = await loadFormDirectActorRows(sb);
  const [reviewMap, hiddenSubmissionIds, aliasResolver] = await Promise.all([
    loadRowReviewMap(sb),
    loadHiddenSubmissionIds(sb),
    loadAliasResolver(sb),
  ]);
  return buildCourtActorBuckets({ rows, reviewMap, hiddenSubmissionIds, aliasResolver });
}
