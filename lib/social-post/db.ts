import { createAdminSupabaseClient } from "../supabase-admin";
import { enrichPackageLegislators } from "./package";
import type { SocialPostAction, SocialPostPackage, SocialPostStatus } from "./types";

export type QueueInsert = {
  actor_bucket_key: string;
  actor_slug: string;
  state_abbr: string;
  actor_name: string;
  role: string;
  county: string | null;
  status: SocialPostStatus;
  package_json: SocialPostPackage;
  email_thread_id?: string | null;
  email_message_id?: string | null;
  email_sent_message_id?: string | null;
  review_notes?: string | null;
};

function enrichQueueRow(row: QueueRow): QueueRow {
  const pkg = row.package_json;
  const pkgWithCounty = !pkg.county && row.county ? { ...pkg, county: row.county } : pkg;
  return {
    ...row,
    package_json: enrichPackageLegislators(pkgWithCounty),
  };
}

function postedAtSortKey(row: QueueRow): number {
  const iso = row.posted_at ?? row.updated_at ?? row.created_at;
  return new Date(iso).getTime();
}

function sortPostedRows(rows: QueueRow[]): QueueRow[] {
  return [...rows].sort((a, b) => postedAtSortKey(b) - postedAtSortKey(a));
}

export type QueueRow = {
  id: string;
  actor_bucket_key: string;
  actor_slug: string;
  state_abbr: string;
  actor_name: string;
  role: string;
  county: string | null;
  status: SocialPostStatus;
  package_json: SocialPostPackage;
  email_thread_id: string | null;
  email_message_id: string | null;
  email_sent_message_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
  posted_at: string | null;
  posted_by: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function getQueuedActorBucketKeys(): Promise<Set<string>> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb.from("social_post_queue").select("actor_bucket_key");
  if (error) {
    throw new Error(`Failed to load queued actor keys: ${error.message}`);
  }
  return new Set((data ?? []).map(r => r.actor_bucket_key));
}

export async function getQueuedPostsByBucketKey(): Promise<Map<string, QueueRow>> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb.from("social_post_queue").select("*");
  if (error) {
    throw new Error(`Failed to load queued posts: ${error.message}`);
  }
  return new Map(((data ?? []) as QueueRow[]).map(row => [row.actor_bucket_key, row]));
}

export async function insertQueuedPost(row: QueueInsert): Promise<QueueRow> {
  const sb = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("social_post_queue")
    .insert({
      ...row,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) {
    throw new Error(`Failed to insert queued post: ${error.message}`);
  }
  return data as QueueRow;
}

export async function findQueueByBucketKey(bucketKey: string): Promise<QueueRow | null> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("social_post_queue")
    .select("*")
    .eq("actor_bucket_key", bucketKey)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to find queue row by bucket key: ${error.message}`);
  }
  return (data as QueueRow | null) ?? null;
}

export async function replaceQueuePost(bucketKey: string, row: QueueInsert): Promise<QueueRow> {
  const sb = createAdminSupabaseClient();
  const now = new Date().toISOString();
  // Try to update existing row; if none exists, insert.
  const { data: existing } = await sb
    .from("social_post_queue")
    .select("*")
    .eq("actor_bucket_key", bucketKey)
    .maybeSingle();

  if (existing) {
    const previous = existing as QueueRow;
    const keepPosted = row.status === "posted";
    const update: Record<string, unknown> = {
      status: row.status,
      package_json: row.package_json as unknown as Record<string, unknown>,
      review_notes: row.review_notes ?? null,
      updated_at: now,
      approved_at: keepPosted ? previous.approved_at : null,
      approved_by: keepPosted ? previous.approved_by : null,
      posted_at: keepPosted ? (previous.posted_at ?? now) : null,
      posted_by: keepPosted ? previous.posted_by : null,
      email_thread_id: row.email_thread_id ?? null,
      email_message_id: row.email_message_id ?? null,
    };
    if (row.email_sent_message_id !== undefined) {
      update.email_sent_message_id = row.email_sent_message_id;
    }
    const { data, error } = await sb
      .from("social_post_queue")
      .update(update)
      .eq("id", (existing as { id: string }).id)
      .select()
      .single();
    if (error) {
      throw new Error(`Failed to replace queued post: ${error.message}`);
    }
    return enrichQueueRow(data as QueueRow);
  }

  // Fall back to insert if no existing row.
  return insertQueuedPost(row);
}
export async function findQueueById(id: string): Promise<QueueRow | null> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb.from("social_post_queue").select("*").eq("id", id).maybeSingle();
  if (error) {
    throw new Error(`Failed to find queue row: ${error.message}`);
  }
  const row = (data as QueueRow | null) ?? null;
  return row ? enrichQueueRow(row) : null;
}

export async function updateQueueStatus(args: {
  id: string;
  status: SocialPostStatus;
  approvedBy?: string | null;
  postedBy?: string | null;
  reviewNotes?: string | null;
}): Promise<QueueRow> {
  const sb = createAdminSupabaseClient();
  const update: Record<string, unknown> = {
    status: args.status,
    updated_at: new Date().toISOString(),
  };
  if (args.approvedBy !== undefined) {
    update.approved_by = args.approvedBy;
    update.approved_at = args.approvedBy ? new Date().toISOString() : null;
  }
  if (args.postedBy !== undefined) {
    update.posted_by = args.postedBy;
    update.posted_at = args.postedBy ? new Date().toISOString() : null;
  }
  if (args.reviewNotes !== undefined) {
    update.review_notes = args.reviewNotes;
  }
  const { data, error } = await sb.from("social_post_queue").update(update).eq("id", args.id).select().single();
  if (error) {
    throw new Error(`Failed to update queue status: ${error.message}`);
  }
  return enrichQueueRow(data as QueueRow);
}

export async function listQueueByStatus(status: SocialPostStatus): Promise<QueueRow[]> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("social_post_queue")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Failed to list queue: ${error.message}`);
  }
  return (data ?? []).map(enrichQueueRow);
}

export async function listPostedQueueRows(manualOnly = false): Promise<QueueRow[]> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("social_post_queue")
    .select("*")
    .eq("status", "posted")
    .order("posted_at", { ascending: false, nullsFirst: false });
  if (error) {
    throw new Error(`Failed to list posted queue: ${error.message}`);
  }
  const rows = sortPostedRows((data ?? []) as QueueRow[]).map(enrichQueueRow);
  if (!manualOnly) return rows;
  return rows.filter(row => {
    const by = row.posted_by ?? "";
    return by.startsWith("dashboard:") || by.includes("manual");
  });
}

export async function logAction(args: {
  queueId: string;
  action: SocialPostAction;
  source: string;
  actorName: string;
  actorBucketKey: string;
}): Promise<void> {
  const sb = createAdminSupabaseClient();
  const { error } = await sb.from("social_post_approval_logs").insert({
    queue_id: args.queueId,
    action: args.action,
    source: args.source,
    actor_name: args.actorName,
    actor_bucket_key: args.actorBucketKey,
  });
  if (error) {
    console.error("Failed to log social post action:", error.message);
  }
}

export async function updateQueueEmailSentMessageId(id: string, messageId: string): Promise<void> {
  const sb = createAdminSupabaseClient();
  const { error } = await sb
    .from("social_post_queue")
    .update({ email_sent_message_id: messageId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("Failed to update email_sent_message_id:", error.message);
  }
}

export async function updateQueueEmailDeliveryFailure(id: string, errorMessage: string): Promise<void> {
  // Fetch existing review_notes first so we don't overwrite them
  const sb = createAdminSupabaseClient();
  const note = `Approval email failed: ${errorMessage.slice(0, 500)}`;
  const existing = await findQueueById(id);
  const existingNotes = existing?.review_notes ? existing.review_notes + "\n" : "";
  const { error } = await sb
    .from("social_post_queue")
    .update({ review_notes: existingNotes + note, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("Failed to record approval email failure:", error.message);
  }
}

export async function findOpenQueueRows(): Promise<QueueRow[]> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("social_post_queue")
    .select("*")
    .in("status", ["pending_review", "needs_review", "approved_to_post"]);
  if (error) {
    throw new Error(`Failed to load open queue rows: ${error.message}`);
  }
  return (data ?? []) as QueueRow[];
}

export async function isEmailReplyProcessed(messageId: string): Promise<boolean> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("social_post_email_replies")
    .select("id")
    .eq("message_id", messageId)
    .limit(1);
  if (error) {
    console.error("Failed to check processed reply:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

export async function recordEmailReply(args: {
  queueId?: string | null;
  messageId: string;
  threadId?: string;
  action: string;
  rawSnippet?: string;
}): Promise<void> {
  const sb = createAdminSupabaseClient();
  const { error } = await sb.from("social_post_email_replies").insert({
    queue_id: args.queueId || null,
    message_id: args.messageId,
    thread_id: args.threadId ?? null,
    action: args.action,
    raw_snippet: args.rawSnippet ?? null,
  });
  if (error) {
    console.error("Failed to record email reply:", error.message);
  }
}
