import { appOrigin, findLatestSurveySubmitter, isValidEmail, normalizeEmail } from "../../../../lib/connection-circles";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { createSmtpTransport, summarizeEmailError } from "../../../../lib/smtp-email";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeReturnPath(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/connect")) return "/connect";
  if (raw.startsWith("//")) return "/connect";
  return raw.slice(0, 500);
}

async function sendConnectLoginLink(args: {
  email: string;
  firstName: string | null;
  link: string;
}) {
  const { transporter, fromAddress, replyToAddress } = await createSmtpTransport("Connection Circle login link");
  const greeting = args.firstName?.trim() ? `Hi ${args.firstName.trim()},` : "Hi,";
  const bodyText = [
    greeting,
    "",
    "Use this private link to open Stand With Meg Connection Circles:",
    `   ${args.link}`,
    "",
    "Only use this link if you requested it. It signs in to the survey email that received this message.",
    "",
    "Connection Circles keep your name, email, story, and case details private unless both parents agree to a connection.",
    "",
    "Stand With Meg",
    "StandWithMeg.com",
  ].join("\n");
  const safeGreeting = escapeHtml(greeting);
  const safeLink = escapeHtml(args.link);
  const bodyHtml = [
    `<p>${safeGreeting}</p>`,
    "<p>Use this private link to open Stand With Meg Connection Circles:</p>",
    `<p><a href="${safeLink}" style="display:inline-block;background:#d4a840;color:#0a0f1a;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">Open Connection Circles</a></p>`,
    "<p>Only use this link if you requested it. It signs in to the survey email that received this message.</p>",
    "<p>Connection Circles keep your name, email, story, and case details private unless both parents agree to a connection.</p>",
    "<p>Stand With Meg<br>StandWithMeg.com</p>",
  ].join("\n");

  await transporter.sendMail({
    from: `"Stand With Meg" <${fromAddress}>`,
    replyTo: replyToAddress,
    to: args.email,
    subject: "Your private Connection Circles login link",
    text: bodyText,
    html: bodyHtml,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    if (!email || !isValidEmail(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }

    // Always return the same generic response whether or not the email matches
    // a submitter, to prevent email-enumeration via differing responses.
    const submitter = await findLatestSurveySubmitter(email);

    if (submitter) {
      const origin = appOrigin(request);
      const returnPath = safeReturnPath(body.returnTo);
      const redirectTo = `${origin}${returnPath}`;
      const admin = createAdminSupabaseClient();

      // generateLink type "magiclink" errors for an email with no auth user.
      // First-time submitters don't have one yet (they're identified by survey
      // email, not a prior signup), so create the user first. This branch is
      // only reached for verified submitters, so we never create auth users for
      // arbitrary emails. Ignore "already registered" — that's the happy path
      // for returning users.
      const { error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (createErr && !/already|registered|exist/i.test(createErr.message)) {
        console.error("POST /api/connect/request-link createUser error:", createErr.message);
        return Response.json({ error: "Could not send the login link right now. Please try again in a few minutes." }, { status: 502 });
      }

      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          // Land back on the current Connection Circles page. Supabase's
          // generated link redirects with #access_token=..., which /connect
          // consumes client-side and writes into cookies for server routes.
          redirectTo,
        },
      });
      const link = data?.properties?.action_link;
      if (error || !link) {
        console.error("POST /api/connect/request-link Supabase generateLink error:", error?.message || "missing action_link");
        return Response.json({ error: "Could not send the login link right now. Please try again in a few minutes." }, { status: 502 });
      }
      try {
        await sendConnectLoginLink({ email, firstName: submitter.first_name, link });
      } catch (mailErr) {
        console.error("POST /api/connect/request-link SMTP error:", summarizeEmailError(mailErr));
        return Response.json({ error: "Could not send the login link right now. Please try again in a few minutes." }, { status: 502 });
      }
    }

    // Generic response regardless of outcome — no oracle signal.
    return Response.json({ sent: true });
  } catch (err) {
    console.error("POST /api/connect/request-link error:", err);
    return Response.json({ error: "Could not send the login link." }, { status: 500 });
  }
}
