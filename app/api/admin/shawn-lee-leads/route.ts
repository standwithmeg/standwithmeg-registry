import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { requireFounderApi } from "../../../../lib/social-post/admin-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireFounderApi();
  } catch {
    return Response.json({ error: "Founder access required." }, { status: 401 });
  }

  const sb = createAdminSupabaseClient();
  const [coaching, qa, kits] = await Promise.all([
    sb
      .from("coaching_inquiries")
      .select("id, name, email, state, interest_type, message, source, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    sb
      .from("shawn_lee_qa_log")
      .select("id, email, question, answer, source, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    sb
      .from("report_kit_access")
      .select("id, email, status, stripe_session_id, granted_at")
      .order("granted_at", { ascending: false })
      .limit(50),
  ]);

  if (coaching.error) {
    return Response.json({ error: coaching.error.message }, { status: 500 });
  }

  return Response.json({
    coaching: coaching.data ?? [],
    qa: qa.error ? [] : (qa.data ?? []),
    reportKit: kits.error ? [] : (kits.data ?? []),
    tablesReady: !coaching.error,
  });
}

export async function PATCH(request: Request) {
  try {
    await requireFounderApi();
  } catch {
    return Response.json({ error: "Founder access required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const status = String(body.status || "").trim();
  const valid = new Set(["new", "contacted", "scheduled", "won", "passed"]);
  if (!id || !valid.has(status)) {
    return Response.json({ error: "Valid id and status required." }, { status: 400 });
  }

  const sb = createAdminSupabaseClient();
  const { error } = await sb.from("coaching_inquiries").update({ status }).eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}