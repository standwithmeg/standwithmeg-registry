import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { isFounderEmail } from "../../../../lib/require-auth";
import { getDraft, getGmailClient, listDrafts, targetGmailMailboxEmail } from "../../../../lib/gmail";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !isFounderEmail(user.email)) {
    return Response.json({ error: "Founder access required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const maxResults = Math.min(parseInt(searchParams.get("max") ?? "25", 10), 50);

  try {
    const admin = createAdminSupabaseClient();
    const gmail = await getGmailClient(admin, targetGmailMailboxEmail(user.email));
    const drafts = await listDrafts(gmail, maxResults);
    const detailed = await Promise.all(
      drafts.slice(0, 10).map(d => d.id ? getDraft(gmail, d.id) : null).filter(Boolean),
    );
    return Response.json({ drafts: detailed, count: drafts.length });
  } catch (err) {
    console.error("GET /api/gmail/drafts error:", err);
    const message = err instanceof Error ? err.message : "Could not load drafts.";
    return Response.json({ error: message }, { status: 500 });
  }
}
