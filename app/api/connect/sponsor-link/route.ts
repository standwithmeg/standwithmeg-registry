import { createServerSupabaseClient } from "../../../../lib/supabase";
import { appOrigin, cleanMultiline, findLatestSurveySubmitter, sponsorToken } from "../../../../lib/connection-circles";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return Response.json({ error: "Please sign in with your survey email first." }, { status: 401 });
    }

    const email = user.email.toLowerCase();
    const submitter = await findLatestSurveySubmitter(email);
    if (!submitter) {
      return Response.json({ error: "Connection Circles are limited to verified Stand With Meg submitters." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const note = cleanMultiline(body.note, 600) || null;
    const token = sponsorToken();
    const admin = createAdminSupabaseClient();
    const { data, error: insertError } = await admin
      .from("connection_circle_sponsor_links")
      .insert({
        token,
        requester_email: email,
        requester_note: note,
      })
      .select("id, token, requester_note, status, expires_at, created_at")
      .single();

    if (insertError) {
      console.error("POST /api/connect/sponsor-link error:", insertError.message);
      return Response.json({ error: "Could not create a sponsor link." }, { status: 500 });
    }

    return Response.json({
      link: {
        ...data,
        url: `${appOrigin(request)}/connect/sponsor/${data.token}`,
      },
    });
  } catch (err) {
    console.error("POST /api/connect/sponsor-link error:", err);
    return Response.json({ error: "Could not create a sponsor link." }, { status: 500 });
  }
}
