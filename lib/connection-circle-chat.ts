import "server-only";
import { createAdminSupabaseClient } from "./supabase-admin";
import {
  CircleAccessError,
  getPseudonym,
  listMyActorMatches,
  type GateContext,
} from "./connection-circle-matching";

/**
 * Connection Circle chat — pseudonymous group rooms, one per court-actor
 * circle. Privacy rules:
 *   - Only verified members of a circle (parents whose own approved survey
 *     named this actor) can read or post in that circle's room.
 *   - Messages display the sender's pseudonym handle only — never name/email.
 *   - Contact details typed into messages are redacted server-side so that
 *     identity exchange always flows through the consent-based request flow.
 */

export type ChatMessage = {
  id: string;
  handle: string;
  body: string;
  created_at: string;
  mine: boolean;
};

const MESSAGE_MAX_LENGTH = 2000;
const PAGE_SIZE = 100;
const MIN_SECONDS_BETWEEN_MESSAGES = 5;

// Emails, phone numbers, and handles-with-@domains get masked. Conservative
// patterns on purpose: better to occasionally mask a stray number than let a
// member short-circuit the consent flow (or be groomed into exposing
// themselves) inside a room an adversary might one day reach.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(\+?\d[\s().-]?){9,15}\d/g;
const REDACTION = "[contact info hidden — use Request to connect]";

export function redactContactInfo(body: string): string {
  return body.replace(EMAIL_RE, REDACTION).replace(PHONE_RE, match => {
    // Don't mask ordinary numbers (years, case stats); only long digit runs.
    const digits = match.replace(/\D/g, "");
    return digits.length >= 10 ? REDACTION : match;
  });
}

/**
 * Throws CircleAccessError(403) unless the user is a member of this circle.
 * Membership = the actor key appears in the user's own matches, which already
 * enforces trusted/approved rows and the adversary-actor name guard.
 */
export async function requireCircleMembership(ctx: GateContext, actorKey: string): Promise<void> {
  const matches = await listMyActorMatches(ctx.email, ctx.submitterId);
  if (!matches.some(m => m.actor_key === actorKey)) {
    throw new CircleAccessError("This circle is not part of your matches.", 403);
  }
}

export async function listMessages(
  ctx: GateContext,
  actorKey: string,
  afterIso?: string | null,
): Promise<ChatMessage[]> {
  await requireCircleMembership(ctx, actorKey);
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
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(`chat list failed: ${error.message}`);
  }

  const rows = (data ?? []) as { id: string; sender_email: string; body: string; created_at: string }[];

  // Resolve live handles for every distinct sender in one query.
  const senders = Array.from(new Set(rows.map(r => r.sender_email.toLowerCase())));
  const handles = new Map<string, string>();
  if (senders.length > 0) {
    const { data: ps, error: pErr } = await sb
      .from("connection_circle_pseudonyms")
      .select("email, handle")
      .in("email", senders);
    if (pErr) throw new Error(`chat handle lookup failed: ${pErr.message}`);
    for (const p of (ps ?? []) as { email: string; handle: string }[]) {
      handles.set(p.email.toLowerCase(), p.handle);
    }
  }

  const myEmail = ctx.email.toLowerCase();
  return rows
    .reverse() // chronological for display
    .map(r => ({
      id: r.id,
      handle: handles.get(r.sender_email.toLowerCase()) ?? "Anonymous parent",
      body: r.body,
      created_at: r.created_at,
      mine: r.sender_email.toLowerCase() === myEmail,
    }));
}

export async function postMessage(
  ctx: GateContext,
  actorKey: string,
  rawBody: string,
): Promise<ChatMessage> {
  await requireCircleMembership(ctx, actorKey);

  const pseudonym = await getPseudonym(ctx.email);
  if (!pseudonym) {
    throw new CircleAccessError("Pick a handle before posting in the circle.", 400);
  }

  const trimmed = (rawBody ?? "").trim();
  if (!trimmed) throw new CircleAccessError("Message is empty.", 400);
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    throw new CircleAccessError(`Messages are limited to ${MESSAGE_MAX_LENGTH} characters.`, 400);
  }
  const body = redactContactInfo(trimmed);

  const sb = createAdminSupabaseClient();

  // Light flood control: one message per few seconds per sender.
  const { data: recent, error: recentErr } = await sb
    .from("connection_circle_messages")
    .select("created_at")
    .ilike("sender_email", ctx.email)
    .order("created_at", { ascending: false })
    .limit(1);
  if (recentErr) throw new Error(`chat rate check failed: ${recentErr.message}`);
  const last = recent?.[0]?.created_at ? new Date(recent[0].created_at).getTime() : 0;
  if (Date.now() - last < MIN_SECONDS_BETWEEN_MESSAGES * 1000) {
    throw new CircleAccessError("You're sending messages too quickly — give it a few seconds.", 429);
  }

  const { data, error } = await sb
    .from("connection_circle_messages")
    .insert({ actor_key: actorKey, sender_email: ctx.email, body })
    .select("id, body, created_at")
    .single();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      throw new CircleAccessError("Chat is not available yet. Please try again later.", 503);
    }
    throw new Error(`chat post failed: ${error.message}`);
  }

  return {
    id: data.id as string,
    handle: pseudonym.handle,
    body: data.body as string,
    created_at: data.created_at as string,
    mine: true,
  };
}

export async function deleteOwnMessage(ctx: GateContext, actorKey: string, messageId: string): Promise<void> {
  await requireCircleMembership(ctx, actorKey);
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("connection_circle_messages")
    .update({ deleted_at: new Date().toISOString(), deleted_by: "sender" })
    .eq("id", messageId)
    .eq("actor_key", actorKey)
    .ilike("sender_email", ctx.email)
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`chat delete failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new CircleAccessError("Message not found (only your own messages can be removed).", 404);
  }
}
