import {
  CircleAccessError,
  listParentsForActor,
  parseActorKey,
  requireConnectAccess,
  resolveCircleActor,
} from "../../../../../lib/connection-circle-matching";

export async function GET(_request: Request, context: { params: Promise<{ actorKey: string }> }) {
  try {
    const ctx = await requireConnectAccess();
    const { actorKey } = await context.params;
    const sig = parseActorKey(actorKey);
    if (!sig) return Response.json({ error: "Invalid actor key." }, { status: 400 });

    const [actor, parents] = await Promise.all([
      resolveCircleActor(ctx.email, sig),
      listParentsForActor(ctx.email, ctx.submitterId, sig),
    ]);
    return Response.json({ actor, parents });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("GET /api/connect/matches/[actorKey] error:", err);
    return Response.json({ error: "Could not load parents for this match." }, { status: 500 });
  }
}
