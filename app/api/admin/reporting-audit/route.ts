import reportIndex from "../../../../public/state-reports/index.json";
import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../lib/require-auth";
import { actorBucketKey } from "../../../../lib/court-actors";
import { normalizeOutsideCountryForReporting } from "../../../../lib/survey-location";

const PUBLIC_PERMISSIONS = ["public", "anonymous", "first_name"];
const REPORT_THRESHOLD = 30;
const PUBLIC_ACTOR_THRESHOLD = 5;

type StateStatsRow = {
  state: string;
  is_us: boolean;
  total_submissions: number | null;
  approved_count: number | null;
  avg_financial_loss: number | null;
  total_financial_loss: number | null;
  avg_months_lost: number | null;
  total_loss_count: number | null;
  pro_se_count: number | null;
  last_submission_at: string | null;
};

type ReportIndexEntry = {
  state: string;
  submissions: number;
  file: string;
  size_kb: number;
};

type QuoteRow = {
  state_of_occurrence: string | null;
  outside_us_country: string | null;
};

type ActorRow = {
  role: string;
  name: string;
  state_code: string | null;
  submission_id: string;
  survey_submissions:
    | { email: string | null; state_of_occurrence: string | null }
    | { email: string | null; state_of_occurrence: string | null }[]
    | null;
};

type AuditRow = {
  state: string;
  is_us: boolean;
  dashboard_families: number;
  deduped_view_families: number | null;
  delta_dashboard_vs_deduped: number | null;
  report_eligible: boolean;
  pdf_available: boolean;
  pdf_index_families: number | null;
  pdf_count_delta: number | null;
  reporting_status: "ok" | "not_eligible" | "missing_pdf" | "count_mismatch" | "stale_pdf";
  shareable_quotes: number;
  public_court_actors: number;
  total_reported_loss: number | null;
  avg_reported_loss: number | null;
  avg_months_lost: number | null;
  no_contact_count: number;
  pro_se_count: number;
  latest_submission_at: string | null;
  pdf_url: string | null;
  pdf_size_kb: number | null;
};

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email);
}

function joinedSubmission(row: ActorRow) {
  const joined = Array.isArray(row.survey_submissions)
    ? row.survey_submissions[0]
    : row.survey_submissions;
  return joined ?? null;
}

function joinedEmail(row: ActorRow) {
  const joined = joinedSubmission(row);
  return joined?.email?.trim().toLowerCase() ?? "";
}

function actorState(row: ActorRow) {
  const direct = row.state_code?.trim().toUpperCase();
  if (direct) return direct;
  return joinedSubmission(row)?.state_of_occurrence?.trim().toUpperCase() || "";
}

function actorFamilyKey(row: ActorRow) {
  const state = actorState(row);
  const email = joinedEmail(row);
  return email ? `${email}|${state}` : `submission:${row.submission_id}`;
}

function csvValue(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: AuditRow[]) {
  const columns: Array<[keyof AuditRow, string]> = [
    ["state", "State"],
    ["dashboard_families", "Dashboard Families"],
    ["deduped_view_families", "Deduped View Families"],
    ["delta_dashboard_vs_deduped", "Δ Dashboard vs Deduped"],
    ["report_eligible", "30+ Eligible"],
    ["pdf_available", "PDF Available"],
    ["pdf_index_families", "PDF Index Families"],
    ["pdf_count_delta", "PDF Count Delta"],
    ["reporting_status", "Reporting Status"],
    ["shareable_quotes", "Shareable Quotes"],
    ["public_court_actors", "Public Court Actors"],
    ["total_reported_loss", "Total Reported Loss"],
    ["avg_reported_loss", "Avg Reported Loss"],
    ["avg_months_lost", "Avg Months Lost"],
    ["no_contact_count", "No Contact"],
    ["pro_se_count", "Pro Se"],
    ["latest_submission_at", "Latest Submission"],
    ["pdf_url", "PDF URL"],
    ["pdf_size_kb", "PDF Size KB"],
  ];
  return [
    columns.map(([, label]) => csvValue(label)).join(","),
    ...rows.map(row => columns.map(([key]) => csvValue(row[key])).join(",")),
  ].join("\n");
}

async function fetchQuoteCounts(adminSupabase: ReturnType<typeof createAdminSupabaseClient>) {
  const counts: Record<string, number> = {};
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await adminSupabase
      .from("survey_submissions")
      .select("state_of_occurrence,outside_us_country")
      .eq("approved", true)
      .in("permission_to_share", PUBLIC_PERMISSIONS)
      .not("impact_quote", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data as QuoteRow[]) {
      const key = row.state_of_occurrence ?? normalizeOutsideCountryForReporting(row.outside_us_country);
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return counts;
}

async function fetchDedupedViewCounts(
  adminSupabase: ReturnType<typeof createAdminSupabaseClient>,
): Promise<Record<string, number> | null> {
  // Per-state row count from movement_deduped_submissions (migration 021).
  // Returns null when the view does not exist yet, so the audit endpoint
  // gracefully degrades to "deduped view not deployed" rather than 500'ing.
  const counts: Record<string, number> = {};
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await adminSupabase
      .from("movement_deduped_submissions")
      .select("state")
      .range(from, from + pageSize - 1);
    if (error) {
      // 42P01 = relation does not exist (view not deployed yet)
      if (error.code === "42P01") return null;
      throw error;
    }
    if (!data || data.length === 0) break;
    for (const row of data as Array<{ state: string | null }>) {
      const key = String(row.state ?? "").trim();
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return counts;
}

async function fetchPublicActorCounts(adminSupabase: ReturnType<typeof createAdminSupabaseClient>) {
  const rows: ActorRow[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await adminSupabase
      .from("court_actors")
      .select("role,name,state_code,submission_id,survey_submissions(email, state_of_occurrence)")
      .eq("source", "form_direct")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...(data as unknown as ActorRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const buckets = new Map<string, { state: string; families: Set<string> }>();
  for (const row of rows) {
    const state = actorState(row);
    if (!state || !row.role || !row.name) continue;
    const bucketKey = actorBucketKey(row.name, row.role, state);
    if (!bucketKey.split("|")[0]) continue;
    const bucket = buckets.get(bucketKey) ?? { state, families: new Set<string>() };
    bucket.families.add(actorFamilyKey(row));
    buckets.set(bucketKey, bucket);
  }

  const counts: Record<string, number> = {};
  for (const bucket of buckets.values()) {
    if (bucket.families.size < PUBLIC_ACTOR_THRESHOLD) continue;
    counts[bucket.state] = (counts[bucket.state] ?? 0) + 1;
  }
  return counts;
}

function statusFor(row: StateStatsRow | undefined, report: ReportIndexEntry | undefined) {
  const isUs = row?.is_us ?? true;
  const dashboardFamilies = Number(row?.total_submissions ?? 0);
  const eligible = isUs && dashboardFamilies >= REPORT_THRESHOLD;
  const pdfAvailable = !!report;
  const pdfFamilies = report?.submissions ?? null;

  if (eligible && !pdfAvailable) return "missing_pdf" as const;
  if (!eligible && pdfAvailable) return "stale_pdf" as const;
  if (eligible && pdfAvailable && pdfFamilies !== dashboardFamilies) return "count_mismatch" as const;
  if (eligible && pdfAvailable) return "ok" as const;
  return "not_eligible" as const;
}

export async function GET(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const wantsCsv = searchParams.get("format") === "csv";
    const adminSupabase = createAdminSupabaseClient();

    const [statsResult, quoteCounts, actorCounts, dedupedCounts] = await Promise.all([
      adminSupabase.from("movement_stats_by_state").select("*"),
      fetchQuoteCounts(adminSupabase),
      fetchPublicActorCounts(adminSupabase),
      fetchDedupedViewCounts(adminSupabase),
    ]);

    if (statsResult.error) throw statsResult.error;

    const statsRows = ((statsResult.data ?? []) as StateStatsRow[]).map(row =>
      row.is_us ? row : { ...row, state: normalizeOutsideCountryForReporting(row.state) }
    );
    const statsByState = new Map(statsRows.map(row => [row.state, row]));
    const reportsByState = new Map(
      (reportIndex as ReportIndexEntry[]).map(entry => [entry.state, entry])
    );
    const states = new Set([...statsByState.keys(), ...reportsByState.keys()]);

    const rows: AuditRow[] = [...states]
      .sort((a, b) => {
        const aCount = Number(statsByState.get(a)?.total_submissions ?? 0);
        const bCount = Number(statsByState.get(b)?.total_submissions ?? 0);
        return bCount - aCount || a.localeCompare(b);
      })
      .map(state => {
        const row = statsByState.get(state);
        const report = reportsByState.get(state);
        const dashboardFamilies = Number(row?.total_submissions ?? 0);
        const pdfFamilies = report?.submissions ?? null;
        const dedupedFamilies = dedupedCounts ? (dedupedCounts[state] ?? 0) : null;
        return {
          state,
          is_us: row?.is_us ?? /^[A-Z]{2}$/.test(state),
          dashboard_families: dashboardFamilies,
          deduped_view_families: dedupedFamilies,
          delta_dashboard_vs_deduped:
            dedupedFamilies === null ? null : dashboardFamilies - dedupedFamilies,
          report_eligible: !!row?.is_us && dashboardFamilies >= REPORT_THRESHOLD,
          pdf_available: !!report,
          pdf_index_families: pdfFamilies,
          pdf_count_delta: pdfFamilies === null ? null : pdfFamilies - dashboardFamilies,
          reporting_status: statusFor(row, report),
          shareable_quotes: quoteCounts[state] ?? 0,
          public_court_actors: actorCounts[state] ?? 0,
          total_reported_loss: row?.total_financial_loss ?? null,
          avg_reported_loss: row?.avg_financial_loss ?? null,
          avg_months_lost: row?.avg_months_lost ?? null,
          no_contact_count: Number(row?.total_loss_count ?? 0),
          pro_se_count: Number(row?.pro_se_count ?? 0),
          latest_submission_at: row?.last_submission_at ?? null,
          pdf_url: report?.file ?? null,
          pdf_size_kb: report?.size_kb ?? null,
        };
      });

    const summary = {
      total_rows: rows.length,
      eligible_states: rows.filter(row => row.report_eligible).length,
      pdfs_available: rows.filter(row => row.pdf_available).length,
      mismatches: rows.filter(row => row.reporting_status === "count_mismatch").length,
      missing_pdfs: rows.filter(row => row.reporting_status === "missing_pdf").length,
      stale_pdfs: rows.filter(row => row.reporting_status === "stale_pdf").length,
      generated_at: new Date().toISOString(),
    };

    if (wantsCsv) {
      return new Response(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="stand-with-meg-reporting-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return Response.json({ rows, summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/admin/reporting-audit error:", err);
    return Response.json({ error: "Failed to load reporting audit." }, { status: 500 });
  }
}
