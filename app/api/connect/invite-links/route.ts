import {
  CircleAccessError,
  requireConnectAccess,
} from "../../../../lib/connection-circle-matching";
import {
  createInviteLink,
  listInviteLinks,
  revokeInviteLink,
} from "../../../../lib/connection-circle-invites";
import { appOrigin } from "../../../../lib/connection-circles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireConnectAccess();
    const result = await listInviteLinks(ctx.email);
    return Response.json(result);
  } catch (err) {
    if (err instanceof CircleAccessError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/connect/invite-links error:", err);
    return Response.json({ error: "Could not load invite links." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const ctx = await requireConnectAccess();
    const link = await createInviteLink(ctx.email);
    const origin = appOrigin(new Request("https://my.standwithmeg.com"));
    return Response.json({
      link,
      url: `${origin}/connect/invite/${link.token}`,
    });
  } catch (err) {
    if (err instanceof CircleAccessError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/connect/invite-links error:", err);
    return Response.json({ error: "Could not create invite link." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireConnectAccess();
    const body = await request.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    if (!id) return Response.json({ error: "Link id is required." }, { status: 400 });
    await revokeInviteLink(ctx.email, id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof CircleAccessError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("PATCH /api/connect/invite-links error:", err);
    return Response.json({ error: "Could not revoke invite link." }, { status: 500 });
  }
}
