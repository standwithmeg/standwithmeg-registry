import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";

// Admin emails — set ADMIN_EMAILS in .env.local as a comma-separated list
// e.g. ADMIN_EMAILS=meg@standwithmeg.com,other@example.com
function isAdminEmail(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
  return admins.includes(email.toLowerCase());
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
      surveyCountResult,
      legacyCountResult,
      byStateResult,
      recentResult,
      surveyFinancialCountResult,
      legacyFinancialCountResult,
    ] = await Promise.all([
      // Live + imported submissions count
      adminSupabase
        .from("survey_submissions")
        .select("id", { count: "exact", head: true }),

      // Early-form legacy records count
      adminSupabase
        .from("legacy_submissions")
        .select("id", { count: "exact", head: true }),

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

      // Count rows with plausible financial data — same $5M threshold used in
      // movement_stats_by_state so the avg card denominator stays consistent.
      adminSupabase
        .from("survey_submissions")
        .select("id", { count: "exact", head: true })
        .gt("total_financial_loss", 0)
        .lte("total_financial_loss", 5000000),

      // Same for legacy_submissions
      adminSupabase
        .from("legacy_submissions")
        .select("id", { count: "exact", head: true })
        .gt("total_financial_loss", 0)
        .lte("total_financial_loss", 5000000),
    ]);

    // Derive total financial loss by summing across state rows from the view.
    // This is the same data source the state table displays, so the headline
    // card is guaranteed to match the column totals in the table.
    // PostgREST aggregate syntax (.sum()) does not reliably aggregate generated
    // columns — computing from the already-fetched view rows is more robust.
    const byStateRows = (byStateResult.data ?? []) as Array<{ total_financial_loss: number | null }>;
    const totalLoss = byStateRows.reduce(
      (sum, r) => sum + (Number(r.total_financial_loss) || 0),
      0
    );

    const countWithFinancials =
      (surveyFinancialCountResult.count ?? 0) +
      (legacyFinancialCountResult.count ?? 0);

    const avgLoss = countWithFinancials > 0 ? totalLoss / countWithFinancials : 0;

    return Response.json({
      total:    (surveyCountResult.count ?? 0) + (legacyCountResult.count ?? 0),
      by_state:  byStateResult.data ?? [],
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

    const { error } = await adminSupabase
      .from("survey_submissions")
      .update({ approved })
      .eq("id", id);

    if (error) {
      return Response.json({ error: "Update failed." }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/admin/survey-stats error:", err);
    return Response.json({ error: "Update failed." }, { status: 500 });
  }
}
