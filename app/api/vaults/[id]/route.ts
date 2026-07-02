import { createServerSupabaseClient } from "../../../../lib/supabase";

const CONTEXT_COLUMNS =
  "id, name, type, state, county, city, court_name, case_number, judge_name, " +
  "what_is_happening, what_tried, obstacle, desired_outcome, ai_instructions, " +
  "created_at, updated_at";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: vault, error } = await supabase
      .from("vaults")
      .select(CONTEXT_COLUMNS)
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !vault) {
      console.error("GET /api/vaults/[id] error:", error);
      return Response.json({ error: "Vault not found." }, { status: 404 });
    }

    return Response.json({ vault });
  } catch (err) {
    console.error("GET /api/vaults/[id] error:", err);
    return Response.json({ error: "Failed to load vault." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await request.json();

    // Map every allowed field explicitly — no dynamic key spreading
    const updates: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };

    const allowed = [
      "state", "county", "city", "court_name", "case_number", "judge_name",
      "what_is_happening", "what_tried", "obstacle", "desired_outcome", "ai_instructions",
    ] as const;

    for (const field of allowed) {
      if (field in body) {
        updates[field] = typeof body[field] === "string" && body[field].trim() !== ""
          ? body[field].trim()
          : null;
      }
    }

    const { data: vault, error } = await supabase
      .from("vaults")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(CONTEXT_COLUMNS)
      .single();

    if (error || !vault) {
      console.error("PATCH /api/vaults/[id] error:", error?.message, error?.code);
      return Response.json(
        { error: error?.message ?? "Failed to update vault." },
        { status: 500 }
      );
    }

    return Response.json({ vault });
  } catch (err) {
    console.error("PATCH /api/vaults/[id] error:", err);
    return Response.json({ error: "Failed to update vault." }, { status: 500 });
  }
}
