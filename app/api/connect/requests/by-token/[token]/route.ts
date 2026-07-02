import { getRequestByToken } from "../../../../../../lib/connection-circle-matching";

/**
 * Anonymous fetch for the recipient — token IS the authorization. Returns a
 * trimmed view that hides the requester's email, since the recipient hasn't
 * accepted yet.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const cleanToken = String(token || "").trim();
    if (!cleanToken) return Response.json({ valid: false }, { status: 400 });

    const row = await getRequestByToken(cleanToken);
    if (!row) return Response.json({ valid: false });
    if (new Date(row.expires_at) <= new Date() && row.status === "pending") {
      return Response.json({ valid: false, expired: true });
    }

    return Response.json({
      valid: true,
      request: {
        id: row.id,
        status: row.status,
        actor_name: row.actor_name,
        actor_state: row.actor_state,
        actor_role: row.actor_role,
        requester_handle: row.requester_handle,
        requester_message: row.requester_message,
        created_at: row.created_at,
        expires_at: row.expires_at,
      },
    });
  } catch (err) {
    console.error("GET /api/connect/requests/by-token error:", err);
    return Response.json({ error: "Could not load this connection request." }, { status: 500 });
  }
}
