import { CircleAccessError, getPseudonym, requireConnectAccess, setPseudonym } from "../../../../lib/connection-circle-matching";

export async function GET() {
  try {
    const ctx = await requireConnectAccess();
    const pseudonym = await getPseudonym(ctx.email);
    return Response.json({ pseudonym });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("GET /api/connect/pseudonym error:", err);
    return Response.json({ error: "Could not load pseudonym." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireConnectAccess();
    const body = await request.json().catch(() => ({}));
    const handle = String(body?.handle ?? "");
    const pseudonym = await setPseudonym(ctx.email, handle);
    return Response.json({ pseudonym });
  } catch (err) {
    if (err instanceof CircleAccessError) return Response.json({ error: err.message }, { status: err.status });
    console.error("POST /api/connect/pseudonym error:", err);
    return Response.json({ error: "Could not save pseudonym." }, { status: 500 });
  }
}
