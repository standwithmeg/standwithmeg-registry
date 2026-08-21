import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { getGmailClient, getMessage, listMessages, modifyMessageLabels, targetGmailMailboxEmail } from "../../../../lib/gmail";
import {
  findOpenQueueRows,
  isEmailReplyProcessed,
  logAction,
  recordEmailReply,
  updateQueueStatus,
} from "../../../../lib/social-post/db";
import type { GmailMessage } from "../../../../lib/gmail";
import type { SocialPostStatus } from "../../../../lib/social-post/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

function approvalEmailAddress(): string {
  return targetGmailMailboxEmail();
}

function extractHeader(msg: GmailMessage, name: string): string {
  const headers = msg.payload?.headers ?? [];
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBase64UrlSafe(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  try {
    return decodeURIComponent(
      Array.from(atob(padded))
        .map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
  } catch {
    return atob(padded);
  }
}

function extractTextBody(msg: GmailMessage): string {
  const parts = msg.payload?.parts ?? [msg.payload];
  const textPart = parts.find(p => p?.mimeType === "text/plain");
  const htmlPart = parts.find(p => p?.mimeType === "text/html");
  const data = textPart?.body?.data ?? htmlPart?.body?.data;
  if (data) return decodeBase64UrlSafe(data);
  return msg.snippet ?? "";
}

type ParsedAction = { action: SocialPostStatus; matchedQueueId: string } | null;

function parseReplyAction(text: string, openRows: Awaited<ReturnType<typeof findOpenQueueRows>>): ParsedAction {
  const lower = text.toLowerCase();
  const lines = [lower, text.toLowerCase()];

  for (const line of lines) {
    const approveMatch = line.match(/(?:approve|approved|yes)\s+(.{2,80})/);
    const rejectMatch = line.match(/(?:reject|rejected|no|deny)\s+(.{2,80})/);
    const skipMatch = line.match(/(?:skip|skipped)\s+(.{2,80})/);

    const targetMatch = approveMatch || rejectMatch || skipMatch;
    if (!targetMatch) continue;

    const target = targetMatch[1].trim();
    const row = openRows.find(r => {
      const nameLower = r.actor_name.toLowerCase();
      return target.includes(nameLower) || nameLower.includes(target);
    });
    if (!row) continue;

    if (approveMatch) return { action: "approved_to_post", matchedQueueId: row.id };
    if (rejectMatch) return { action: "rejected", matchedQueueId: row.id };
    if (skipMatch) return { action: "rejected", matchedQueueId: row.id };
  }

  // Fallback: bare approve/reject without a name applies to the most recent pending row.
  const mostRecent = openRows.find(r => r.status === "pending_review" || r.status === "needs_review");
  if (!mostRecent) return null;
  if (/\b(approve|approved|yes)\b/.test(lower)) return { action: "approved_to_post", matchedQueueId: mostRecent.id };
  if (/\b(reject|rejected|no|deny)\b/.test(lower)) return { action: "rejected", matchedQueueId: mostRecent.id };
  if (/\b(skip|skipped)\b/.test(lower)) return { action: "rejected", matchedQueueId: mostRecent.id };
  return null;
}

export async function GET(request: Request) {
  const auth = request.headers.get("Authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const approvalEmail = approvalEmailAddress();
  if (!approvalEmail) {
    return Response.json(
      { error: "SOCIAL_POST_APPROVAL_EMAIL, GOOGLE_SMTP_USER, or FOUNDER_EMAIL must be set." },
      { status: 500 },
    );
  }

  try {
    const admin = createAdminSupabaseClient();
    const gmailClient = await getGmailClient(admin, approvalEmail);
    const openRows = await findOpenQueueRows();

    const messages = await listMessages(gmailClient, {
      q: 'subject:"Approve post:" is:unread',
      maxResults: 50,
    });

    const processed: Array<{ message_id: string; action: string; actor?: string }> = [];
    const errors: string[] = [];

    for (const meta of messages) {
      if (!meta.id) continue;
      if (await isEmailReplyProcessed(meta.id)) continue;

      const msg = await getMessage(gmailClient, meta.id, "full");
      const from = extractHeader(msg, "from");

      // Ignore the original outbound staging email (sent from this address).
      if (from.toLowerCase().includes(approvalEmail.toLowerCase())) {
        await recordEmailReply({
          queueId: null,
          messageId: meta.id,
          threadId: msg.threadId,
          action: "unknown",
          rawSnippet: "Outbound staging email skipped.",
        });
        continue;
      }

      const body = extractTextBody(msg);
      const parsed = parseReplyAction(body, openRows);

      if (!parsed) {
        await recordEmailReply({
          queueId: null,
          messageId: meta.id,
          threadId: msg.threadId,
          action: "unknown",
          rawSnippet: msg.snippet ?? body.slice(0, 200),
        });
        await modifyMessageLabels(gmailClient, meta.id, { removeLabelIds: ["UNREAD"] });
        continue;
      }

      const row = openRows.find(r => r.id === parsed.matchedQueueId);
      if (!row) {
        errors.push(`Matched row disappeared for message ${meta.id}`);
        continue;
      }

      try {
        await updateQueueStatus({
          id: row.id,
          status: parsed.action,
          approvedBy: `email_reply:${approvalEmail}`,
        });
        await logAction({
          queueId: row.id,
          action: parsed.action === "approved_to_post" ? "approved" : "rejected",
          source: "email_reply",
          actorName: row.actor_name,
          actorBucketKey: row.actor_bucket_key,
        });
        await recordEmailReply({
          queueId: row.id,
          messageId: meta.id,
          threadId: msg.threadId,
          action: parsed.action === "approved_to_post" ? "approved" : "rejected",
          rawSnippet: msg.snippet ?? body.slice(0, 200),
        });
        await modifyMessageLabels(gmailClient, meta.id, { removeLabelIds: ["UNREAD"] });
        processed.push({ message_id: meta.id, action: parsed.action, actor: row.actor_name });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${row.actor_name}: ${message}`);
      }
    }

    return Response.json({ ok: true, processed, errors, scanned: messages.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("scan-social-post-replies error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
