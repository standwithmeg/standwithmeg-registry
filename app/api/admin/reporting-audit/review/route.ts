import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../../lib/require-auth";

type SourceTable = "survey_submissions" | "legacy_submissions";

type ReviewRow = {
  id: string;
  source_table: SourceTable;
  data_source: string | null;
  created_at: string | null;
  imported_at: string | null;
  state: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  case_county: string | null;
  case_status: string | null;
  number_of_kids: number | null;
  system_affected: string | null;
  time_in_system: string | null;
  custody_status: string | null;
  is_pro_se: string | boolean | null;
  legal_rep_history: string | null;
  months_lost_parenting_time: number | null;
  total_financial_loss: number | string | null;
  impact_quote: string | null;
  permission_to_share: string | null;
  approved: boolean | null;
  family_key: string;
  dedupe_winner: boolean;
  review_decision: "keep" | "delete" | "count_separately" | null;
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

function familyKey(row: ReviewRow) {
  const email = normalizeEmail(row.email);
  return email ? `${email}|${row.state}` : `${row.source_table}:${row.id}`;
}

function countedFamilyCount(group: ReviewRow[]) {
  const countSeparately = group.filter(row => row.review_decision === "count_separately").length;
  const hasNormalDedupeRow = group.some(row => row.review_decision !== "count_separately");
  return countSeparately + (hasNormalDedupeRow ? 1 : 0);
}

function markDedupeWinners(groups: Iterable<ReviewRow[]>) {
  for (const group of groups) {
    for (const row of group) row.dedupe_winner = false;

    const separateRows = group.filter(row => row.review_decision === "count_separately");
    for (const row of separateRows) row.dedupe_winner = true;

    const normalRows = group
      .filter(row => row.review_decision !== "count_separately")
      .sort((a, b) => sourcePriority(a) - sourcePriority(b) || createdMs(b) - createdMs(a));

    if (normalRows[0]) normalRows[0].dedupe_winner = true;
  }
}

async function fetchReviewRows(state: string): Promise<ReviewRow[]> {
  const adminSupabase = createAdminSupabaseClient();

  const [surveyResult, legacyResult] = await Promise.all([
    adminSupabase
      .from("survey_submissions")
      .select("id,created_at,state_of_occurrence,outside_us_country,email,first_name,last_name,case_county,case_status,number_of_kids,system_affected,time_in_system,custody_status,is_pro_se,legal_rep_history,months_lost_parenting_time,total_financial_loss,impact_quote,permission_to_share,approved")
      .eq("state_of_occurrence", state),
    adminSupabase
      .from("legacy_submissions")
      .select("id,created_at,imported_at,state_of_occurrence,outside_us_country,email,first_name,last_name,case_county,case_status,number_of_kids,system_affected,time_in_system,custody_status,is_pro_se,legal_rep_history,months_lost_parenting_time,total_financial_loss,impact_quote,permission_to_share,data_source")
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
      time_in_system: row.time_in_system as string | null,
      custody_status: row.custody_status as string | null,
      is_pro_se: row.is_pro_se as string | boolean | null,
      legal_rep_history: row.legal_rep_history as string | null,
      months_lost_parenting_time: row.months_lost_parenting_time as number | null,
      total_financial_loss: row.total_financial_loss as number | string | null,
      impact_quote: row.impact_quote as string | null,
      permission_to_share: row.permission_to_share as string | null,
      approved: row.approved as boolean | null,
      family_key: "",
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
      time_in_system: row.time_in_system as string | null,
      custody_status: row.custody_status as string | null,
      is_pro_se: row.is_pro_se as string | boolean | null,
      legal_rep_history: row.legal_rep_history as string | null,
      months_lost_parenting_time: row.months_lost_parenting_time as number | null,
      total_financial_loss: row.total_financial_loss as number | string | null,
      impact_quote: row.impact_quote as string | null,
      permission_to_share: row.permission_to_share as string | null,
      approved: null,
      family_key: "",
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
      const bySource = new Map<string, { decision: "keep" | "delete" | "count_separately"; decided_at: string | null }>();
      for (const decision of (decisions ?? []) as Array<Record<string, unknown>>) {
        bySource.set(`${decision.source_table}:${decision.source_id}`, {
          decision: decision.decision as "keep" | "delete" | "count_separately",
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
    const group = byFamily.get(row.family_key) ?? [];
    group.push(row);
    byFamily.set(row.family_key, group);
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
    const groupsByFamily = new Map<string, ReviewRow[]>();
    for (const row of rows) {
      const group = groupsByFamily.get(row.family_key) ?? [];
      group.push(row);
      groupsByFamily.set(row.family_key, group);
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

    return Response.json({
      state,
      summary: {
        raw_rows: rows.length,
        deduped_families: dedupedFamilies,
        duplicate_groups: duplicateGroups.length,
        hidden_by_dedupe: rows.length - dedupedFamilies,
      },
      duplicate_groups: duplicateGroups,
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

    await adminSupabase
      .from("admin_review_decisions")
      .upsert({
        source_table,
        source_id: id,
        state: state || null,
        decision: "delete",
        decided_by: adminEmail,
        decided_at: new Date().toISOString(),
      }, { onConflict: "source_table,source_id" });

    const { error } = await adminSupabase
      .from(source_table as SourceTable)
      .delete()
      .eq("id", id);

    if (error) {
      console.error("DELETE /api/admin/reporting-audit/review error:", error);
      return Response.json({ error: error.message }, { status: 500 });
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
    if (decision !== "keep" && decision !== "count_separately") {
      return Response.json({ error: "Only keep or count_separately decisions can be saved here." }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();
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
