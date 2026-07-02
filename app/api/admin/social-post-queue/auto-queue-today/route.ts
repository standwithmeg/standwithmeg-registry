import { requireFounderApi } from "../../../../../lib/social-post/admin-auth";
import { autoQueueCrossedTodayWithPhotos } from "../../../../../lib/social-post/auto-queue-today";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const founder = await requireFounderApi();
    const body = (await request.json().catch(() => ({}))) as { max?: number };
    const result = await autoQueueCrossedTodayWithPhotos({
      max: typeof body.max === "number" ? body.max : undefined,
      skipEmail: true,
      source: `admin:${founder.email}`,
    });
    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/admin/social-post-queue/auto-queue-today error:", message);
    const status = message === "Founder access required." ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}