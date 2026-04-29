import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../lib/require-auth";
import nodemailer from "nodemailer";

/**
 * POST /api/admin/send-nudge
 * Body: { to: string, subject: string, body: string }
 *
 * Sends email from info@standwithmeg.com via Google Workspace SMTP.
 * Requires env: GOOGLE_SMTP_USER, GOOGLE_SMTP_PASSWORD (16-char app password).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isAdminEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { to, subject, body, html, actor_id } = await request.json();
    if (!to || !subject || !body) {
      return Response.json({ error: "to, subject, body required." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return Response.json({ error: "Invalid recipient email." }, { status: 400 });
    }

    const smtpUser = process.env.GOOGLE_SMTP_USER;
    const smtpPass = process.env.GOOGLE_SMTP_PASSWORD;
    // GOOGLE_SMTP_FROM = what recipients see in the From: header (e.g. info@).
    // GOOGLE_SMTP_REPLY_TO = what hitting "Reply" sends to (defaults to the From).
    // If GOOGLE_SMTP_FROM is omitted, we use smtpUser for both.
    const fromAddress = process.env.GOOGLE_SMTP_FROM || smtpUser;
    const replyToAddress = process.env.GOOGLE_SMTP_REPLY_TO || fromAddress;
    if (!smtpUser || !smtpPass) {
      return Response.json({
        error: "Email sending not configured. Add GOOGLE_SMTP_USER and GOOGLE_SMTP_PASSWORD to .env.local.",
      }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const info = await transporter.sendMail({
      from: `"Stand With Meg" <${fromAddress}>`,
      replyTo: replyToAddress,
      to,
      subject,
      text: body,
      ...(html ? { html } : {}),
    });

    let nudgeTracked = false;
    if (actor_id && typeof actor_id === "string") {
      const adminSupabase = createAdminSupabaseClient();
      const { error: trackError } = await adminSupabase
        .from("court_actors")
        .update({
          nudge_sent_at: new Date().toISOString(),
          nudge_sent_by: user.email,
          nudge_sent_to: to,
          nudge_last_subject: subject,
        })
        .eq("id", actor_id);

      if (trackError) {
        // Do not report the email as failed after SMTP succeeded. This can
        // happen briefly if the deployment is live before migration 015 runs.
        console.error("court actor nudge tracking error:", trackError.message);
      } else {
        nudgeTracked = true;
      }
    }

    return Response.json({ success: true, messageId: info.messageId, nudgeTracked });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed.";
    console.error("POST /api/admin/send-nudge error:", err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
