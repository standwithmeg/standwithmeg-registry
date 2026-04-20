import { createServerSupabaseClient } from "../../../../../lib/supabase";

export async function DELETE() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { error } = await supabase
      .from("google_connections")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      console.error("google disconnect error:", error.message);
      return Response.json({ error: "Failed to disconnect." }, { status: 500 });
    }

    return Response.json({ disconnected: true });
  } catch (err) {
    console.error("DELETE /api/auth/google/disconnect error:", err);
    return Response.json({ error: "Failed to disconnect." }, { status: 500 });
  }
}
