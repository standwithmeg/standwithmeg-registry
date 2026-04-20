import { createServerSupabaseClient } from "../../../lib/supabase";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: vaults, error } = await supabase
      .from("vaults")
      .select("id, name, type, case_number, court_name, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET /api/vaults error:", error);
      return Response.json({ error: "Failed to load vaults." }, { status: 500 });
    }

    return Response.json({ vaults: vaults ?? [] });
  } catch (err) {
    console.error("GET /api/vaults error:", err);
    return Response.json({ error: "Failed to load vaults." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await request.json();
    const { name, type, case_number, court_name } = body;

    if (!name?.trim() || !type?.trim()) {
      return Response.json({ error: "Name and type are required." }, { status: 400 });
    }

    const { data: vault, error } = await supabase
      .from("vaults")
      .insert({
        user_id: user.id,
        name: name.trim(),
        type: type.trim(),
        case_number: case_number?.trim() || null,
        court_name: court_name?.trim() || null,
      })
      .select("id, name, type, case_number, court_name, created_at, updated_at")
      .single();

    if (error) {
      console.error("POST /api/vaults error:", error);
      return Response.json({ error: "Failed to create vault." }, { status: 500 });
    }

    return Response.json({ vault }, { status: 201 });
  } catch (err) {
    console.error("POST /api/vaults error:", err);
    return Response.json({ error: "Failed to create vault." }, { status: 500 });
  }
}
