import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";

function isAdminEmail(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
  return admins.includes(email.toLowerCase());
}

// Public-display permission values — data-only submissions are never returned.
// These must match the short enum values stored by the submit form.
const PUBLIC_PERMISSIONS = [
  "public",
  "anonymous",
  "first_name",
];

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isAdminEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state");
    const isUs  = searchParams.get("is_us") === "true";

    if (!state) {
      return Response.json({ error: "state param required." }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();

    const { data, error } = await adminSupabase
      .from("survey_submissions")
      .select("id, first_name, permission_to_share, impact_quote, created_at, case_county")
      .eq(isUs ? "state_of_occurrence" : "outside_us_country", state)
      .eq("approved", true)
      .in("permission_to_share", PUBLIC_PERMISSIONS)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET /api/admin/state-quotes error:", error);
      return Response.json({ error: "Failed to load quotes." }, { status: 500 });
    }

    return Response.json({ quotes: data ?? [] });
  } catch (err) {
    console.error("GET /api/admin/state-quotes error:", err);
    return Response.json({ error: "Failed to load quotes." }, { status: 500 });
  }
}
