/**
 * Emails for the State Partner application flow (/partners).
 *
 * Two messages per application, both fire-and-forget from the request path:
 *   1. An internal notification so the team can review the applicant.
 *   2. An auto-reply to the applicant setting the 2–3 day expectation.
 *
 * Either send throws if SMTP is misconfigured; callers should `.catch()` so a
 * flaky mail server never blocks an application from being accepted.
 */

import { createSmtpTransport } from "./smtp-email";

const NOTIFY_TO = "meg@standwithmeg.com";

export type PartnerApplication = {
  full_name: string;
  email: string;
  phone: string;
  region: string;
  connection: string;
  why: string;
  role_interest?: string;
  businesses_in_mind?: string;
  experience?: string;
  socials?: string;
  heard_from?: string;
};

/** Internal "new partner applied" notification to the team. */
export async function sendPartnerNotificationEmail(app: PartnerApplication): Promise<void> {
  const { transporter, fromAddress } = await createSmtpTransport("Partner notification");
  const lines = [
    "New State Partner application:",
    "",
    `Name:        ${app.full_name}`,
    `Email:       ${app.email}`,
    `Phone:       ${app.phone}`,
    `Region:      ${app.region}`,
    `Connection:  ${app.connection}`,
    `Role:        ${app.role_interest || "—"}`,
    "",
    "Why they want to do this:",
    app.why,
    "",
    `Businesses in mind: ${app.businesses_in_mind || "—"}`,
    `Experience:         ${app.experience || "—"}`,
    `Socials:            ${app.socials || "—"}`,
    `Heard from:         ${app.heard_from || "—"}`,
    "",
    "Review for mission fit, then approve or decline.",
  ].join("\n");

  await transporter.sendMail({
    from: `"Stand With Meg" <${fromAddress}>`,
    to: NOTIFY_TO,
    replyTo: app.email,
    subject: `New State Partner application — ${app.full_name} (${app.region})`,
    text: lines,
  });
}

/** Auto-reply to the applicant. */
export async function sendPartnerAutoReplyEmail(app: PartnerApplication): Promise<void> {
  const { transporter, fromAddress } = await createSmtpTransport("Partner auto-reply");
  const firstName = app.full_name.trim().split(/\s+/)[0] || "there";
  const text = [
    `Hi ${firstName},`,
    "",
    "Thank you for applying to stand with families as a Stand With Meg State Partner.",
    "",
    "We review every partner personally — you'll hear from us within 2–3 days. If you're approved, we'll send your code of conduct, brand kit, scripts, and training, and set you up to earn.",
    "",
    "In the meantime, the playbook that shows exactly what you'd sell and what to say is here:",
    "https://my.standwithmeg.com/partners/how-to-sell",
    "",
    "Thank you for stepping up.",
    "",
    "Meg",
    "StandWithMeg.com",
  ].join("\n");

  await transporter.sendMail({
    from: `"Stand With Meg" <${fromAddress}>`,
    to: app.email,
    replyTo: NOTIFY_TO,
    subject: "Thanks for applying to Stand With Meg — what happens next",
    text,
  });
}
