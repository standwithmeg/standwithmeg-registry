import { requireFounderApi } from "../../../../../lib/social-post/admin-auth";
import { invalidateDiscoverCache } from "../../../../../lib/social-post/discover";
import { stageCourtActorSocialPosts } from "../../../../../lib/social-post/stage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const founder = await requireFounderApi();
    const body = (await request.json().catch(() => ({}))) as {
      dry_run?: boolean;
      requeue_all?: boolean;
      force_requeue?: boolean;
      skip_email?: boolean;
      actor_bucket_key?: string;
    };
    const result = await stageCourtActorSocialPosts({
      dryRun: body.dry_run === true,
      requeueAll: body.requeue_all === true,
      forceRequeue: body.force_requeue === true,
      skipEmail: body.skip_email !== false,
      source: `admin:${founder.email}`,
      actorBucketKey: typeof body.actor_bucket_key === "string" ? body.actor_bucket_key : undefined,
    });
    invalidateDiscoverCache();
    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/admin/social-post-queue/stage error:", message);
    const status = message === "Founder access required." ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
