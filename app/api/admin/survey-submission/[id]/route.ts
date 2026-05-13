import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../../lib/require-auth";

const ALLOWED_PERMISSIONS = new Set(["public", "anonymous", "first_name", "data_only"]);

async function requireAdminEmail() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email) ? user.email : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!(await requireAdminEmail())) {
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
    if (!submission) {
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
      submission,
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
    if (!(await requireAdminEmail())) {
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
    if (!(await requireAdminEmail())) {
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
