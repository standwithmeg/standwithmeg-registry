import { createServerSupabaseClient } from "../../../../lib/supabase";
import { isFounderEmail } from "../../../../lib/require-auth";
import { fetchCirclesDashboardData } from "../../../../lib/admin-metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isFounderEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const data = await fetchCirclesDashboardData();
    return Response.json(data);
  } catch (err) {
    console.error("GET /api/admin/circles-dashboard error:", err);
    return Response.json(
      { error: "Failed to load Circles dashboard." },
      { status: 500 }
    );
  }
}
