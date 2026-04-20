import { createAdminSupabaseClient } from "../../../lib/supabase-admin";

export async function GET() {
  try {
    const adminSupabase = createAdminSupabaseClient();

    const { data, error } = await adminSupabase
      .from("state_resource_links")
      .select("state_code, state_name, drive_folder_url, report_available, report_title, updated_at")
      .order("state_code");

    if (error) {
      // Table may not exist yet — return empty array gracefully
      console.error("GET /api/state-resources error (non-blocking):", error.message);
      return Response.json({ resources: [] });
    }

    return Response.json({ resources: data ?? [] });
  } catch (err) {
    console.error("GET /api/state-resources error:", err);
    return Response.json({ error: "Failed to load state resources." }, { status: 500 });
  }
}
