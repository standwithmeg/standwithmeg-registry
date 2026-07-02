import { after } from "next/server";
import {
  CircleAccessError,
  parseActorKey,
  prepareCircleJoinInvite,
  requireConnectAccess,
} from "../../../../../../lib/connection-circle-matching";
import { sendCircleJoinInviteEmail } from "../../../../../../lib/connection-circle-emails";
import { appOrigin } from "../../../../../../lib/connection-circles";
import { summarizeEmailError } from "../../../../../../lib/smtp-email";

export async function POST(request: Request, context: { params: Promise<{ actorKey: string }> }) {
  try {
    const ctx = await requireConnectAccess();
    const { actorKey } = await context.params;
    const sig = parseActorKey(actorKey);
    if (!sig) return Response.json({ error: "Invalid actor key." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const ref = String(body?.ref ?? "").trim();
    if (!ref) return Response.json({ error: "A parent reference is required." }, { status: 400 });

    const result = await prepareCircleJoinInvite(ctx.email, ctx.submitterId, sig, ref);

    if (result.status === "not_found") {
      return Response.json({ error: "That parent is no longer in your circle." }, { status: 404 });
    }
    if (result.status === "already") {
      return Response.json({ invited: true, already: true });
    }
    if (result.status === "rate_limited") {
      return Response.json({ error: "You've sent a lot of invites today — try again tomorrow." }, { status: 429 });
    }

    // Fire the anonymous email in the background so a slow SMTP never blocks the
    // response. The invite is already recorded, so the UI can show "Invited".
    const origin = appOrigin(request);
    const targetEmail = result.targetEmail!;
    const actorPhrase = result.actorPhrase!;
    after(async () => {
      try {
        await sendCircleJoinInviteEmail({ email: targetEmail, appOrigin: origin, actorPhrase });
      } catch (mailErr) {
        console.error("circle join invite email failed:", summarizeEmailError(mailErr));
      }
    });

    return Response.json({ invited: true });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("POST /api/connect/matches/[actorKey]/invite error:", err);
    return Response.json({ error: "Could not send the invite." }, { status: 500 });
  }
}
