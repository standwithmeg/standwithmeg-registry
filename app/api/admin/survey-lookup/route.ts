import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { isAdminOrFounderEmail } from "../../../../lib/require-auth";

async function requireAdminOrFounderEmail(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminOrFounderEmail(user.email) ? user.email : null;
}

export async function GET(request: Request) {
  try {
    if (!(await requireAdminOrFounderEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const email = (searchParams.get("email") || "").trim().toLowerCase();
    if (!email) {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }

    const sb = createAdminSupabaseClient();
    const [{ data: surveys }, { data: legacy }] = await Promise.all([
      sb.from("survey_submissions").select("id, email, state_of_occurrence, outside_us_country, first_name, created_at").ilike("email", email),
      sb.from("legacy_submissions").select("id, email, state_of_occurrence, outside_us_country, first_name, created_at").ilike("email", email),
    ]);

    const results = [
      ...(surveys ?? []).map((row: Record<string, unknown>) => ({ ...row, source_table: "survey_submissions" as const })),
      ...(legacy ?? []).map((row: Record<string, unknown>) => ({ ...row, source_table: "legacy_submissions" as const })),
    ].sort((a, b) => new Date(String((b as unknown as { created_at: string }).created_at)).getTime() - new Date(String((a as unknown as { created_at: string }).created_at)).getTime());

    return Response.json({ email, results });
  } catch (err) {
    console.error("GET /api/admin/survey-lookup error:", err);
    return Response.json({ error: "Could not look up surveys." }, { status: 500 });
  }
}
