import { createServerSupabaseClient } from "../../../../lib/supabase";
import { isFounderEmail } from "../../../../lib/require-auth";
import { fetchFounderDashboardData } from "../../../../lib/admin-metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isFounderEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const data = await fetchFounderDashboardData();
    return Response.json(data);
  } catch (err) {
    console.error("GET /api/admin/founder-dashboard error:", err);
    return Response.json(
      { error: "Failed to load founder dashboard." },
      { status: 500 }
    );
  }
}
