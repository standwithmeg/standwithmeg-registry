import "server-only";

import type { ConnectionRequestRow } from "./connection-circle-matching";
import { createSmtpTransport } from "./smtp-email";

/**
 * Builds the SMTP transport. Throws if SMTP is not configured so callers can
 * log/audit the real delivery state instead of silently pretending it sent.
 */
async function getTransport(): Promise<{
  transporter: Awaited<ReturnType<typeof createSmtpTransport>>["transporter"];
  from: string;
  replyTo: string;
}> {
  const { transporter, fromAddress, replyToAddress } = await createSmtpTransport("Connection Circle");
  return { transporter, from: fromAddress, replyTo: replyToAddress };
}

function describeActor(row: { actor_name: string; actor_state: string | null; actor_role: string }): string {
  const where = row.actor_state ? ` in ${row.actor_state}` : "";
  return `${row.actor_role} ${row.actor_name}${where}`;
}

/**
 * Notify the RECIPIENT that another parent who reported the same court actor
 * wants to connect. The email NEVER reveals the requester's identity, case
 * details, or email — only the actor signature and the requester's general
 * note (already capped + sanitized by the caller).
 *
 * Throws on SMTP/configuration failure. Callers should schedule with Next's
 * after() and record success/failure in the request audit log.
 */
export async function sendConnectionRequestEmail(args: {
  request: ConnectionRequestRow;
  appOrigin: string;
}): Promise<void> {
  const t = await getTransport();
  const origin = args.appOrigin.replace(/\/+$/, "");
  const tokenUrl = `${origin}/connect/requests/${args.request.recipient_token}`;
  const actorPhrase = describeActor(args.request);
  const noteBlock = args.request.requester_message
    ? `\nThey added this note (kept general, no case details):\n   "${args.request.requester_message}"\n`
    : "";

  const bodyText = [
    "Hi,",
    "",
    `Another parent who also reported ${actorPhrase} would like to connect with you through Stand With Meg's Connection Circles.`,
    "",
    "You are in control:",
    "  - They cannot see your name, email, court actor list, case details, or story unless you accept.",
    "  - If you accept, both of you will receive a single introduction email exposing only your email addresses.",
    "  - If you decline or ignore, they are not told who you are.",
    noteBlock,
    "Review and respond here (private link, just for you):",
    `   ${tokenUrl}`,
    "",
    "If this email reached you by mistake, you can safely ignore it.",
    "",
    "Stand With Meg",
    "StandWithMeg.com",
  ].join("\n");

  await t.transporter.sendMail({
    from: `"Stand With Meg" <${t.from}>`,
    replyTo: t.replyTo,
    to: args.request.recipient_email,
    subject: "Another parent who reported the same court actor wants to connect",
    text: bodyText,
  });
}

/**
 * Tell a family their Connection Circles access is now active, so they actually
 * know to come back and log in. Fires when an admin grants a hardship/waitlist
 * request, or when a sponsor funds the family's private sponsor link.
 *
 * Does NOT embed a login credential — it points the family to /connect to
 * request their own magic link with their survey email, keeping the
 * login-link-on-request model intact. `reason` tailors one line.
 *
 * Throws on SMTP/configuration failure; callers schedule with after() and log
 * the delivery state so a failed email never blocks the grant itself.
 */
export async function sendCircleAccessGrantedEmail(args: {
  email: string;
  appOrigin: string;
  reason: "hardship" | "sponsored";
}): Promise<void> {
  const t = await getTransport();
  const origin = args.appOrigin.replace(/\/+$/, "");
  const connectUrl = `${origin}/connect`;
  const openingLine = args.reason === "sponsored"
    ? "Good news — someone sponsored your access to Stand With Meg's Connection Circles. You're in."
    : "Good news — your access to Stand With Meg's Connection Circles is active. You're in.";

  const bodyText = [
    "Hi,",
    "",
    openingLine,
    "",
    "Connection Circles let you find other families who reported the same court actor, talk in a private group, and ask to connect one-on-one. You stay anonymous behind a handle unless both sides agree to exchange contact info.",
    "",
    "To get in, open this page and log in with the same email you used on your Stand With Meg survey:",
    `   ${connectUrl}`,
    "",
    "We'll email you a private login link to that address. No password to remember.",
    "",
    "Stand With Meg",
    "StandWithMeg.com",
  ].join("\n");

  await t.transporter.sendMail({
    from: `"Stand With Meg" <${t.from}>`,
    replyTo: t.replyTo,
    to: args.email,
    subject: "Your Connection Circles access is active",
    text: bodyText,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function brandEmailHtml(params: {
  title: string;
  preview: string;
  paragraphs: string[];
  ctaUrl: string;
  ctaText: string;
  footerExtra?: string;
}): string {
  const escapedParagraphs = params.paragraphs.map(p => `<p style="margin:0 0 18px 0;line-height:1.6;color:#4a4a4a;">${escapeHtml(p)}</p>`).join("");
  const footerExtra = params.footerExtra
    ? `<p style="margin:0 0 12px 0;line-height:1.5;color:#6b7280;font-size:13px;">${params.footerExtra}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e0d6;box-shadow:0 16px 40px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#0F1E30;padding:32px 40px;text-align:center;">
              <div style="color:#C9A227;font-size:14px;font-weight:900;letter-spacing:0.18em;text-transform:uppercase;">Stand With Meg</div>
              <div style="color:#ffffff;font-size:22px;font-weight:900;margin-top:8px;letter-spacing:-0.01em;">${escapeHtml(params.preview)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              ${escapedParagraphs}
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
                <tr>
                  <td style="border-radius:10px;background-color:#C9A227;text-align:center;">
                    <a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;padding:16px 32px;color:#091625;font-size:15px;font-weight:900;text-decoration:none;border-radius:10px;">${escapeHtml(params.ctaText)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 18px 0;line-height:1.6;color:#6b7280;font-size:13px;">Or copy and paste this link into your browser:<br><a href="${escapeHtml(params.ctaUrl)}" style="color:#B91C1C;font-weight:700;">${escapeHtml(params.ctaUrl)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;background-color:#f8f7f4;border-top:1px solid #ebe7de;">
              ${footerExtra}
              <p style="margin:0;line-height:1.5;color:#9ca3af;font-size:12px;">Stand With Meg · StandWithMeg.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Anonymous "come join the circle" nudge. A member taps Invite on a parent who
 * has access but hasn't joined the conversation yet. NEITHER side is revealed:
 * the email never names the inviter, and the inviter never learns who the
 * recipient is (they only ever saw a pseudonym or "no handle yet"). No consent
 * is exchanged — it's just an invitation to participate.
 */
export async function sendCircleJoinInviteEmail(args: {
  email: string;
  appOrigin: string;
  actorPhrase: string;
}): Promise<void> {
  const t = await getTransport();
  const origin = args.appOrigin.replace(/\/+$/, "");
  const connectUrl = `${origin}/connect`;

  const bodyText = [
    "Hi,",
    "",
    `Another family in your Stand With Meg Connection Circle for ${args.actorPhrase} invited you to join the conversation.`,
    "",
    "You stay completely anonymous:",
    "  - They can't see your name, email, or who you are.",
    "  - You won't see who they are either — everyone in the circle uses a handle.",
    "  - It's a private group of families who reported the same court actor. You only share real contact info if you both choose to, later.",
    "",
    "Open the circle and pick a handle to join in:",
    `   ${connectUrl}`,
    "",
    "Log in with the same email you used on your Stand With Meg survey. If you'd rather not join, you can ignore this email.",
    "",
    "Stand With Meg",
    "StandWithMeg.com",
  ].join("\n");

  const html = brandEmailHtml({
    title: "You're invited to join your Connection Circle",
    preview: "Join the private circle",
    paragraphs: [
      "Hi,",
      `Another family in your Stand With Meg Connection Circle for ${args.actorPhrase} invited you to join the conversation.`,
      "You stay completely anonymous. Everyone in the circle uses a handle. You only share real contact info if you both choose to, later.",
      "Tap the button below to open Connection Circles and pick a handle to join in.",
    ],
    ctaUrl: connectUrl,
    ctaText: "Join Connection Circle",
    footerExtra: "Log in with the same email you used on your Stand With Meg survey. If you'd rather not join, you can ignore this email.",
  });

  await t.transporter.sendMail({
    from: `"Stand With Meg" <${t.from}>`,
    replyTo: t.replyTo,
    to: args.email,
    subject: "You're invited to join your Stand With Meg Connection Circle",
    text: bodyText,
    html,
  });
}

/**
 * Once the recipient has accepted, send a single introduction email to BOTH
 * parties cc'd together, exposing their email addresses for the first time.
 * Includes a short safety preamble.
 */
export async function sendConnectionIntroEmail(args: {
  request: ConnectionRequestRow;
  appOrigin: string;
}): Promise<void> {
  const t = await getTransport();
  const origin = args.appOrigin.replace(/\/+$/, "");
  const actorPhrase = describeActor(args.request);

  const bodyText = [
    "Hi both,",
    "",
    `You've both reported ${actorPhrase} and both agreed to connect through Stand With Meg's Connection Circles. We're introducing you now.`,
    "",
    "From here, the conversation is between the two of you, off of Stand With Meg's platform.",
    "",
    "A few ground rules to keep each other safe:",
    "  - This is peer support and organizing, not legal advice or case strategy.",
    "  - Don't share documents, recordings, or anyone's identifying details that aren't yours to share.",
    "  - If something feels off — pressure, impersonation, anything that doesn't match the protective-parent attestation you both gave — stop the conversation and let us know at info@standwithmeg.com.",
    "",
    `You can manage your Connection Circles activity at ${origin}/connect/requests.`,
    "",
    "Stand With Meg",
    "StandWithMeg.com",
  ].join("\n");

  await t.transporter.sendMail({
    from: `"Stand With Meg" <${t.from}>`,
    replyTo: t.replyTo,
    to: [args.request.requester_email, args.request.recipient_email],
    subject: `You're connected — ${args.request.actor_role} ${args.request.actor_name}`,
    text: bodyText,
  });
}
