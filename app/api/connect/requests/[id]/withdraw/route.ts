import {
  CircleAccessError,
  requireConnectAccess,
  withdrawRequestById,
} from "../../../../../../lib/connection-circle-matching";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireConnectAccess();
    const { id } = await context.params;
    const withdrawn = await withdrawRequestById(id, ctx.email);
    return Response.json({ request: withdrawn });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("POST /api/connect/requests/[id]/withdraw error:", err);
    return Response.json({ error: "Could not withdraw the request." }, { status: 500 });
  }
}
