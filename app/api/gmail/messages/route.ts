import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { isFounderEmail } from "../../../../lib/require-auth";
import { getGmailClient, getMessage, listMessages, targetGmailMailboxEmail } from "../../../../lib/gmail";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !isFounderEmail(user.email)) {
    return Response.json({ error: "Founder access required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "INBOX";
  const maxResults = Math.min(parseInt(searchParams.get("max") ?? "25", 10), 50);
  const unreadOnly = searchParams.get("unread") === "1";
  const q = [unreadOnly ? "is:unread" : "", `label:${label}`].filter(Boolean).join(" ");

  try {
    const admin = createAdminSupabaseClient();
    const gmail = await getGmailClient(admin, targetGmailMailboxEmail(user.email));
    const messages = await listMessages(gmail, { labelIds: [label], maxResults, q: q || undefined });
    const detailed = await Promise.all(
      messages.slice(0, 10).map(m => m.id ? getMessage(gmail, m.id, "full") : null).filter(Boolean),
    );
    return Response.json({ messages: detailed, count: messages.length });
  } catch (err) {
    console.error("GET /api/gmail/messages error:", err);
    const message = err instanceof Error ? err.message : "Could not load messages.";
    return Response.json({ error: message }, { status: 500 });
  }
}
