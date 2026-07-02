import {
  acceptRequestByToken,
  CircleAccessError,
  markIntroSent,
  writeAudit,
} from "../../../../../../../lib/connection-circle-matching";
import { sendConnectionIntroEmail } from "../../../../../../../lib/connection-circle-emails";
import { appOrigin } from "../../../../../../../lib/connection-circles";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const cleanToken = String(token || "").trim();
    if (!cleanToken) return Response.json({ error: "Missing token." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const attestation = body?.attestation === true;

    const accepted = await acceptRequestByToken(cleanToken, attestation);

    const origin = appOrigin(request);
    let introEmailSent = true;
    let introWarning: string | null = null;
    try {
      await sendConnectionIntroEmail({ request: accepted, appOrigin: origin });
      await markIntroSent(accepted.id);
      await writeAudit({
        requestId: accepted.id,
        actorEmail: accepted.recipient_email,
        event: "request.email_sent",
        detail: { kind: "connection_intro" },
      });
    } catch (emailErr) {
      introEmailSent = false;
      const message = emailErr instanceof Error ? emailErr.message : String(emailErr);
      introWarning = "You're connected, but the introduction email could not be sent. Check spam or contact support if neither of you receives it.";
      console.error("connection intro email failed:", message);
      await writeAudit({
        requestId: accepted.id,
        actorEmail: accepted.recipient_email,
        event: "request.email_failed",
        detail: { kind: "connection_intro", message },
      });
    }

    // Strip sensitive identity fields before responding to the client.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { requester_email, recipient_email, recipient_token, ...safeAccepted } = accepted;
    return Response.json({ request: safeAccepted, intro_email_sent: introEmailSent, warning: introWarning });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("POST /api/connect/requests/by-token/accept error:", err);
    return Response.json({ error: "Could not accept this request." }, { status: 500 });
  }
}
