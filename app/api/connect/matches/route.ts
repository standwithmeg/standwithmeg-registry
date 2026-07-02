import { CircleAccessError, listMyActorMatches, requireConnectAccess } from "../../../../lib/connection-circle-matching";

export async function GET() {
  try {
    const ctx = await requireConnectAccess();
    const matches = await listMyActorMatches(ctx.email, ctx.submitterId);
    return Response.json({ matches });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("GET /api/connect/matches error:", err);
    return Response.json({ error: "Could not load matches." }, { status: 500 });
  }
}
