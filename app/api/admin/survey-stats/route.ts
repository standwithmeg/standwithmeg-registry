import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../lib/require-auth";
import { queueStateRegeneration } from "../../../../lib/state-regeneration";
import { refreshPublicActorCache } from "../../survey/court-actors/route";
import {
  normalizeOutsideCountryForReporting,
  reportingLocationFromParts,
} from "../../../../lib/survey-location";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

type FinancialRow = {
  id: string;
  state_of_occurrence: string | null;
  outside_us_country: string | null;
  email: string | null;
  total_financial_loss: number | string | null;
  created_at: string | null;
  _src?: number;
  _idx?: number;
  _table?: "survey_submissions" | "legacy_submissions";
};

async function fetchAllFinancialRows(
  supabase: SupabaseClient,
  table: "survey_submissions" | "legacy_submissions"
): Promise<FinancialRow[]> {
  const pageSize = 1000;
  const select = "id,state_of_occurrence,outside_us_country,email,total_financial_loss,created_at";

  // Count first, then fetch every page in parallel — the old serial loop cost
  // one round trip per 1000 rows on the dashboard's blocking path.
  const { count, error: countError } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  if (countError) throw countError;
  const total = count ?? 0;
  if (total === 0) return [];

  const pageStarts: number[] = [];
  for (let start = 0; start < total; start += pageSize) pageStarts.push(start);
  const pages = await Promise.all(pageStarts.map(start =>
    supabase.from(table).select(select).range(start, start + pageSize - 1)
  ));

  const rows: FinancialRow[] = [];
  for (const page of pages) {
    if (page.error) throw page.error;
    rows.push(...((page.data ?? []) as FinancialRow[]));
  }
  return rows;
}

async function fetchCountSeparatelyKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("admin_review_decisions")
    .select("source_table,source_id")
    .eq("decision", "count_separately");

  // Keep older deployments usable before migration 013/014 is applied.
  if (error?.code === "42P01") return new Set();
  if (error) throw error;

  return new Set(
    ((data ?? []) as Array<{ source_table: string; source_id: string }>)
      .map(row => `${row.source_table}:${row.source_id}`)
  );
}

function rowState(row: FinancialRow): string {
  return reportingLocationFromParts(row.state_of_occurrence, row.outside_us_country);
}

function createdMs(row: FinancialRow): number {
  const t = row.created_at ? Date.parse(row.created_at) : 0;
  return Number.isFinite(t) ? t : 0;
}

// The deduped denominator scans survey_submissions + legacy_submissions in
// full (~18k rows) and only feeds the average-loss card, so cache it briefly
// (per warm instance) instead of recomputing on every dashboard load.
const FINANCIAL_COUNT_TTL_MS = 2 * 60 * 1000;
let financialCountCache: { at: number; count: number } | null = null;

async function countDedupedFinancialRowsCached(supabase: SupabaseClient): Promise<number> {
  if (financialCountCache && Date.now() - financialCountCache.at < FINANCIAL_COUNT_TTL_MS) {
    return financialCountCache.count;
  }
  const count = await countDedupedFinancialRows(supabase);
  financialCountCache = { at: Date.now(), count };
  return count;
}

async function countDedupedFinancialRows(supabase: SupabaseClient): Promise<number> {
  const [survey, legacy] = await Promise.all([
    fetchAllFinancialRows(supabase, "survey_submissions"),
    fetchAllFinancialRows(supabase, "legacy_submissions"),
  ]);
  const countSeparatelyKeys = await fetchCountSeparatelyKeys(supabase);

  const tagged = [
    ...survey.map((row, idx) => ({ ...row, _src: 0, _idx: idx, _table: "survey_submissions" as const })),
    ...legacy.map((row, idx) => ({ ...row, _src: 1, _idx: survey.length + idx, _table: "legacy_submissions" as const })),
  ].filter(row => rowState(row));

  // Mirrors movement_stats_by_state: survey rows win over legacy rows for the
  // same normalized (email, state); within a source, newest row wins.
  tagged.sort((a, b) => {
    const sourceCmp = (a._src ?? 0) - (b._src ?? 0);
    if (sourceCmp !== 0) return sourceCmp;
    return createdMs(b) - createdMs(a);
  });

  const seen = new Set<string>();
  let count = 0;

  for (const row of tagged) {
    const state = rowState(row);
    const email = String(row.email ?? "").trim().toLowerCase();
    const sourceKey = `${row._table}:${row.id}`;
    const key = countSeparatelyKeys.has(sourceKey)
      ? `__separate_${sourceKey}__|${state}`
      : `${email || `__anon_${row._idx}__`}|${state}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const loss = Number(row.total_financial_loss ?? 0);
    if (loss > 0 && loss <= 5000000) count += 1;
  }

  return count;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isAdminEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const adminSupabase = createAdminSupabaseClient();

    // Run all queries in parallel.
    // Totals and by-state breakdown combine survey_submissions + legacy_submissions
    // so the dashboard reflects the full movement/master dataset.
    // Recent submissions and approval workflow stay on survey_submissions only.
    const [
      byStateResult,
      recentResult,
      countWithFinancials,
    ] = await Promise.all([
      // Combined by-state stats (survey_submissions + legacy_submissions)
      // Financial totals are computed here in SQL — used for both the state
      // table and the headline financial cards to guarantee consistency.
      adminSupabase
        .from("movement_stats_by_state")
        .select("*"),

      // 50 most recent submissions — all fields for admin detail view
      adminSupabase
        .from("survey_submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),

      // Deduped denominator for the average-loss card. This mirrors the
      // movement_stats_by_state dedupe policy so the headline average is not
      // distorted by survey+legacy duplicates.
      countDedupedFinancialRowsCached(adminSupabase),
    ]);

    // Derive total financial loss by summing across state rows from the view.
    // This is the same data source the state table displays, so the headline
    // card is guaranteed to match the column totals in the table.
    // PostgREST aggregate syntax (.sum()) does not reliably aggregate generated
    // columns — computing from the already-fetched view rows is more robust.
    const normalizedByStateRows = (byStateResult.data ?? []).map(row => {
      const r = row as { is_us?: boolean; state?: string | null };
      return r.is_us ? r : { ...r, state: normalizeOutsideCountryForReporting(r.state) };
    });

    const byStateRows = normalizedByStateRows as Array<{
      total_submissions: number | null;
      total_financial_loss: number | null;
    }>;
    const totalSubmissions = byStateRows.reduce(
      (sum, r) => sum + (Number(r.total_submissions) || 0),
      0
    );
    const totalLoss = byStateRows.reduce(
      (sum, r) => sum + (Number(r.total_financial_loss) || 0),
      0
    );

    const avgLoss = countWithFinancials > 0 ? totalLoss / countWithFinancials : 0;

    return Response.json({
      total:    totalSubmissions,
      by_state:  normalizedByStateRows,
      recent:    recentResult.data  ?? [],
      financials: {
        total_loss:            Math.round(totalLoss),
        avg_loss:              Math.round(avgLoss),
        count_with_financials: countWithFinancials,
      },
    });
  } catch (err) {
    console.error("GET /api/admin/survey-stats error:", err);
    return Response.json({ error: "Failed to load admin stats." }, { status: 500 });
  }
}

// PATCH — approve or unapprove a submission
export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isAdminEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const adminSupabase = createAdminSupabaseClient();

    const { id, approved } = await request.json();
    if (!id || typeof approved !== "boolean") {
      return Response.json({ error: "id and approved (boolean) are required." }, { status: 400 });
    }

    const { data: updated, error } = await adminSupabase
      .from("survey_submissions")
      .update({ approved })
      .eq("id", id)
      .select("state_of_occurrence,outside_us_country")
      .single();

    if (error) {
      return Response.json({ error: "Update failed." }, { status: 500 });
    }

    // Regenerate the reporter's reporting location AND the location of every
    // court actor this submission named. A court actor's share page is keyed by
    // its own state_code (which an admin can override away from the reporter's
    // state_of_occurrence, and which is set even when the submission carries no
    // reporting location), so triggering only the reporter location can leave a
    // newly-approved comment off the actor's slide. queueStateRegeneration is
    // per-location debounced, so duplicate locations collapse safely.
    const regenLocations = new Set<string>();
    const reporterLocation = reportingLocationFromParts(
      updated?.state_of_occurrence,
      updated?.outside_us_country,
    );
    if (reporterLocation) regenLocations.add(reporterLocation);

    const { data: actorRows } = await adminSupabase
      .from("court_actors")
      .select("state_code,location_key")
      .eq("submission_id", id);
    for (const row of actorRows ?? []) {
      const loc = String(row.state_code || row.location_key || "").trim();
      if (loc) regenLocations.add(loc);
    }

    for (const location of regenLocations) {
      queueStateRegeneration(location, "admin approval changed");
    }
    after(() => refreshPublicActorCache(adminSupabase).catch(err => {
      console.error("public actor cache refresh failed after admin approval changed:", err);
    }));

    return Response.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/admin/survey-stats error:", err);
    return Response.json({ error: "Update failed." }, { status: 500 });
  }
}
