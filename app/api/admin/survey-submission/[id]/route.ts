import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { isAdminOrFounderEmail } from "../../../../../lib/require-auth";

const ALLOWED_PERMISSIONS = new Set(["public", "anonymous", "first_name", "data_only"]);

async function requireAdminOrFounderEmail() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminOrFounderEmail(user.email) ? user.email : null;
}

function normalizeLegacySubmission(row: Record<string, unknown>) {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.imported_at,
    source: "legacy",
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    state_of_occurrence: row.state_of_occurrence,
    outside_us_country: row.outside_us_country,
    case_county: row.case_county,
    case_status: row.case_status,
    number_of_kids: row.number_of_kids,
    system: row.system_affected,
    duration: row.time_in_system,
    custody: row.custody_status,
    pro_se: row.is_pro_se,
    legal_rep: row.legal_rep_history,
    allegation: row.allegation_type,
    months_lost: row.months_lost_parenting_time,
    atty_fees: row.attorney_fees,
    gal_fees: row.gal_fees,
    therapy_fees: row.therapy_eval_fees,
    reunif_fees: row.reunification_fees,
    other_fees: row.other_court_actors_fees,
    lost_wages: row.lost_wages,
    asset_loss: row.asset_liquidation_loss,
    total_financial_loss: row.total_financial_loss,
    impact_quote: row.impact_quote,
    permission_to_share: row.permission_to_share,
    approved: null,
    data_source: row.data_source,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!(await requireAdminOrFounderEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const adminSupabase = createAdminSupabaseClient();
    const { data: submission, error } = await adminSupabase
      .from("survey_submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("GET /api/admin/survey-submission/[id] error:", error.message);
      return Response.json({ error: "Failed to load survey submission." }, { status: 500 });
    }

    let normalizedSubmission: Record<string, unknown> | null = null;
    let sourceTable: "survey_submissions" | "legacy_submissions" = "survey_submissions";
    if (submission) {
      normalizedSubmission = { ...submission, source: "survey" };
    } else {
      const { data: legacy, error: legacyError } = await adminSupabase
        .from("legacy_submissions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (legacyError) {
        console.error("GET /api/admin/survey-submission/[id] legacy lookup error:", legacyError.message);
        return Response.json({ error: "Failed to load survey submission." }, { status: 500 });
      }
      if (legacy) {
        normalizedSubmission = normalizeLegacySubmission(legacy);
        sourceTable = "legacy_submissions";
      }
    }

    if (!normalizedSubmission) {
      return Response.json({ error: "Survey submission not found." }, { status: 404 });
    }

    const { data: courtActors, error: actorsError } = await adminSupabase
      .from("court_actors")
      .select("id, role, name, court_or_county, state_code, location_key, notes, source, created_at")
      .eq("submission_id", id)
      .order("created_at", { ascending: true });

    if (actorsError) {
      console.error("GET /api/admin/survey-submission/[id] court actor error:", actorsError.message);
    }

    return Response.json({
      submission: normalizedSubmission,
      source_table: sourceTable,
      court_actors: actorsError ? [] : courtActors ?? [],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/admin/survey-submission/[id] error:", err);
    return Response.json({ error: "Failed to load survey submission." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!(await requireAdminOrFounderEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const permissionToShare = typeof body?.permission_to_share === "string" ? body.permission_to_share.trim() : "";
    if (!ALLOWED_PERMISSIONS.has(permissionToShare)) {
      return Response.json({ error: "permission_to_share must be public, anonymous, first_name, or data_only." }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();
    const { data: updated, error } = await adminSupabase
      .from("survey_submissions")
      .update({ permission_to_share: permissionToShare })
      .eq("id", id)
      .select("id, permission_to_share")
      .maybeSingle();

    if (error) {
      console.error("PATCH /api/admin/survey-submission/[id] error:", error.message);
      return Response.json({ error: "Failed to update survey submission." }, { status: 500 });
    }
    if (!updated) {
      return Response.json({ error: "Survey submission not found." }, { status: 404 });
    }

    return Response.json({ success: true, submission: updated });
  } catch (err) {
    console.error("PATCH /api/admin/survey-submission/[id] error:", err);
    return Response.json({ error: "Failed to update survey submission." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!(await requireAdminOrFounderEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const adminSupabase = createAdminSupabaseClient();

    const { error: actorsError } = await adminSupabase
      .from("court_actors")
      .delete()
      .eq("submission_id", id);
    if (actorsError) {
      console.error("DELETE /api/admin/survey-submission/[id] court_actors error:", actorsError.message);
      return Response.json({ error: "Failed to delete actor rows." }, { status: 500 });
    }

    const { error: submissionError } = await adminSupabase
      .from("survey_submissions")
      .delete()
      .eq("id", id);
    if (submissionError) {
      console.error("DELETE /api/admin/survey-submission/[id] error:", submissionError.message);
      return Response.json({ error: "Failed to delete survey submission." }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/survey-submission/[id] error:", err);
    return Response.json({ error: "Failed to delete survey submission." }, { status: 500 });
  }
}
