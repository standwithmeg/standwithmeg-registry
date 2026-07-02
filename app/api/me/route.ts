import { createServerSupabaseClient } from "../../../lib/supabase";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("first_name, last_name, plan, state, county, city, case_types, urgency")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      // Profile row may not exist yet — return minimal data from auth user
      return Response.json({
        id: user.id,
        email: user.email,
        firstName: user.user_metadata?.first_name || "there",
        lastName: "",
        plan: "basic",
        state: "",
        county: "",
        caseTypes: [],
        urgency: "",
      });
    }

    return Response.json({
      id: user.id,
      email: user.email,
      firstName: profile.first_name || "there",
      lastName: profile.last_name || "",
      plan: profile.plan || "basic",
      state: profile.state || "",
      county: profile.county || "",
      city: profile.city || "",
      caseTypes: profile.case_types || [],
      urgency: profile.urgency || "",
    });
  } catch (err) {
    console.error("/api/me error:", err);
    return Response.json({ error: "Failed to load profile." }, { status: 500 });
  }
}
