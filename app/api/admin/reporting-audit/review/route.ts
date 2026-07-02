import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../../lib/require-auth";
import { dedupeFamilyKey, isPlaceholderEmail } from "../../../../../lib/placeholder-emails";

type SourceTable = "survey_submissions" | "legacy_submissions";
type ReviewDecision = "keep" | "delete" | "count_separately" | "superseded";

type ReviewRow = {
  id: string;
  source_table: SourceTable;
  data_source: string | null;
  created_at: string | null;
  imported_at: string | null;
  state: string;
  email: string | null;
  is_placeholder_email: boolean;
  first_name: string | null;
  last_name: string | null;
  case_county: string | null;
  case_status: string | null;
  number_of_kids: number | null;
  system_affected: string | null;
  allegation_type: string | null;
  time_in_system: string | null;
  custody_status: string | null;
  is_pro_se: string | boolean | null;
  legal_rep_history: string | null;
  months_lost_parenting_time: number | null;
  total_financial_loss: number | string | null;
  attorney_fees: number | null;
  gal_fees: number | null;
  therapy_eval_fees: number | null;
  reunification_fees: number | null;
  other_court_actors_fees: number | null;
  lost_wages: number | null;
  asset_liquidation_loss: number | null;
  impact_quote: string | null;
  permission_to_share: string | null;
  approved: boolean | null;
  family_key: string;
  dedupe_winner: boolean;
  review_decision: ReviewDecision | null;
  reviewed_at: string | null;
};

async function requireAdminEmail() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email) ? user.email : null;
}

function normalizeState(value: string | null) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeEmail(value: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function stateFrom(row: { state_of_occurrence: string | null; outside_us_country?: string | null }) {
  return normalizeState(row.state_of_occurrence) || String(row.outside_us_country ?? "").trim();
}

function createdMs(row: { created_at: string | null }) {
  const ms = row.created_at ? Date.parse(row.created_at) : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function sourcePriority(row: ReviewRow) {
  return row.source_table === "survey_submissions" ? 0 : 1;
}

function normalizeCourtType(value: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ") || "unknown";
}

function auditFamilyGroupKey(row: ReviewRow) {
  return `${row.family_key}|court_type:${normalizeCourtType(row.system_affected)}`;
}

function isExcludedDecision(decision: ReviewRow["review_decision"]) {
  return decision === "delete" || decision === "superseded";
}

function familyKey(row: ReviewRow) {
  // Placeholder emails (anonymous@anonymous.com, n/a, test@test.com, etc)
  // are unsafe for automatic dedupe — multiple unrelated families use
  // them, and the (email, state) key would silently collapse them. Use
  // the shared helper so dedupe behavior matches across review API,
  // SQL views (migration 022), and the Python PDF loader.
  return dedupeFamilyKey({
    email: row.email,
    state: row.state,
    sourceTable: row.source_table,
    sourceId: row.id,
  });
}

function placeholderGroupKey(row: ReviewRow): string | null {
  // Used for the separate "placeholder email" review section. Rows that
  // share the same placeholder email + state are grouped here so admin
  // can still see and merge them by hand if they actually are one
  // family — but they no longer auto-collide via familyKey().
  const email = normalizeEmail(row.email);
  if (!isPlaceholderEmail(email)) return null;
  return `placeholder:${email}|${row.state}`;
}

const FINGERPRINT_FEE_FIELDS = [
  "attorney_fees",
  "gal_fees",
  "therapy_eval_fees",
  "reunification_fees",
  "other_court_actors_fees",
  "lost_wages",
  "asset_liquidation_loss",
] as const;

function fingerprintGroupKey(row: ReviewRow): string | null {
  // Mirrors the financial-fingerprint logic in migration 020 and the
  // Python PDF dedup. Returns null when the row has no non-zero
  // financial signal — those rows can't be confidently identified as
  // financial-twins. Skips rows already covered by a same-email
  // collision so admin doesn't review them twice.
  let hasSignal = false;
  const parts: string[] = [];
  for (const f of FINGERPRINT_FEE_FIELDS) {
    const v = row[f];
    const n = v === null || v === undefined ? null : Number(v);
    if (n === null || !Number.isFinite(n)) {
      parts.push("");
      continue;
    }
    if (n > 0) hasSignal = true;
    parts.push(n.toFixed(2));
  }
  const months = row.months_lost_parenting_time;
  if (months !== null && months !== undefined && Number(months) > 0) hasSignal = true;
  parts.push(months === null || months === undefined ? "" : String(months));
  if (!hasSignal) return null;
  const stateUs = String(row.state ?? "").trim().toUpperCase();
  const county = String(row.case_county ?? "").trim().toLowerCase();
  return `fp:${stateUs}|${county}|${parts.join("|")}`;
}

function countedFamilyCount(group: ReviewRow[]) {
  const countSeparately = group.filter(row => row.review_decision === "count_separately").length;
  const hasNormalDedupeRow = group.some(row => row.review_decision !== "count_separately" && !isExcludedDecision(row.review_decision));
  return countSeparately + (hasNormalDedupeRow ? 1 : 0);
}

function markDedupeWinners(groups: Iterable<ReviewRow[]>) {
  for (const group of groups) {
    for (const row of group) row.dedupe_winner = false;

    const separateRows = group.filter(row => row.review_decision === "count_separately");
    for (const row of separateRows) row.dedupe_winner = true;

    const normalRows = group
      .filter(row => row.review_decision !== "count_separately" && !isExcludedDecision(row.review_decision))
      .sort((a, b) => sourcePriority(a) - sourcePriority(b) || createdMs(b) - createdMs(a));

    if (normalRows[0]) normalRows[0].dedupe_winner = true;
  }
}

async function fetchReviewRows(state: string): Promise<ReviewRow[]> {
  const adminSupabase = createAdminSupabaseClient();

  const [surveyResult, legacyResult] = await Promise.all([
    adminSupabase
      .from("survey_submissions")
      .select("id,created_at,state_of_occurrence,outside_us_country,email,first_name,last_name,case_county,case_status,number_of_kids,system_affected,allegation_type,time_in_system,custody_status,is_pro_se,legal_rep_history,months_lost_parenting_time,total_financial_loss,attorney_fees,gal_fees,therapy_eval_fees,reunification_fees,other_court_actors_fees,lost_wages,asset_liquidation_loss,impact_quote,permission_to_share,approved")
      .eq("state_of_occurrence", state),
    adminSupabase
      .from("legacy_submissions")
      .select("id,created_at,imported_at,state_of_occurrence,outside_us_country,email,first_name,last_name,case_county,case_status,number_of_kids,system_affected,allegation_type,time_in_system,custody_status,is_pro_se,legal_rep_history,months_lost_parenting_time,total_financial_loss,attorney_fees,gal_fees,therapy_eval_fees,reunification_fees,other_court_actors_fees,lost_wages,asset_liquidation_loss,impact_quote,permission_to_share,data_source")
      .eq("state_of_occurrence", state),
  ]);

  if (surveyResult.error) throw surveyResult.error;
  if (legacyResult.error) throw legacyResult.error;

  const rows: ReviewRow[] = [
    ...((surveyResult.data ?? []) as Array<Record<string, unknown>>).map(row => ({
      id: String(row.id),
      source_table: "survey_submissions" as const,
      data_source: "current_survey",
      created_at: row.created_at as string | null,
      imported_at: null,
      state: stateFrom(row as { state_of_occurrence: string | null; outside_us_country?: string | null }),
      email: row.email as string | null,
      first_name: row.first_name as string | null,
      last_name: row.last_name as string | null,
      case_county: row.case_county as string | null,
      case_status: row.case_status as string | null,
      number_of_kids: row.number_of_kids as number | null,
      system_affected: row.system_affected as string | null,
      allegation_type: row.allegation_type as string | null,
      time_in_system: row.time_in_system as string | null,
      custody_status: row.custody_status as string | null,
      is_pro_se: row.is_pro_se as string | boolean | null,
      legal_rep_history: row.legal_rep_history as string | null,
      months_lost_parenting_time: row.months_lost_parenting_time as number | null,
      total_financial_loss: row.total_financial_loss as number | string | null,
      attorney_fees: row.attorney_fees as number | null,
      gal_fees: row.gal_fees as number | null,
      therapy_eval_fees: row.therapy_eval_fees as number | null,
      reunification_fees: row.reunification_fees as number | null,
      other_court_actors_fees: row.other_court_actors_fees as number | null,
      lost_wages: row.lost_wages as number | null,
      asset_liquidation_loss: row.asset_liquidation_loss as number | null,
      impact_quote: row.impact_quote as string | null,
      permission_to_share: row.permission_to_share as string | null,
      approved: row.approved as boolean | null,
      family_key: "",
      is_placeholder_email: isPlaceholderEmail(row.email as string | null),
      dedupe_winner: false,
      review_decision: null,
      reviewed_at: null,
    })),
    ...((legacyResult.data ?? []) as Array<Record<string, unknown>>).map(row => ({
      id: String(row.id),
      source_table: "legacy_submissions" as const,
      data_source: row.data_source as string | null,
      created_at: row.created_at as string | null,
      imported_at: row.imported_at as string | null,
      state: stateFrom(row as { state_of_occurrence: string | null; outside_us_country?: string | null }),
      email: row.email as string | null,
      first_name: row.first_name as string | null,
      last_name: row.last_name as string | null,
      case_county: row.case_county as string | null,
      case_status: row.case_status as string | null,
      number_of_kids: row.number_of_kids as number | null,
      system_affected: row.system_affected as string | null,
      allegation_type: row.allegation_type as string | null,
      time_in_system: row.time_in_system as string | null,
      custody_status: row.custody_status as string | null,
      is_pro_se: row.is_pro_se as string | boolean | null,
      legal_rep_history: row.legal_rep_history as string | null,
      months_lost_parenting_time: row.months_lost_parenting_time as number | null,
      total_financial_loss: row.total_financial_loss as number | string | null,
      attorney_fees: row.attorney_fees as number | null,
      gal_fees: row.gal_fees as number | null,
      therapy_eval_fees: row.therapy_eval_fees as number | null,
      reunification_fees: row.reunification_fees as number | null,
      other_court_actors_fees: row.other_court_actors_fees as number | null,
      lost_wages: row.lost_wages as number | null,
      asset_liquidation_loss: row.asset_liquidation_loss as number | null,
      impact_quote: row.impact_quote as string | null,
      permission_to_share: row.permission_to_share as string | null,
      approved: null,
      family_key: "",
      is_placeholder_email: isPlaceholderEmail(row.email as string | null),
      dedupe_winner: false,
      review_decision: null,
      reviewed_at: null,
    })),
  ].filter(row => row.state === state);

  for (const row of rows) row.family_key = familyKey(row);

  if (rows.length > 0) {
    const { data: decisions, error: decisionsError } = await adminSupabase
      .from("admin_review_decisions")
      .select("source_table,source_id,decision,decided_at")
      .in("source_id", rows.map(row => row.id));

    // The app should still load before migration 013 is applied. Keep actions
    // will return a clear error until the table exists.
    if (!decisionsError) {
      const bySource = new Map<string, { decision: ReviewDecision; decided_at: string | null }>();
      for (const decision of (decisions ?? []) as Array<Record<string, unknown>>) {
        bySource.set(`${decision.source_table}:${decision.source_id}`, {
          decision: decision.decision as ReviewDecision,
          decided_at: decision.decided_at as string | null,
        });
      }
      for (const row of rows) {
        const decision = bySource.get(`${row.source_table}:${row.id}`);
        if (!decision) continue;
        row.review_decision = decision.decision;
        row.reviewed_at = decision.decided_at;
      }
    } else if (decisionsError.code !== "42P01") {
      console.error("admin_review_decisions select error:", decisionsError.message);
    }
  }

  const byFamily = new Map<string, ReviewRow[]>();
  for (const row of rows) {
    const key = auditFamilyGroupKey(row);
    const group = byFamily.get(key) ?? [];
    group.push(row);
    byFamily.set(key, group);
  }

  markDedupeWinners(byFamily.values());

  rows.sort((a, b) => createdMs(b) - createdMs(a));
  return rows;
}

export async function GET(request: Request) {
  try {
    if (!(await requireAdminEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const state = normalizeState(searchParams.get("state"));
    if (!/^[A-Z]{2}$/.test(state)) {
      return Response.json({ error: "Valid state is required." }, { status: 400 });
    }

    const rows = await fetchReviewRows(state);
    const autoSeparateCourtTypeRows = new Set<string>();
    const rowsByEmailState = new Map<string, ReviewRow[]>();
    for (const row of rows) {
      const group = rowsByEmailState.get(row.family_key) ?? [];
      group.push(row);
      rowsByEmailState.set(row.family_key, group);
    }
    for (const group of rowsByEmailState.values()) {
      const courtTypes = new Set(group.map(row => normalizeCourtType(row.system_affected)));
      if (group.length > 1 && courtTypes.size > 1) {
        for (const row of group) autoSeparateCourtTypeRows.add(`${row.source_table}:${row.id}`);
      }
    }

    const groupsByFamily = new Map<string, ReviewRow[]>();
    for (const row of rows) {
      const group = groupsByFamily.get(auditFamilyGroupKey(row)) ?? [];
      group.push(row);
      groupsByFamily.set(auditFamilyGroupKey(row), group);
    }

    const duplicateGroups = [...groupsByFamily.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([family_key, group]) => ({
        family_key,
        email: group.find(row => row.email)?.email ?? null,
        rows: group.sort((a, b) => sourcePriority(a) - sourcePriority(b) || createdMs(b) - createdMs(a)),
      }))
      .sort((a, b) => b.rows.length - a.rows.length || String(a.email ?? "").localeCompare(String(b.email ?? "")));
    const dedupedFamilies = [...groupsByFamily.values()].reduce(
      (sum, group) => sum + countedFamilyCount(group),
      0
    );

    // Placeholder-email groups: surfaced separately so admin can see
    // which "anonymous" rows share a placeholder address. By default
    // these rows are NOT auto-deduped (each gets its own family_key),
    // so they do not appear in duplicateGroups above. If two of them
    // really are one family, admin can use Merge group to combine.
    const placeholderBuckets = new Map<string, ReviewRow[]>();
    for (const row of rows) {
      const key = placeholderGroupKey(row);
      if (!key) continue;
      const list = placeholderBuckets.get(key) ?? [];
      list.push(row);
      placeholderBuckets.set(key, list);
    }
    const placeholderEmailGroups = [...placeholderBuckets.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([family_key, group]) => ({
        family_key,
        email: group.find(row => row.email)?.email ?? null,
        rows: group.sort((a, b) => sourcePriority(a) - sourcePriority(b) || createdMs(b) - createdMs(a)),
      }))
      .sort((a, b) => b.rows.length - a.rows.length || String(a.email ?? "").localeCompare(String(b.email ?? "")));

    // Financial-fingerprint groups: rows that share state + county + the
    // 7-fee vector + months_lost. These are exactly the rows migration
    // 020 (held) would auto-collapse. We surface them here so admin
    // reviews each one with case-type fields visible BEFORE 020 is
    // applied — critical because identical financials can come from
    // (a) the same person submitted twice (real duplicate) or
    // (b) the same person with two real cases like CPS + family court
    // (must be marked count_separately). Skip groups already covered
    // by same-email or placeholder-email collisions to avoid duplicate
    // review work.
    const sameEmailRowKeys = new Set<string>();
    for (const g of duplicateGroups) for (const r of g.rows) sameEmailRowKeys.add(`${r.source_table}:${r.id}`);
    const placeholderRowKeys = new Set<string>();
    for (const g of placeholderEmailGroups) for (const r of g.rows) placeholderRowKeys.add(`${r.source_table}:${r.id}`);

    const fingerprintBuckets = new Map<string, ReviewRow[]>();
    for (const row of rows) {
      const rowKey = `${row.source_table}:${row.id}`;
      if (autoSeparateCourtTypeRows.has(rowKey)) continue;
      if (sameEmailRowKeys.has(rowKey) || placeholderRowKeys.has(rowKey)) continue;
      const fpKey = fingerprintGroupKey(row);
      if (!fpKey) continue;
      const list = fingerprintBuckets.get(fpKey) ?? [];
      list.push(row);
      fingerprintBuckets.set(fpKey, list);
    }
    const financialFingerprintGroups = [...fingerprintBuckets.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([family_key, group]) => ({
        family_key,
        email: group.find(row => row.email)?.email ?? null,
        rows: group.sort((a, b) => sourcePriority(a) - sourcePriority(b) || createdMs(b) - createdMs(a)),
      }))
      .sort((a, b) => b.rows.length - a.rows.length || a.family_key.localeCompare(b.family_key));

    return Response.json({
      state,
      summary: {
        raw_rows: rows.length,
        deduped_families: dedupedFamilies,
        duplicate_groups: duplicateGroups.length,
        hidden_by_dedupe: rows.length - dedupedFamilies,
        placeholder_email_groups: placeholderEmailGroups.length,
        financial_fingerprint_groups: financialFingerprintGroups.length,
      },
      duplicate_groups: duplicateGroups,
      placeholder_email_groups: placeholderEmailGroups,
      financial_fingerprint_groups: financialFingerprintGroups,
      rows,
    });
  } catch (err) {
    console.error("GET /api/admin/reporting-audit/review error:", err);
    return Response.json({ error: "Failed to load review data." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { id, source_table, state: bodyState } = await request.json();
    if (!id || (source_table !== "survey_submissions" && source_table !== "legacy_submissions")) {
      return Response.json({ error: "id and valid source_table are required." }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();
    const state = normalizeState(String(bodyState ?? ""));

    const { error } = await adminSupabase
      .from("admin_review_decisions")
      .upsert({
        source_table,
        source_id: id,
        state: state || null,
        decision: "delete",
        decided_by: adminEmail,
        decided_at: new Date().toISOString(),
      }, { onConflict: "source_table,source_id" });

    if (error) {
      console.error("DELETE /api/admin/reporting-audit/review soft-delete error:", error);
      const message = error.code === "42P01"
        ? "The admin_review_decisions Supabase migration needs to be run before review decisions can save."
        : error.message;
      return Response.json({ error: message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/reporting-audit/review error:", err);
    return Response.json({ error: "Delete failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { id, source_table, state, decision } = await request.json();
    if (!id || (source_table !== "survey_submissions" && source_table !== "legacy_submissions")) {
      return Response.json({ error: "id and valid source_table are required." }, { status: 400 });
    }
    if (decision !== null && decision !== "keep" && decision !== "count_separately" && decision !== "superseded") {
      return Response.json({ error: "Only keep, count_separately, superseded, or restore decisions can be saved here." }, { status: 400 });
    }
    if (decision === "superseded" && source_table !== "survey_submissions") {
      return Response.json({ error: "Only survey_submissions rows can be marked superseded." }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();
    if (decision === null) {
      const { error } = await adminSupabase
        .from("admin_review_decisions")
        .delete()
        .eq("source_table", source_table)
        .eq("source_id", id);

      if (error) {
        console.error("PATCH /api/admin/reporting-audit/review restore error:", error);
        const message = error.code === "42P01"
          ? "The admin_review_decisions Supabase migration needs to be run before review decisions can save."
          : error.message;
        return Response.json({ error: message }, { status: 500 });
      }

      return Response.json({ success: true });
    }

    const { error } = await adminSupabase
      .from("admin_review_decisions")
      .upsert({
        source_table,
        source_id: id,
        state: normalizeState(String(state ?? "")) || null,
        decision,
        decided_by: adminEmail,
        decided_at: new Date().toISOString(),
      }, { onConflict: "source_table,source_id" });

    if (error) {
      console.error("PATCH /api/admin/reporting-audit/review error:", error);
      const message = error.code === "42P01"
        ? "The admin_review_decisions Supabase migration needs to be run before review decisions can save."
        : error.message;
      return Response.json({ error: message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/admin/reporting-audit/review error:", err);
    return Response.json({ error: "Save failed." }, { status: 500 });
  }
}
