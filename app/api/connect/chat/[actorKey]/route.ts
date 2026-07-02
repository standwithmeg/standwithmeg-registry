import { CircleAccessError, requireConnectAccess } from "../../../../../lib/connection-circle-matching";
import { listMessages, postMessage } from "../../../../../lib/connection-circle-chat";

export async function GET(request: Request, context: { params: Promise<{ actorKey: string }> }) {
  try {
    const ctx = await requireConnectAccess();
    const { actorKey } = await context.params;
    const after = new URL(request.url).searchParams.get("after");
    const messages = await listMessages(ctx, actorKey, after);
    return Response.json({ messages });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("GET /api/connect/chat/[actorKey] error:", err);
    return Response.json({ error: "Could not load the circle conversation." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ actorKey: string }> }) {
  try {
    const ctx = await requireConnectAccess();
    const { actorKey } = await context.params;
    const body = await request.json().catch(() => ({}));
    const message = await postMessage(ctx, actorKey, String(body?.body ?? ""));
    return Response.json({ message });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("POST /api/connect/chat/[actorKey] error:", err);
    return Response.json({ error: "Could not send your message." }, { status: 500 });
  }
}
