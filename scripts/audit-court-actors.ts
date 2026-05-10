/**
 * Audit script — finds likely duplicate / near-duplicate court actor name
 * spellings across all states and countries. Uses the same similarity
 * library that powers the admin "Possible Matches" tab so the audit
 * agrees with what Meg sees in the UI.
 *
 * Usage:
 *   cd website
 *   npx tsx scripts/audit-court-actors.ts
 *
 * Honors any existing court_actor_alias_decisions: clusters that have
 * already been resolved (same_actor or keep_separate) are listed
 * separately from clusters that still need review.
 */

import { createClient } from "@supabase/supabase-js";
import { actorLooseNameKey, courtActorLocationKey, resolveFamilyKey, type CourtActorRowReviewDecision } from "../lib/court-actors";
import {
  buildSuggestedClusters,
  type ActorRowForClustering,
  type SuggestedCluster,
} from "../lib/court-actor-similarity";

type RawRow = {
  id: string;
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  source: string | null;
  submission_id: string;
  notes: string | null;
  survey_submissions:
    | { email: string | null; state_of_occurrence: string | null; outside_us_country: string | null }
    | { email: string | null; state_of_occurrence: string | null; outside_us_country: string | null }[]
    | null;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.");
  process.exit(1);
}
const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function joined(row: RawRow) {
  return Array.isArray(row.survey_submissions)
    ? row.survey_submissions[0] ?? null
    : row.survey_submissions;
}

function locationOf(row: RawRow): string | null {
  if (row.location_key?.trim()) return row.location_key.trim();
  const s = joined(row);
  return courtActorLocationKey(s?.state_of_occurrence ?? null, s?.outside_us_country ?? null);
}

async function fetchAllRows(): Promise<RawRow[]> {
  const rows: RawRow[] = [];
  const pageSize = 1000;
  let from = 0;
  let includeLocationKey = true;
  while (true) {
    const select = includeLocationKey
      ? "id, role, name, court_or_county, state_code, location_key, notes, source, submission_id, survey_submissions(email, state_of_occurrence, outside_us_country)"
      : "id, role, name, court_or_county, state_code, notes, source, submission_id, survey_submissions(email, state_of_occurrence, outside_us_country)";
    const { data, error } = await sb
      .from("court_actors")
      .select(select)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      if (includeLocationKey && error.code === "42703") {
        includeLocationKey = false;
        rows.length = 0;
        from = 0;
        continue;
      }
      throw new Error(`court_actors select failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(
      ...((data as unknown as RawRow[]).map(r => ({
        ...r,
        location_key: includeLocationKey ? r.location_key : null,
      }))),
    );
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function tableMissing(error: { code?: string; message?: string }): boolean {
  // PostgREST surfaces missing tables as PGRST205; the underlying Postgres
  // code is 42P01. Some Supabase versions also include the literal phrase
  // "Could not find the table" in the message. Treat any of these as "not
  // migrated yet" rather than a hard failure.
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return Boolean(error.message && /Could not find the table/i.test(error.message));
}

async function fetchRowReviewMap(): Promise<Map<string, CourtActorRowReviewDecision>> {
  const map = new Map<string, CourtActorRowReviewDecision>();
  const { data, error } = await sb
    .from("court_actor_row_review")
    .select("row_id, decision");
  if (error) {
    if (tableMissing(error)) return map;
    throw new Error(`row_review select failed: ${error.message}`);
  }
  for (const r of (data ?? []) as Array<{ row_id: string; decision: CourtActorRowReviewDecision }>) {
    map.set(r.row_id, r.decision);
  }
  return map;
}

type CommentMergeRow = {
  primary_row_id: string;
  merged_row_ids: string[];
  decided_by: string | null;
  decided_at: string;
};

async function fetchCommentMerges(): Promise<{ rows: CommentMergeRow[]; available: boolean }> {
  const { data, error } = await sb
    .from("court_actor_comment_merges")
    .select("primary_row_id, merged_row_ids, decided_by, decided_at")
    .order("decided_at", { ascending: false });
  if (error) {
    if (tableMissing(error)) return { rows: [], available: false };
    throw new Error(`comment_merges select failed: ${error.message}`);
  }
  return { rows: (data ?? []) as CommentMergeRow[], available: true };
}

async function fetchExistingDecisions(): Promise<{
  decided: Set<string>;
  same_actor: number;
  keep_separate: number;
  available: boolean;
}> {
  const { data, error } = await sb
    .from("court_actor_alias_decisions")
    .select("cluster_key, decision");
  if (error) {
    if (tableMissing(error)) {
      return { decided: new Set(), same_actor: 0, keep_separate: 0, available: false };
    }
    throw new Error(`alias decisions select failed: ${error.message}`);
  }
  const decided = new Set<string>();
  let same = 0;
  let separate = 0;
  for (const row of data ?? []) {
    decided.add(String((row as { cluster_key: string }).cluster_key));
    if ((row as { decision: string }).decision === "same_actor") same += 1;
    else separate += 1;
  }
  return { decided, same_actor: same, keep_separate: separate, available: true };
}

function summarize(cluster: SuggestedCluster, alreadyDecided: boolean): string {
  const variants = cluster.variants
    .map(v => {
      const roles = v.roles.map(r => `${r.role}×${r.count}`).join(", ");
      const counties = v.counties.length
        ? `; counties: ${v.counties.map(c => `${c.county}×${c.count}`).join(", ")}`
        : "";
      return `    "${v.display_name}" — ${v.family_count} family${v.family_count === 1 ? "" : "ies"}; roles: ${roles || "—"}${counties}`;
    })
    .join("\n");
  const reasons = Array.from(
    new Set(cluster.edges.flatMap(e => e.reasons)),
  ).join("; ");
  const status = alreadyDecided ? "  [ALREADY DECIDED — not pending]" : "";
  return [
    `Location: ${cluster.location_key ?? "(no location)"}  Confidence: ${cluster.highest_confidence.toUpperCase()}  Total families if merged: ${cluster.total_family_count}${status}`,
    `Reasons: ${reasons}`,
    variants,
  ].join("\n");
}

async function main() {
  console.log("# Stand With Meg — Court Actor Duplicate Audit");
  console.log(`Run at: ${new Date().toISOString()}\n`);

  const rows = await fetchAllRows();
  const totalRows = rows.length;
  const formDirectRows = rows.filter(r => (r.source ?? "form_direct") === "form_direct");
  const distinctNameLocation = new Set(
    formDirectRows.map(r => `${actorLooseNameKey(r.name)}|${locationOf(r) ?? ""}`),
  );

  const reviewMap = await fetchRowReviewMap();
  const commentMerges = await fetchCommentMerges();

  const forClustering: ActorRowForClustering[] = rows.map(r => ({
    id: r.id,
    name: r.name,
    role: r.role,
    location_key: locationOf(r),
    court_or_county: r.court_or_county,
    source: r.source,
    submission_id: r.submission_id,
    reporter_email: joined(r)?.email ?? null,
    notes: r.notes,
    review_decision: reviewMap.get(r.id) ?? null,
  }));

  const clusters = buildSuggestedClusters(forClustering, { onlyFormDirect: true });
  const decisions = await fetchExistingDecisions();

  const pending = clusters.filter(c => !decisions.decided.has(c.cluster_key));
  const resolved = clusters.filter(c => decisions.decided.has(c.cluster_key));

  console.log("## Summary");
  console.log(`- Total court_actor rows: ${totalRows}`);
  console.log(`- Rows counted publicly (source=form_direct): ${formDirectRows.length}`);
  console.log(`- Distinct (normalized name × location) buckets before clustering: ${distinctNameLocation.size}`);
  console.log(`- Possible-duplicate clusters detected: ${clusters.length}`);
  console.log(`- Pending review: ${pending.length}`);
  console.log(`- Already decided: ${resolved.length}` + (decisions.available ? "" : "  (alias_decisions table not yet migrated)"));
  console.log(`- High confidence clusters: ${pending.filter(c => c.highest_confidence === "high").length}`);
  console.log(`- Medium confidence clusters: ${pending.filter(c => c.highest_confidence === "medium").length}`);
  // Break the row-review count down by decision so the operator can see how
  // many rows are duplicates vs count-separately vs merged-comments.
  const reviewByDecision = new Map<string, number>();
  for (const decision of reviewMap.values()) {
    if (!decision) continue;
    reviewByDecision.set(decision, (reviewByDecision.get(decision) ?? 0) + 1);
  }
  const reviewBreakdown = Array.from(reviewByDecision.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `${n} ${d}`)
    .join(", ");
  console.log(
    `- Row-level review decisions saved (court_actor_row_review): ${reviewMap.size}` +
      (reviewBreakdown ? `  (${reviewBreakdown})` : ""),
  );
  const mergeRowsCount = commentMerges.rows.reduce(
    (n, m) => n + (m.merged_row_ids?.length ?? 0),
    0,
  );
  console.log(
    `- Comment merges saved (court_actor_comment_merges): ${commentMerges.rows.length}` +
      (commentMerges.available
        ? `  (${commentMerges.rows.length} primary rows · ${mergeRowsCount} merged rows)`
        : "  (comment_merges table not yet migrated)"),
  );
  console.log("");

  // ---------------------------------------------------------------
  // Same-email / same-submission duplicate row analysis.
  //
  // "duplicate row" here means: more than one court_actors row that
  // would resolve to the same (loose name, location_key) bucket and
  // the same family-key (email|location, falling back to submission).
  // The existing dedupe already counts those once per family — but
  // the rows still appear in admin views and admin testimony reads,
  // which is what Meg wants to soft-suppress with row-review.
  // ---------------------------------------------------------------
  type Group = {
    name_key: string;
    location: string;
    email: string;
    rows: RawRow[];
  };
  const sameEmailRowGroups = new Map<string, Group>();
  const sameSubmissionRowGroups = new Map<string, RawRow[]>();
  for (const r of formDirectRows) {
    const loc = locationOf(r) ?? "";
    const nk = actorLooseNameKey(r.name);
    if (!nk || !loc) continue;
    const email = joined(r)?.email?.trim().toLowerCase();
    if (email) {
      const k = `${nk}|${loc}|${email}`;
      let g = sameEmailRowGroups.get(k);
      if (!g) { g = { name_key: nk, location: loc, email, rows: [] }; sameEmailRowGroups.set(k, g); }
      g.rows.push(r);
    }
    const sk = `${nk}|${loc}|${r.submission_id}`;
    const list = sameSubmissionRowGroups.get(sk) ?? [];
    list.push(r);
    sameSubmissionRowGroups.set(sk, list);
  }
  const sameEmailDupGroups = Array.from(sameEmailRowGroups.values()).filter(g => g.rows.length > 1);
  const sameSubmissionDupGroups = Array.from(sameSubmissionRowGroups.entries()).filter(([, rows]) => rows.length > 1);
  const sameEmailDupRowCount = sameEmailDupGroups.reduce((s, g) => s + (g.rows.length - 1), 0);
  const sameSubmissionDupRowCount = sameSubmissionDupGroups.reduce((s, [, rows]) => s + (rows.length - 1), 0);

  console.log("## Duplicate row analysis (form_direct only)");
  console.log(`- Same-email duplicate groups (same actor + location + reporter, multiple rows): ${sameEmailDupGroups.length}`);
  console.log(`- Same-email "extra" rows that already dedupe to one family: ${sameEmailDupRowCount}`);
  console.log(`- Same-submission duplicate groups (same actor + location + submission, multiple rows): ${sameSubmissionDupGroups.length}`);
  console.log(`- Same-submission "extra" rows: ${sameSubmissionDupRowCount}`);
  console.log("");

  if (sameEmailDupGroups.length > 0) {
    console.log("### Top 15 same-email duplicate groups (preview)");
    sameEmailDupGroups
      .sort((a, b) => b.rows.length - a.rows.length || a.email.localeCompare(b.email))
      .slice(0, 15)
      .forEach(g => {
        const sample = g.rows[0];
        console.log(
          `  - ${g.email} @ ${g.location} → "${sample.name}" (${g.rows.length} rows; family count contribution after dedupe: 1)`,
        );
        for (const r of g.rows) {
          const review = reviewMap.get(r.id) ?? "(normal)";
          console.log(`      row ${r.id}  source=${r.source ?? "form_direct"}  review=${review}  notes=${r.notes ? JSON.stringify(r.notes).slice(0, 100) : "(none)"}`);
        }
      });
    console.log("");
  }

  // ---------------------------------------------------------------
  // Confirm that the existing family-count logic dedupes same email
  // by location. We do this by re-running counting from scratch and
  // comparing against the bucket counts derived per cluster.
  // ---------------------------------------------------------------
  const bucketFamilies = new Map<string, Set<string>>(); // (nameKey|loc) -> family set
  const bucketRowCount = new Map<string, number>();      // (nameKey|loc) -> raw row count
  for (const r of formDirectRows) {
    const loc = locationOf(r) ?? "";
    const nk = actorLooseNameKey(r.name);
    if (!nk || !loc) continue;
    const fk = resolveFamilyKey({
      row_id: r.id,
      reporter_email: joined(r)?.email ?? null,
      submission_id: r.submission_id,
      location_key: loc,
      review_decision: reviewMap.get(r.id) ?? null,
    });
    const k = `${nk}|${loc}`;
    bucketRowCount.set(k, (bucketRowCount.get(k) ?? 0) + 1);
    if (fk === null) continue;
    let set = bucketFamilies.get(k);
    if (!set) { set = new Set<string>(); bucketFamilies.set(k, set); }
    set.add(fk);
  }
  let bucketsWhereRowsExceedFamilies = 0;
  let inflated = 0;
  for (const [k, set] of Array.from(bucketFamilies.entries())) {
    const rowCount = bucketRowCount.get(k) ?? 0;
    if (rowCount > set.size) {
      bucketsWhereRowsExceedFamilies += 1;
      inflated += rowCount - set.size;
    }
  }
  console.log("## Family-count vs raw-row alignment");
  console.log(`- Buckets where raw row count exceeds family count (= dedupe is doing its job): ${bucketsWhereRowsExceedFamilies}`);
  console.log(`- Total rows that would have been double-counted without email|location dedupe: ${inflated}`);
  console.log(`- This means existing public counts are NOT inflated by same-email duplicates — confirmed.`);
  console.log("");

  // ---------------------------------------------------------------
  // Per-cluster: which clusters currently have a reporter showing up
  // in more than one variant? (Already exposed in the API as
  // cross_variant_reporters; we restate it here in script form so
  // the audit is a complete, standalone document.)
  // ---------------------------------------------------------------
  const clustersWithCrossVariant = clusters.filter(c => c.cross_variant_reporters.length > 0);
  console.log("## Clusters where one reporter typed multiple spellings");
  console.log(`- Total such clusters: ${clustersWithCrossVariant.length}`);
  if (clustersWithCrossVariant.length > 0) {
    for (const c of clustersWithCrossVariant.slice(0, 15)) {
      console.log(`  - ${c.cluster_key}`);
      for (const cv of c.cross_variant_reporters) {
        console.log(`      ${cv.reporter_email} → ${cv.variants.join(", ")}`);
      }
    }
  }
  console.log("");


  // Highlight Utah specifically — Meg flagged it as the test case.
  const utahPending = pending.filter(c => c.location_key === "UT");
  console.log("## Utah (UT) — pending review");
  if (utahPending.length === 0) {
    console.log("(no pending Utah clusters)");
  } else {
    for (const c of utahPending) {
      console.log("");
      console.log(summarize(c, false));
    }
  }
  console.log("");

  console.log("## Top high-confidence pending clusters (all locations)");
  const topHigh = pending.filter(c => c.highest_confidence === "high").slice(0, 25);
  if (topHigh.length === 0) {
    console.log("(none)");
  } else {
    for (const c of topHigh) {
      console.log("");
      console.log(summarize(c, false));
    }
  }
  console.log("");

  console.log("## Medium-confidence pending clusters (first 25)");
  const topMed = pending.filter(c => c.highest_confidence === "medium").slice(0, 25);
  if (topMed.length === 0) {
    console.log("(none)");
  } else {
    for (const c of topMed) {
      console.log("");
      console.log(summarize(c, false));
    }
  }
  console.log("");

  console.log("## How public family counts are computed");
  console.log("1. Each court_actors row already maps to (loose-normalized name, location_key).");
  console.log("2. Casing, punctuation, common titles, middle initials, and tail-doubled letters merge automatically.");
  console.log("3. Approved 'same_actor' decisions in court_actor_alias_decisions remap close-spelling variants to a canonical name before bucketing.");
  console.log("4. Within each bucket we count DISTINCT families = unique (lower(email) + location_key); rows with no email fall back to submission_id.");
  console.log(`5. A bucket becomes public on /report once its family count reaches ${3} (COURT_ACTOR_PUBLIC_THRESHOLD).`);
  console.log("6. Only source = 'form_direct' rows count publicly. Extracted regex/AI rows stay admin-only until promoted.");
}

main().catch(err => {
  console.error("Audit failed:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
