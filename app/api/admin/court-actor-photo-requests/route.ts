import { createServerSupabaseClient } from "../../../../lib/supabase";
import { isAdminEmail } from "../../../../lib/require-auth";
import {
  getPublicActorsWithReporters,
  loadExistingNotifications,
  loadRecentNotifications,
  notificationDedupeKey,
} from "../../../../lib/court-actor-public-notifications";

/**
 * GET /api/admin/court-actor-photo-requests
 *
 * Admin-only preview of the automatic public-threshold photo request
 * workflow. Mirrors what `scripts/send-public-court-actor-photo-requests.ts`
 * would do on a real run, without sending anything or writing rows.
 *
 * Response shape:
 *   {
 *     threshold: number,
 *     buckets: Array<{
 *       actor_bucket_key: string,
 *       canonical_name: string,
 *       role_summary: string,
 *       location_key: string,
 *       state_code: string | null,
 *       family_count: number,
 *       reporters: Array<{
 *         reporter_email: string,
 *         reporter_first_name: string | null,
 *         submission_id: string,
 *         court_actor_row_id: string,
 *         status: "would_send" | "already_sent" | "previously_failed" | "previously_skipped" | "previously_pending",
 *         last_sent_at: string | null,
 *         last_error: string | null,
 *       }>,
 *     }>,
 *     totals: { would_send: number, already_sent: number, previously_failed: number },
 *   }
 *
 * Reporter PII is only returned to admins; this endpoint requires
 * isAdminEmail() and never exposes raw counts/notes from other reporters.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isAdminEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const buckets = await getPublicActorsWithReporters();
    const notifications = await loadExistingNotifications();

    const sentByKey = new Map<string, { sent_at: string | null }>();
    const lastByKey = new Map<string, typeof notifications[number]>();
    for (const n of notifications) {
      const key = notificationDedupeKey(n.reporter_email, n.actor_bucket_key);
      if (n.status === "sent") {
        sentByKey.set(key, { sent_at: n.sent_at });
      }
      const existing = lastByKey.get(key);
      if (!existing || existing.created_at < n.created_at) {
        lastByKey.set(key, n);
      }
    }

    let wouldSend = 0;
    let alreadySent = 0;
    let previouslyFailed = 0;

    const decorated = buckets.map(b => ({
      actor_bucket_key: b.actor_bucket_key,
      canonical_name: b.canonical_name,
      role_summary: b.role_summary,
      location_key: b.location_key,
      state_code: b.state_code,
      family_count: b.family_count,
      reporters: b.reporters.map(r => {
        const key = notificationDedupeKey(r.reporter_email, b.actor_bucket_key);
        const sent = sentByKey.get(key);
        const last = lastByKey.get(key) ?? null;
        let status:
          | "would_send"
          | "already_sent"
          | "previously_failed"
          | "previously_skipped"
          | "previously_pending" = "would_send";
        if (sent) {
          status = "already_sent";
          alreadySent += 1;
        } else if (last?.status === "failed") {
          status = "previously_failed";
          previouslyFailed += 1;
          wouldSend += 1; // a failed row is still resendable
        } else if (last?.status === "skipped") {
          status = "previously_skipped";
          wouldSend += 1;
        } else if (last?.status === "pending") {
          status = "previously_pending";
          wouldSend += 1;
        } else {
          wouldSend += 1;
        }
        return {
          reporter_email: r.reporter_email,
          reporter_first_name: r.reporter_first_name,
          submission_id: r.submission_id,
          court_actor_row_id: r.court_actor_row_id,
          status,
          last_sent_at: sent?.sent_at ?? null,
          last_error: last?.error_message ?? null,
        };
      }),
    }));

    const recent = await loadRecentNotifications(50);

    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent7d = recent.filter(r => Date.parse(r.created_at) >= sevenDaysAgoMs);
    const sent7d = recent7d.filter(r => r.status === "sent").length;
    const failed7d = recent7d.filter(r => r.status === "failed").length;
    const lastSentAt = recent.find(r => r.status === "sent")?.sent_at ?? null;

    return Response.json({
      threshold: 3,
      buckets: decorated,
      totals: {
        would_send: wouldSend,
        already_sent: alreadySent,
        previously_failed: previouslyFailed,
        sent_last_7d: sent7d,
        failed_last_7d: failed7d,
        last_sent_at: lastSentAt,
      },
      recent,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed.";
    console.error("GET /api/admin/court-actor-photo-requests error:", err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
