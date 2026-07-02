import { createServerSupabaseClient } from "../../../../lib/supabase";
import { isFounderEmail } from "../../../../lib/require-auth";
import { getAuthUrl } from "../../../../lib/gmail";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !isFounderEmail(user.email)) {
    return Response.json({ error: "Founder access required." }, { status: 401 });
  }

  try {
    const url = getAuthUrl(user.email);
    return Response.json({ url });
  } catch (err) {
    console.error("GET /api/gmail/auth error:", err);
    const message = err instanceof Error ? err.message : "Could not start Gmail auth.";
    return Response.json({ error: message }, { status: 500 });
  }
}
