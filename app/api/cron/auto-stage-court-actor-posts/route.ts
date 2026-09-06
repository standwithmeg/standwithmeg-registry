import { autoQueueCrossedTodayWithPhotos } from "../../../../lib/social-post/auto-queue-today";
import { stageCourtActorSocialPosts } from "../../../../lib/social-post/stage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  const auth = request.headers.get("Authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dry_run") === "true";
  const requeueAll = searchParams.get("requeue_all") === "true";

  // Daily staging is reviewed in the dashboard. Never send approval mail from
  // either cron staging path, including retries and requests with skip_email=false.
  const skipEmail = true;

  try {
    const autoQueued = dryRun
      ? { ok: true as const, candidates: 0, queued: 0, staged: [], skipped: [] }
      : await autoQueueCrossedTodayWithPhotos({ skipEmail, source: "cron:auto-queue-today" });
    const result = await stageCourtActorSocialPosts({ dryRun, requeueAll, skipEmail, source: "cron" });
    return Response.json({ ...result, auto_queued_today: autoQueued });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("auto-stage-court-actor-posts error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
