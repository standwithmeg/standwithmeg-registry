import { requireFounderApi } from "../../../../../../lib/social-post/admin-auth";
import { isBlotatoConfigured, publishToBlotato } from "../../../../../../lib/social-post/blotato";
import type { BlotatoPlatform } from "../../../../../../lib/social-post/blotato";
import { findQueueById, logAction, updateQueueStatus } from "../../../../../../lib/social-post/db";

export const dynamic = "force-dynamic";

async function approvePost(id: string, userEmail: string, autoPublish = false, platforms?: BlotatoPlatform[]) {
  const row = await findQueueById(id);
  if (!row) {
    return { error: "Post not found.", status: 404 };
  }
  if (row.status === "approved_to_post" || row.status === "posted") {
    return { ok: true, already: true, row, blotato_configured: isBlotatoConfigured() };
  }

  const approved = await updateQueueStatus({
    id,
    status: "approved_to_post",
    approvedBy: `dashboard:${userEmail}`,
  });
  await logAction({
    queueId: id,
    action: "approved",
    source: "dashboard",
    actorName: approved.actor_name,
    actorBucketKey: approved.actor_bucket_key,
  });

  const blotatoConfigured = isBlotatoConfigured();
  let publishResults: Awaited<ReturnType<typeof publishToBlotato>> | undefined;
  if (autoPublish) {
    if (!blotatoConfigured) {
      const targetPlatforms = platforms?.length ? platforms : (["facebook", "instagram", "x"] as const);
      publishResults = targetPlatforms.map(platform => ({
        platform,
        success: false,
        error: `Blotato is not configured. Set BLOTATO_API_KEY and BLOTATO_ACCOUNT_${platform.toUpperCase()} to publish automatically.`,
      }));
    } else {
      publishResults = await publishToBlotato({ package: approved.package_json, platforms });
      const succeeded = publishResults.filter(result => result.success);
      const failed = publishResults.filter(result => !result.success);
      if (succeeded.length > 0) {
        const partialNote = failed.length > 0
          ? `Posted to ${succeeded.map(result => result.platform).join(", ")}. Still need manual follow-up: ${failed.map(result => `${result.platform} (${result.error ?? "failed"})`).join("; ")}.`
          : undefined;
        await updateQueueStatus({
          id,
          status: "posted",
          postedBy: `blotato:${userEmail}`,
          reviewNotes: partialNote,
        });
        await logAction({
          queueId: id,
          action: "posted",
          source: "blotato",
          actorName: approved.actor_name,
          actorBucketKey: approved.actor_bucket_key,
        });
      }
    }
  }

  return { ok: true, row: approved, publish_results: publishResults, blotato_configured: blotatoConfigured };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireFounderApi();
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { publish?: boolean; platforms?: string[] };
    const platforms = (body.platforms ?? []).filter((p): p is BlotatoPlatform =>
      ["facebook", "instagram", "x", "twitter"].includes(p)
    );
    const result = await approvePost(id, user.email, body.publish === true, platforms.length ? platforms : undefined);
    if (result.error) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Founder access required.") {
      return Response.json({ error: message }, { status: 403 });
    }
    console.error("POST approve social post error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

function adminRedirect(path: string): Response {
  return Response.redirect(new URL(path, process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com"));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireFounderApi();
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const autoPublish = searchParams.get("publish") === "true";
    const result = await approvePost(id, user.email, autoPublish);
    if (result.error) {
      return adminRedirect(`/admin?error=${encodeURIComponent(result.error)}`);
    }

    const posted = result.publish_results && result.publish_results.every(r => r.success);
    if (result.already) {
      return adminRedirect("/admin?toast=already-approved");
    }
    if (autoPublish && !result.blotato_configured) {
      return adminRedirect(`/admin?toast=approved-but-blotato-not-configured&error=${encodeURIComponent("Blotato is not configured. Set BLOTATO_API_KEY and the BLOTATO_ACCOUNT_* environment variables to publish automatically.")}`);
    }
    if (autoPublish && result.publish_results && !posted) {
      const firstError = result.publish_results.find(r => !r.success)?.error ?? "Publish failed";
      return adminRedirect(`/admin?toast=approved-but-publish-failed&error=${encodeURIComponent(firstError)}`);
    }
    return adminRedirect(posted ? "/admin?toast=approved-and-posted" : "/admin?toast=approved");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Founder access required.") {
      return adminRedirect(`/admin?error=${encodeURIComponent("Please sign in as founder first.")}`);
    }
    console.error("GET approve social post error:", message);
    return adminRedirect(`/admin?error=${encodeURIComponent(message)}`);
  }
}
