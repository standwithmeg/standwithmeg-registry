import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { isFounderEmail } from "../../../../../lib/require-auth";
import { fetchCircleUserProfile, saveCircleUserAdminNote } from "../../../../../lib/circle-user-profile";

export const dynamic = "force-dynamic";

async function requireFounderApi(_req: Request): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !isFounderEmail(user.email)) return null;
  return user.email;
}

export async function GET(request: Request, context: { params: Promise<{ email: string }> }) {
  const founderEmail = await requireFounderApi(request);
  if (!founderEmail) {
    return Response.json({ error: "Founder access required." }, { status: 401 });
  }

  try {
    const { email } = await context.params;
    const profile = await fetchCircleUserProfile(email);
    if (!profile) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }
    return Response.json(profile);
  } catch (err) {
    console.error("GET /api/admin/circle-user/[email] error:", err);
    return Response.json({ error: "Could not load user profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ email: string }> }) {
  const founderEmail = await requireFounderApi(request);
  if (!founderEmail) {
    return Response.json({ error: "Founder access required." }, { status: 401 });
  }

  try {
    const { email } = await context.params;
    const body = await request.json().catch(() => ({}));
    const note = typeof body?.note === "string" ? body.note : "";
    await saveCircleUserAdminNote(email, note, founderEmail);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/admin/circle-user/[email] error:", err);
    return Response.json({ error: "Could not save admin note." }, { status: 500 });
  }
}
