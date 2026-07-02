import { CircleAccessError, requireConnectAccess } from "../../../../../../lib/connection-circle-matching";
import { deleteOwnMessage } from "../../../../../../lib/connection-circle-chat";

export async function DELETE(_request: Request, context: { params: Promise<{ actorKey: string; messageId: string }> }) {
  try {
    const ctx = await requireConnectAccess();
    const { actorKey, messageId } = await context.params;
    await deleteOwnMessage(ctx, actorKey, messageId);
    return Response.json({ deleted: true });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("DELETE /api/connect/chat/[actorKey]/[messageId] error:", err);
    return Response.json({ error: "Could not remove the message." }, { status: 500 });
  }
}
