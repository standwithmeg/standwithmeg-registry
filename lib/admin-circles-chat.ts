import "server-only";
import { createAdminSupabaseClient } from "./supabase-admin";
import { CircleAccessError, getPseudonym, setPseudonym } from "./connection-circle-matching";
import { redactContactInfo } from "./connection-circle-chat";

export type AdminChatMessage = {
  id: string;
  handle: string;
  body: string;
  created_at: string;
  mine: boolean;
  sender_email: string;
};

const ADMIN_HANDLE = "Meg";
const MESSAGE_MAX_LENGTH = 2000;
const PAGE_SIZE = 100;

/**
 * Ensures the founder has a pseudonym row with the reserved admin handle.
 * If the row is missing we create it; if it exists with a different handle
 * we update it to "Meg" so the founder always appears as Meg in circles.
 */
async function ensureAdminPseudonym(founderEmail: string) {
  const sb = createAdminSupabaseClient();
  const existing = await getPseudonym(founderEmail);
  if (existing) {
    if (existing.handle === ADMIN_HANDLE) return existing;
    const { data, error } = await sb
      .from("connection_circle_pseudonyms")
      .update({ handle: ADMIN_HANDLE, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("id, email, handle, created_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new CircleAccessError("The 'Meg' handle is already taken by another member.", 409);
      }
      throw new Error(`admin pseudonym update failed: ${error.message}`);
    }
    return data as { id: string; email: string; handle: string; created_at: string };
  }

  try {
    return await setPseudonym(founderEmail, ADMIN_HANDLE);
  } catch (err) {
    if (err instanceof CircleAccessError && err.status === 409) {
      throw new CircleAccessError("The 'Meg' handle is already taken by another member.", 409);
    }
    throw err;
  }
}

/**
 * Founder view of any circle room. Does not require the founder to be a
 * matched member of the circle. Returns active (non-deleted) messages in
 * chronological order, tagged with the founder's own messages as `mine`.
 */
export async function adminListMessages(
  founderEmail: string,
  actorKey: string,
  afterIso?: string | null,
): Promise<AdminChatMessage[]> {
  const sb = createAdminSupabaseClient();

  let query = sb
    .from("connection_circle_messages")
    .select("id, sender_email, body, created_at")
    .eq("actor_key", actorKey)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (afterIso) {
    query = query.gt("created_at", afterIso);
  }
  const { data, error } = await query;
  if (error) throw new Error(`admin chat list failed: ${error.message}`);

  const rows = (data ?? []) as { id: string; sender_email: string; body: string; created_at: string }[];

  const senders = Array.from(new Set(rows.map(r => r.sender_email.toLowerCase())));
  const handles = new Map<string, string>();
  if (senders.length > 0) {
    const { data: ps, error: pErr } = await sb
      .from("connection_circle_pseudonyms")
      .select("email, handle")
      .in("email", senders);
    if (pErr) throw new Error(`admin chat handle lookup failed: ${pErr.message}`);
    for (const p of (ps ?? []) as { email: string; handle: string }[]) {
      handles.set(p.email.toLowerCase(), p.handle);
    }
  }

  const myEmail = founderEmail.toLowerCase();
  return rows
    .reverse()
    .map(r => ({
      id: r.id,
      handle: handles.get(r.sender_email.toLowerCase()) ?? "Anonymous parent",
      body: r.body,
      created_at: r.created_at,
      mine: r.sender_email.toLowerCase() === myEmail,
      sender_email: r.sender_email,
    }));
}

/**
 * Post a message into any circle room as the founder (Meg). No membership
 * check is performed; the founder is always allowed to participate.
 */
export async function adminPostMessage(
  founderEmail: string,
  actorKey: string,
  rawBody: string,
): Promise<AdminChatMessage> {
  const pseudonym = await ensureAdminPseudonym(founderEmail);

  const trimmed = (rawBody ?? "").trim();
  if (!trimmed) throw new CircleAccessError("Message is empty.", 400);
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    throw new CircleAccessError(`Messages are limited to ${MESSAGE_MAX_LENGTH} characters.`, 400);
  }
  const body = redactContactInfo(trimmed);

  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("connection_circle_messages")
    .insert({ actor_key: actorKey, sender_email: founderEmail.toLowerCase(), body })
    .select("id, body, created_at")
    .single();
  if (error) throw new Error(`admin chat post failed: ${error.message}`);

  return {
    id: data.id as string,
    handle: pseudonym.handle,
    body: data.body as string,
    created_at: data.created_at as string,
    mine: true,
    sender_email: founderEmail.toLowerCase(),
  };
}
