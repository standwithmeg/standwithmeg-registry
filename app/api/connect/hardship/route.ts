import { createServerSupabaseClient } from "../../../../lib/supabase";
import {
  cleanMultiline,
  findLatestSurveySubmitter,
  hasFullCircleAccess,
  listActiveAccess,
} from "../../../../lib/connection-circles";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { writeAudit } from "../../../../lib/connection-circle-matching";

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

    const admin = createAdminSupabaseClient();
    const active = await listActiveAccess(email);
    if (hasFullCircleAccess(active)) {
      return Response.json({ already_has_access: true, access: active[0] ?? null });
    }

    const body = await request.json().catch(() => ({}));
    const requestNote = cleanMultiline(body?.note, 600) || null;

    const { data: existingPending, error: pendingLookupError } = await admin
      .from("connection_circle_hardship_requests")
      .select("id, status, requested_at")
      .ilike("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingLookupError) {
      console.error("POST /api/connect/hardship pending lookup error:", pendingLookupError.message);
    }
    if (existingPending) {
      return Response.json({ requested: true, hardship_request: existingPending });
    }

    const { data: hardshipRecord, error: hardshipError } = await admin
      .from("connection_circle_hardship_requests")
      .insert({
        email,
        request_note: requestNote,
        status: "pending",
      })
      .select("id, email, request_note, status, requested_at")
      .single();

    if (hardshipError) {
      console.error("POST /api/connect/hardship insert error:", hardshipError.message);
      return Response.json({ error: "Could not submit hardship request." }, { status: 500 });
    }

    await writeAudit({
      actorEmail: email,
      event: "hardship.requested",
      detail: { request_id: hardshipRecord.id, has_note: Boolean(requestNote) },
    });

    return Response.json({ requested: true, hardship_request: hardshipRecord });
  } catch (err) {
    console.error("POST /api/connect/hardship error:", err);
    return Response.json({ error: "Could not submit hardship request." }, { status: 500 });
  }
}
