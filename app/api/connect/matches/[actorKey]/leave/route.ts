import { CircleAccessError, leaveCircleRoom, requireConnectAccess } from "../../../../../../lib/connection-circle-matching";

export async function POST(_request: Request, context: { params: Promise<{ actorKey: string }> }) {
  try {
    const ctx = await requireConnectAccess();
    const { actorKey } = await context.params;
    if (!actorKey) return Response.json({ error: "Circle room is required." }, { status: 400 });

    await leaveCircleRoom(ctx, actorKey);
    return Response.json({ left: true });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("POST /api/connect/matches/[actorKey]/leave error:", err);
    return Response.json({ error: "Could not leave this circle." }, { status: 500 });
  }
}
