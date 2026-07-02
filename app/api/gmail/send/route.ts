import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { isFounderEmail } from "../../../../lib/require-auth";
import { getGmailClient, sendEmail, targetGmailMailboxEmail } from "../../../../lib/gmail";
import { renderTemplate } from "../../../../lib/gmail-templates";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !isFounderEmail(user.email)) {
    return Response.json({ error: "Founder access required." }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const to = typeof body.to === "string" ? body.to : "";
    const subject = typeof body.subject === "string" ? body.subject : "";
    const template = typeof body.template === "string" ? body.template : "";
    const variables = typeof body.variables === "object" && body.variables ? body.variables : {};
    const threadId = typeof body.threadId === "string" ? body.threadId : undefined;
    const inReplyTo = typeof body.inReplyTo === "string" ? body.inReplyTo : undefined;
    const references = typeof body.references === "string" ? body.references : undefined;
    const htmlBody = typeof body.htmlBody === "string" ? body.htmlBody : "";

    if (!to || !subject) {
      return Response.json({ error: "Missing 'to' or 'subject'." }, { status: 400 });
    }

    const bodyHtml = htmlBody || (template ? await renderTemplate(template, variables) : "");
    if (!bodyHtml) {
      return Response.json({ error: "Missing email body or template." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const gmail = await getGmailClient(admin, targetGmailMailboxEmail(user.email));
    const sent = await sendEmail(gmail, {
      to,
      subject,
      body: bodyHtml,
      threadId,
      inReplyTo,
      references,
    });

    return Response.json({ message: sent });
  } catch (err) {
    console.error("POST /api/gmail/send error:", err);
    const message = err instanceof Error ? err.message : "Could not send email.";
    return Response.json({ error: message }, { status: 500 });
  }
}
