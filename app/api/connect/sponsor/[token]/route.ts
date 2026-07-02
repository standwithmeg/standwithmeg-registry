import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const cleanToken = String(token || "").trim();
    if (!cleanToken) {
      return Response.json({ error: "Sponsor link is required." }, { status: 400 });
    }

    const sb = createAdminSupabaseClient();
    const { data, error } = await sb
      .from("connection_circle_sponsor_links")
      .select("token, requester_note, status, expires_at, created_at")
      .eq("token", cleanToken)
      .maybeSingle();

    if (error) {
      console.error("GET /api/connect/sponsor/[token] error:", error.message);
      return Response.json({ error: "Could not load sponsor link." }, { status: 500 });
    }
    if (!data || data.status !== "active" || new Date(data.expires_at) <= new Date()) {
      return Response.json({ valid: false });
    }

    return Response.json({
      valid: true,
      link: {
        token: data.token,
        requester_note: data.requester_note,
        expires_at: data.expires_at,
        created_at: data.created_at,
      },
    });
  } catch (err) {
    console.error("GET /api/connect/sponsor/[token] error:", err);
    return Response.json({ error: "Could not load sponsor link." }, { status: 500 });
  }
}
