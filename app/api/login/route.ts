import { createServerSupabaseClient } from "../../../lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return Response.json({ error: "Email and password are required." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        return Response.json({ error: "Incorrect email or password." }, { status: 401 });
      }
      return Response.json({ error: error.message }, { status: 401 });
    }

    return Response.json({
      success: true,
      user: { id: data.user.id, email: data.user.email },
      session: data.session,
    });
  } catch (err) {
    console.error("Login error:", err);
    return Response.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
