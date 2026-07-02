import { requireFounderApi } from "../../../../../../lib/social-post/admin-auth";
import { isBlotatoConfigured, publishToBlotato } from "../../../../../../lib/social-post/blotato";
import type { BlotatoPlatform } from "../../../../../../lib/social-post/blotato";
import { findQueueById, logAction, updateQueueStatus } from "../../../../../../lib/social-post/db";
import { invalidateDiscoverCache } from "../../../../../../lib/social-post/discover";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireFounderApi();
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { mark_posted?: boolean; platforms?: string[] };
    const platforms = (body.platforms ?? []).filter((p): p is BlotatoPlatform =>
      ["facebook", "instagram", "x", "twitter"].includes(p)
    );
    const row = await findQueueById(id);
    if (!row) {
      return Response.json({ error: "Post not found." }, { status: 404 });
    }
    if (!isBlotatoConfigured()) {
      return Response.json({ error: "Blotato is not configured." }, { status: 400 });
    }

    const results = await publishToBlotato({
      package: row.package_json,
      platforms: platforms.length ? platforms : undefined,
    });
    const succeeded = results.filter(result => result.success);
    const failed = results.filter(result => !result.success);
    const anyOk = succeeded.length > 0;
    const allOk = failed.length === 0;
    // Only mark fully "posted" when every requested platform succeeded.
    // Partial success leaves the item in the queue (approved) so the user can retry the failed platforms.
    const markPosted = body.mark_posted !== false && allOk;

    if (anyOk && markPosted) {
      await updateQueueStatus({
        id,
        status: "posted",
        postedBy: `blotato:${user.email}`,
      });
      await logAction({
        queueId: id,
        action: "posted",
        source: "blotato",
        actorName: row.actor_name,
        actorBucketKey: row.actor_bucket_key,
      });
      invalidateDiscoverCache();
    } else if (anyOk && failed.length > 0) {
      // Record the partial outcome in notes but leave status as-is (approved_to_post) for retry.
      const partialNote = `Partial publish: succeeded on ${succeeded.map(result => result.platform).join(", ")}; failed on ${failed.map(result => `${result.platform} (${result.error ?? "failed"})`).join("; ")}. Use Publish now again to retry failed platforms.`;
      await updateQueueStatus({
        id,
        status: row.status || "approved_to_post",
        reviewNotes: partialNote,
      });
      invalidateDiscoverCache();
    }

    return Response.json({
      ok: true,
      results,
      posted: anyOk && markPosted,
      partial: anyOk && failed.length > 0,
      succeeded_platforms: succeeded.map(result => result.platform),
      failed_platforms: failed.map(result => result.platform),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Founder access required.") {
      return Response.json({ error: message }, { status: 403 });
    }
    console.error("POST publish social post error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
