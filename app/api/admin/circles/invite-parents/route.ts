import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createSmtpTransport } from "../../../../../lib/smtp-email";
import { isFounderEmail } from "../../../../../lib/require-auth";
import { cleanMultiline, cleanSingleLine, isValidEmail } from "../../../../../lib/connection-circles";

async function requireFounderEmail(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isFounderEmail(user.email) ? user.email.toLowerCase() : null;
}

function inviteBody(personalNote: string | null): string {
  const noteBlock = personalNote ? `\n${cleanMultiline(personalNote, 600)}\n` : "";
  return `Hi,${noteBlock}

You came to mind because I think Connection Circles could help you find other parents who have been through the same courtroom.

Connection Circles are private rooms for Stand With Meg survey submitters who reported the same court actor. You stay anonymous unless both sides agree to connect.

If you want in:
1. Take the survey (if you haven't yet): https://my.standwithmeg.com/survey
2. Then log in with that same email: https://my.standwithmeg.com/connect

No pressure — just wanted you to know this exists.

Meg
Stand With Meg
https://my.standwithmeg.com
`;
}

export async function POST(request: Request) {
  try {
    const founderEmail = await requireFounderEmail();
    if (!founderEmail) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const rawEmails = Array.isArray(body.emails) ? body.emails : [];
    const personalNote = cleanMultiline(body.note, 600) || null;

    const emails = rawEmails
      .map((e: unknown) => cleanSingleLine(e, 120).toLowerCase())
      .filter((e: string) => isValidEmail(e));

    if (emails.length === 0) {
      return Response.json({ error: "At least one valid email is required." }, { status: 400 });
    }

    const { transporter, fromAddress, replyToAddress } = await createSmtpTransport("Stand With Meg");
    const failed: string[] = [];
    let sent = 0;

    for (const email of emails) {
      try {
        await transporter.sendMail({
          from: `"Meg, Stand With Meg" <${fromAddress}>`,
          replyTo: replyToAddress,
          to: email,
          subject: "An invitation to Stand With Meg Connection Circles",
          text: inviteBody(personalNote),
        });
        sent += 1;
      } catch (err) {
        console.error(`invite-parents send failed for ${email}:`, err);
        failed.push(email);
      }
    }

    return Response.json({ sent, failed, total: emails.length });
  } catch (err) {
    console.error("POST /api/admin/circles/invite-parents error:", err);
    return Response.json({ error: "Could not send invites." }, { status: 500 });
  }
}
