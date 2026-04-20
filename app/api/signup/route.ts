import { createServerSupabaseClient } from "../../../lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      email,
      password,
      firstName,
      lastName,
      state,
      county,
      city,
      caseTypes,
      urgency,
      plan,
    } = body;

    if (!email || !password || !firstName) {
      return Response.json({ error: "Email, password, and first name are required." }, { status: 400 });
    }

    if (password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName }, // stored in auth.users.raw_user_meta_data
      },
    });

    if (authError) {
      if (authError.message.includes("already registered")) {
        return Response.json({ error: "An account with this email already exists." }, { status: 409 });
      }
      return Response.json({ error: authError.message }, { status: 400 });
    }

    if (!authData.user) {
      return Response.json({ error: "Account creation failed. Please try again." }, { status: 500 });
    }

    // Insert profile row — non-fatal if this fails (user can re-save from settings)
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: authData.user.id,
        first_name: firstName,
        last_name: lastName || null,
        plan: plan || "basic",
        state: state || null,
        county: county || null,
        city: city || null,
        case_types: caseTypes || [],
        urgency: urgency || null,
      });

    if (profileError) {
      console.error("Profile insert error:", profileError.message);
      // Don't fail the signup — user exists, profile can be fixed later
    }

    return Response.json({
      success: true,
      user: { id: authData.user.id, email: authData.user.email },
      session: authData.session,
    });
  } catch (err) {
    console.error("Signup error:", err);
    return Response.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
