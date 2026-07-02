import { after } from "next/server";
import {
  CircleAccessError,
  createConnectionRequest,
  getPseudonym,
  listRequestsForEmail,
  parseActorKey,
  requireConnectAccess,
  writeAudit,
} from "../../../../lib/connection-circle-matching";
import { sendConnectionRequestEmail } from "../../../../lib/connection-circle-emails";
import { appOrigin } from "../../../../lib/connection-circles";

export async function GET() {
  try {
    const ctx = await requireConnectAccess();
    const requests = await listRequestsForEmail(ctx.email);
    return Response.json(requests);
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("GET /api/connect/requests error:", err);
    return Response.json({ error: "Could not load requests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireConnectAccess();
    const body = await request.json().catch(() => ({}));
    const handle = await getPseudonym(ctx.email);
    if (!handle) {
      return Response.json({ error: "Pick a Circle handle before requesting connections." }, { status: 409 });
    }

    const actor = parseActorKey(String(body?.actor_key ?? ""));
    if (!actor) return Response.json({ error: "Missing or invalid actor reference." }, { status: 400 });

    const recipientPseudonym = String(body?.recipient_pseudonym ?? "").trim();
    if (!recipientPseudonym) {
      return Response.json({ error: "Pick a parent to request a connection with." }, { status: 400 });
    }

    const created = await createConnectionRequest({
      requesterEmail: ctx.email,
      requesterSubmitterId: ctx.submitterId,
      requesterHandle: handle.handle,
      recipientPseudonym,
      actor,
      message: typeof body?.message === "string" ? body.message : null,
      attestation: body?.attestation === true,
    });

    const origin = appOrigin(request);
    after(async () => {
      try {
        await sendConnectionRequestEmail({ request: created, appOrigin: origin });
        await writeAudit({
          requestId: created.id,
          actorEmail: created.requester_email,
          event: "request.email_sent",
          detail: { kind: "connection_request" },
        });
      } catch (emailErr) {
        const message = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error("connection request email failed:", message);
        await writeAudit({
          requestId: created.id,
          actorEmail: created.requester_email,
          event: "request.email_failed",
          detail: { kind: "connection_request", message },
        });
      }
    });

    return Response.json({
      request: {
        id: created.id,
        requester_handle: created.requester_handle,
        recipient_handle: created.recipient_handle,
        actor_name: created.actor_name,
        actor_state: created.actor_state,
        actor_role: created.actor_role,
        requester_message: created.requester_message,
        status: created.status,
        requester_attestation_at: created.requester_attestation_at,
        recipient_attestation_at: created.recipient_attestation_at,
        created_at: created.created_at,
        decided_at: created.decided_at,
        intro_sent_at: created.intro_sent_at,
        expires_at: created.expires_at,
      },
    });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("POST /api/connect/requests error:", err);
    return Response.json({ error: "Could not create the connection request." }, { status: 500 });
  }
}
