import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { isFounderEmail } from "../../../../lib/require-auth";
import { getGmailClient, listThreads, targetGmailMailboxEmail } from "../../../../lib/gmail";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !isFounderEmail(user.email)) {
    return Response.json({ error: "Founder access required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const maxResults = Math.min(parseInt(searchParams.get("max") ?? "25", 10), 50);
  const q = searchParams.get("q") ?? undefined;

  try {
    const admin = createAdminSupabaseClient();
    const gmail = await getGmailClient(admin, targetGmailMailboxEmail(user.email));
    const threads = await listThreads(gmail, { maxResults, q });
    return Response.json({ threads, count: threads.length });
  } catch (err) {
    console.error("GET /api/gmail/threads error:", err);
    const message = err instanceof Error ? err.message : "Could not load threads.";
    return Response.json({ error: message }, { status: 500 });
  }
}
