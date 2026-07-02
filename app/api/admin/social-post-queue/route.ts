import { requireFounderApi } from "../../../../lib/social-post/admin-auth";
import {
  crossedThresholdTodayCandidates,
  discoverSocialPostCandidates,
  missingPhotoCandidates,
  readyToQueueCandidates,
} from "../../../../lib/social-post/discover";
import { listPostedQueueRows, listQueueByStatus } from "../../../../lib/social-post/db";
import type { SocialPostStatus } from "../../../../lib/social-post/types";

export const dynamic = "force-dynamic";

const VALID_STATUSES: SocialPostStatus[] = [
  "pending_review",
  "approved_to_post",
  "posted",
  "rejected",
  "needs_review",
];

export async function GET(request: Request) {
  try {
    await requireFounderApi();
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status") ?? "inbox";
    if (statusParam === "inbox") {
      const [pending, needs, discover] = await Promise.all([
        listQueueByStatus("pending_review"),
        listQueueByStatus("needs_review"),
        discoverSocialPostCandidates({ mode: "lite" }),
      ]);
      const priorityByKey = new Map<string, number>();
      for (const list of [discover.not_queued, discover.stale_open, discover.staged_today]) {
        for (const candidate of list) {
          const existing = priorityByKey.get(candidate.actor_bucket_key);
          if (existing === undefined || candidate.priority_tier < existing) {
            priorityByKey.set(candidate.actor_bucket_key, candidate.priority_tier);
          }
        }
      }
      const merged = [...pending, ...needs].sort((a, b) => {
        const aTier = priorityByKey.get(a.actor_bucket_key) ?? 3;
        const bTier = priorityByKey.get(b.actor_bucket_key) ?? 3;
        if (aTier !== bTier) return aTier - bTier;
        if (a.status !== b.status) return a.status === "needs_review" ? -1 : 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
      return Response.json({
        rows: merged,
        view: "inbox",
        discover,
        summary: {
          review_count: merged.length,
          crossed_today: crossedThresholdTodayCandidates(discover).length,
          ready_to_queue: readyToQueueCandidates(discover).length,
          missing_photo: missingPhotoCandidates(discover).length,
          stale_open: discover.stale_open.length,
        },
      });
    }
    if (statusParam === "posted_manual") {
      const rows = await listPostedQueueRows(true);
      return Response.json({ rows, view: "posted_manual" });
    }
    const status = statusParam as SocialPostStatus;
    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: "Invalid status." }, { status: 400 });
    }
    if (status === "posted") {
      const rows = await listPostedQueueRows(false);
      return Response.json({ rows, view: "posted" });
    }
    const rows = await listQueueByStatus(status);
    return Response.json({ rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Founder access required.") {
      return Response.json({ error: message }, { status: 403 });
    }
    console.error("GET /api/admin/social-post-queue error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
