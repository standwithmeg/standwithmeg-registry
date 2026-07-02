import {
  CircleAccessError,
  declineRequestByToken,
} from "../../../../../../../lib/connection-circle-matching";

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const cleanToken = String(token || "").trim();
    if (!cleanToken) return Response.json({ error: "Missing token." }, { status: 400 });

    await declineRequestByToken(cleanToken);
    return Response.json({ status: "declined" });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("POST /api/connect/requests/by-token/decline error:", err);
    return Response.json({ error: "Could not decline this request." }, { status: 500 });
  }
}
