import { createServerSupabaseClient } from "../../../../../lib/supabase";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: connection, error: connError } = await supabase
      .from("google_connections")
      .select("google_email, created_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();   // returns null (not error) when 0 rows found

    if (connError) {
      console.error("google_connections status error:", connError.message, connError.code);
      return Response.json({ error: "Failed to check status." }, { status: 500 });
    }

    if (!connection) {
      return Response.json({ connected: false });
    }

    return Response.json({
      connected: true,
      googleEmail: connection.google_email,
      connectedAt: connection.created_at,
    });
  } catch (err) {
    console.error("GET /api/auth/google/status error:", err);
    return Response.json({ error: "Failed to check status." }, { status: 500 });
  }
}
