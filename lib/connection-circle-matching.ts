import "server-only";
import { createHash, randomBytes } from "crypto";

import { createServerSupabaseClient } from "./supabase";
import { createAdminSupabaseClient } from "./supabase-admin";
import {
  findLatestSurveySubmitter,
  hasFullCircleAccess,
  listActiveAccess,
  normalizeEmail,
} from "./connection-circles";
import { loadCourtActorBuckets, type CourtActorBucket } from "./court-actor-buckets";

// =====================================================================
// Types
// =====================================================================

export type Pseudonym = {
  id: string;
  email: string;
  handle: string;
  created_at: string;
};

export type ActorSignature = {
  name: string;
  state: string | null;
  role: string;
};

export type MatchActorSummary = {
  // Stable URL-safe key for the route: base64url of "name|state|role".
  actor_key: string;
  actor: ActorSignature;
  // Number of OTHER unique parents (by email) who also named this actor.
  other_parents_count: number;
};

export type MatchedParent = {
  pseudonym: string;
  // Stable opaque reference for this parent, safe to expose to the client.
  // Lets the UI target a parent (e.g. for an anonymous join invite) even when
  // they have no handle yet, without ever revealing their email.
  ref: string;
  has_handle: boolean;
  state: string | null;
  case_year: number | null;
  submission_count: number;
  // Outgoing request state, if any.
  outgoing_request_status: "pending" | "accepted" | "declined" | "withdrawn" | "expired" | null;
  outgoing_request_id: string | null;
  // Whether the current user has already invited this parent to the circle.
  invited?: boolean;
};

type RoomPreferenceRow = {
  actor_key: string;
  status: "left";
};

export type ConnectionRequestRow = {
  id: string;
  requester_email: string;
  requester_handle: string;
  recipient_email: string;
  recipient_handle: string;
  actor_name: string;
  actor_state: string | null;
  actor_role: string;
  requester_message: string | null;
  status: "pending" | "accepted" | "declined" | "withdrawn" | "expired";
  requester_attestation_at: string;
  recipient_attestation_at: string | null;
  recipient_token: string;
  created_at: string;
  decided_at: string | null;
  intro_sent_at: string | null;
  expires_at: string;
};

export type GateContext = {
  email: string;
  submitterId: string;
  firstName: string | null;
};

// =====================================================================
// Constants & helpers
// =====================================================================

const HANDLE_RE = /^[A-Za-z][A-Za-z0-9 _.-]{2,23}$/;
const MAX_REQUEST_MESSAGE_LEN = 600;
const RECIPIENT_TOKEN_BYTES = 24;
const OPPOSING_ROLE = "Attorney (Opposing)";
const MINE_ROLE = "Attorney (Mine)";

export class CircleAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function urlSafeBase64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromUrlSafeBase64(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

export function actorKey(sig: ActorSignature): string {
  // Name is always lowercased before encoding so that keys are case-insensitive
  // and consistent regardless of DB row casing. All bucket lookups go through
  // this function, so the lowercasing is uniform end-to-end.
  const safeName = (sig.name || "").trim();
  const safeState = (sig.state || "").trim().toUpperCase();
  const safeRole = (sig.role || "").trim();
  return urlSafeBase64(`${safeName.toLowerCase()}|${safeState}|${safeRole}`);
}

export function parseActorKey(key: string): ActorSignature | null {
  try {
    const decoded = fromUrlSafeBase64(key);
    const [name, state, role] = decoded.split("|");
    if (!name || !role) return null;
    return { name, state: state || null, role };
  } catch {
    return null;
  }
}

function titleCaseActorName(name: string): string {
  return name.replace(/\S+/g, word => {
    const lower = word.toLowerCase();
    const titled = lower.replace(/^[a-z]/, char => char.toUpperCase());
    return titled.replace(/^Mc([a-z])/, (_match, char: string) => `Mc${char.toUpperCase()}`);
  });
}

function normalizeCounty(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/superior\s+court|court|courthouse|county|district/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function yearOf(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

function newRecipientToken(): string {
  return randomBytes(RECIPIENT_TOKEN_BYTES).toString("base64url");
}

// Stable, non-identifying reference for a parent email + circle. Safe to send
// to the browser: it's a one-way hash salted with the service-role key, so it
// can't be reversed to an email, but the server can re-derive it to match a
// parent back to their email within a circle's known member set.
function parentRef(email: string, actorKeyValue: string): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "swm-circle";
  return createHash("sha256")
    .update(`${email.toLowerCase()}|${actorKeyValue}|${salt}`)
    .digest("base64url")
    .slice(0, 22);
}

// =====================================================================
// Access gate — call at the top of every protected route.
// =====================================================================

/**
 * Loads the authed user, verifies they are a survey submitter, and verifies
 * they currently hold an active Connection Circles access grant. Throws
 * CircleAccessError on failure so route handlers can convert to JSON.
 */
export async function requireConnectAccess(): Promise<GateContext> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) {
    throw new CircleAccessError("Please sign in with your survey email.", 401);
  }

  const email = normalizeEmail(user.email);
  const submitter = await findLatestSurveySubmitter(email);
  if (!submitter) {
    throw new CircleAccessError("Connection Circles are limited to verified Stand With Meg submitters.", 403);
  }

  const access = await listActiveAccess(email);
  if (!hasFullCircleAccess(access)) {
    throw new CircleAccessError("You don't have Circle access yet. Pick a supporter, sponsor, or hardship path on /connect.", 402);
  }

  return { email, submitterId: submitter.id, firstName: submitter.first_name };
}

// =====================================================================
// Pseudonyms
// =====================================================================

export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(handle.trim());
}

export async function getPseudonym(email: string): Promise<Pseudonym | null> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("connection_circle_pseudonyms")
    .select("id, email, handle, created_at")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new Error(`pseudonym lookup failed: ${error.message}`);
  }
  return data as Pseudonym | null;
}

export async function setPseudonym(email: string, rawHandle: string): Promise<Pseudonym> {
  const handle = rawHandle.trim();
  if (!isValidHandle(handle)) {
    throw new CircleAccessError(
      "Pick a 3-24 character handle starting with a letter (letters, numbers, spaces, . _ - allowed).",
      400,
    );
  }
  const sb = createAdminSupabaseClient();
  const existing = await getPseudonym(email);

  // PostgREST's onConflict can't target functional unique indexes (lower(email)),
  // so do a deliberate insert-or-update instead of upsert.
  const cols = "id, email, handle, created_at";
  if (existing) {
    const { data, error } = await sb
      .from("connection_circle_pseudonyms")
      .update({ handle, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select(cols)
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new CircleAccessError("That handle is already taken. Try another.", 409);
      }
      throw new Error(`pseudonym update failed: ${error.message}`);
    }
    return data as Pseudonym;
  }

  const { data, error } = await sb
    .from("connection_circle_pseudonyms")
    .insert({ email, handle })
    .select(cols)
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new CircleAccessError("That handle is already taken. Try another.", 409);
    }
    throw new Error(`pseudonym insert failed: ${error.message}`);
  }
  return data as Pseudonym;
}

async function getPseudonymsByEmails(emails: string[]): Promise<Map<string, string>> {
  if (emails.length === 0) return new Map();
  const sb = createAdminSupabaseClient();
  const lowered = Array.from(new Set(emails.map(e => e.toLowerCase())));
  const { data, error } = await sb
    .from("connection_circle_pseudonyms")
    .select("email, handle")
    .in("email", lowered);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return new Map();
    throw new Error(`pseudonym batch lookup failed: ${error.message}`);
  }
  const map = new Map<string, string>();
  for (const row of (data ?? []) as { email: string; handle: string }[]) {
    map.set(row.email.toLowerCase(), row.handle);
  }
  return map;
}

// =====================================================================
// Opposing-side filter
// =====================================================================

type AttorneyKey = string; // `${lower(name)}|${normalizedCounty}`

function attorneyKey(name: string, county: string | null): AttorneyKey {
  return `${name.trim().toLowerCase()}|${normalizeCounty(county)}`;
}

type SubmitterAttorneySets = {
  mine: Set<AttorneyKey>;
  opposing: Set<AttorneyKey>;
};

async function getMyAttorneySets(submitterId: string): Promise<SubmitterAttorneySets> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("court_actors")
    .select("role, name, court_or_county")
    .eq("submission_id", submitterId)
    .in("role", [MINE_ROLE, OPPOSING_ROLE]);
  if (error) {
    throw new Error(`my attorneys lookup failed: ${error.message}`);
  }
  const mine = new Set<AttorneyKey>();
  const opposing = new Set<AttorneyKey>();
  for (const row of (data ?? []) as { role: string; name: string; court_or_county: string | null }[]) {
    const key = attorneyKey(row.name, row.court_or_county);
    if (row.role === MINE_ROLE) mine.add(key);
    if (row.role === OPPOSING_ROLE) opposing.add(key);
  }
  return { mine, opposing };
}

/**
 * Returns the set of lowercased emails that should be hidden from match
 * lists because they are likely the OPPOSING parent in the same case.
 * Signal: my mine-attorney = their opposing-attorney, OR vice versa.
 */
export async function computeOpposingBlockedEmails(
  myEmail: string,
  mySubmitterId: string,
  candidateEmails: string[],
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (candidateEmails.length === 0) return blocked;

  const mine = await getMyAttorneySets(mySubmitterId);
  if (mine.mine.size === 0 && mine.opposing.size === 0) return blocked;

  const sb = createAdminSupabaseClient();
  const candidates = Array.from(new Set(candidateEmails.map(e => e.toLowerCase())))
    .filter(e => e !== myEmail.toLowerCase());

  // Pull every submission that belongs to any candidate, then their
  // mine/opposing attorneys. One round trip via inner select.
  const { data: subs, error: subsErr } = await sb
    .from("survey_submissions")
    .select("id, email")
    .in("email", candidates);
  if (subsErr) {
    throw new Error(`candidate submissions lookup failed: ${subsErr.message}`);
  }
  const subRows = (subs ?? []) as { id: string; email: string }[];
  if (subRows.length === 0) return blocked;

  const subIdToEmail = new Map<string, string>();
  for (const row of subRows) subIdToEmail.set(row.id, row.email.toLowerCase());

  const { data: actors, error: actErr } = await sb
    .from("court_actors")
    .select("submission_id, role, name, court_or_county")
    .in("submission_id", Array.from(subIdToEmail.keys()))
    .in("role", [MINE_ROLE, OPPOSING_ROLE]);
  if (actErr) {
    throw new Error(`candidate attorneys lookup failed: ${actErr.message}`);
  }

  for (const row of (actors ?? []) as {
    submission_id: string;
    role: string;
    name: string;
    court_or_county: string | null;
  }[]) {
    const candidateEmail = subIdToEmail.get(row.submission_id);
    if (!candidateEmail) continue;
    const key = attorneyKey(row.name, row.court_or_county);
    if (row.role === OPPOSING_ROLE && mine.mine.has(key)) {
      blocked.add(candidateEmail);
    } else if (row.role === MINE_ROLE && mine.opposing.has(key)) {
      blocked.add(candidateEmail);
    }
  }

  return blocked;
}

// =====================================================================
// Match queries — bucket-based, sharing the registry's canonical counting.
//
// A "circle" is one canonical court-actor BUCKET (alias-aware, role-merged,
// location-keyed, family-deduped) — exactly the unit the public registry
// counts. The user's circles are the buckets whose family set contains the
// user's own family key. `otherCount = families.size - 1` (excludes the user).
// =====================================================================

/**
 * The user's family keys, derived from the SAME canonical bucketing the
 * registry uses. A bucket "belongs to" the user when any of these keys is in
 * the bucket's family map. Because the family key is normally
 * `lower(email)|location`, the user typically has one key per location they
 * reported in.
 *
 * We derive the keys from the loaded buckets themselves (matching on the
 * user's lowercased email) so the keys are guaranteed to line up with bucket
 * membership even when row-review overrides (count_separately) are in play.
 */
function myFamilyKeysFromBuckets(
  buckets: Map<string, CourtActorBucket>,
  myEmail: string,
): Set<string> {
  const lowered = myEmail.toLowerCase();
  const keys = new Set<string>();
  for (const bucket of buckets.values()) {
    for (const member of bucket.families.values()) {
      if (member.email && member.email.toLowerCase() === lowered) {
        keys.add(member.familyKey);
      }
    }
  }
  return keys;
}

/**
 * Convert a canonical bucket into the ActorSignature the pages/request flow
 * use. name = bucket display name, state = bucket state_code, role = the
 * role-merged summary. actorKey(sig) is the stable, URL-safe identity.
 */
function bucketSignature(bucket: CourtActorBucket): ActorSignature {
  return {
    name: bucket.displayName.trim(),
    state: bucket.state_code,
    role: bucket.roleSummary,
  };
}

/**
 * Partial mitigation: returns true if the actor's name has sufficient token
 * overlap with the submitter's name to suggest they may be the same person.
 * Checks: last name matches AND first initial matches (case-insensitive).
 * Full protection requires an admin-approval gate — this is a best-effort guard.
 */
function actorNameMatchesSubmitter(
  actorName: string,
  submitterFirst: string | null,
  submitterLast: string | null,
): boolean {
  if (!submitterFirst || !submitterLast) return false;
  const actorTokens = actorName.toLowerCase().split(/\s+/);
  const subLast = submitterLast.toLowerCase().trim();
  const subFirstInitial = submitterFirst.toLowerCase().trim()[0];
  if (!subLast || !subFirstInitial) return false;
  const lastMatches = actorTokens.some(t => t === subLast);
  const firstInitialMatches = actorTokens.some(t => t.startsWith(subFirstInitial));
  return lastMatches && firstInitialMatches;
}

/**
 * Returns the canonical buckets that "belong to" the signed-in user (their own
 * family key is in the bucket), each paired with the OTHER families' emails
 * (deduped by family key) for the request flow. Shared by the list and
 * drill-down so they never disagree on membership or counts.
 */
async function loadMyBucketsWithOthers(myEmail: string): Promise<
  Array<{ bucket: CourtActorBucket; otherEmails: string[] }>
> {
  const buckets = await loadCourtActorBuckets();
  const myKeys = myFamilyKeysFromBuckets(buckets, myEmail);
  if (myKeys.size === 0) return [];

  const out: Array<{ bucket: CourtActorBucket; otherEmails: string[] }> = [];
  for (const bucket of buckets.values()) {
    let mine = false;
    const otherEmails: string[] = [];
    for (const member of bucket.families.values()) {
      if (myKeys.has(member.familyKey)) {
        mine = true;
        continue;
      }
      // Other families: keep one email per OTHER family key (already deduped
      // because families is keyed by family key). Skip the user's own email
      // defensively even if it appears under a different family key.
      if (member.email && member.email.toLowerCase() !== myEmail.toLowerCase()) {
        otherEmails.push(member.email.toLowerCase());
      }
    }
    if (!mine) continue;
    out.push({ bucket, otherEmails: Array.from(new Set(otherEmails)) });
  }
  return out;
}

async function listLeftCircleActorKeys(email: string): Promise<Set<string>> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("connection_circle_room_preferences")
    .select("actor_key, status")
    .ilike("email", email)
    .eq("status", "left");
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return new Set();
    throw new Error(`room preferences lookup failed: ${error.message}`);
  }
  return new Set(((data ?? []) as RoomPreferenceRow[]).map(row => row.actor_key));
}

export async function leaveCircleRoom(ctx: GateContext, actorKeyValue: string): Promise<void> {
  const matches = await listMyActorMatches(ctx.email, ctx.submitterId);
  if (!matches.some(match => match.actor_key === actorKeyValue)) {
    throw new CircleAccessError("This circle is not part of your active rooms.", 404);
  }

  const sb = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("connection_circle_room_preferences")
    .upsert(
      {
        email: ctx.email.toLowerCase(),
        actor_key: actorKeyValue,
        status: "left",
        left_at: now,
        updated_at: now,
      },
      { onConflict: "email,actor_key" },
    );
  if (error) {
    throw new Error(`leave circle failed: ${error.message}`);
  }
  await writeAudit({ actorEmail: ctx.email, event: "circle.left", detail: { actor_key: actorKeyValue } });
}

export async function resolveCircleActor(email: string, sig: ActorSignature): Promise<ActorSignature> {
  const targetKey = actorKey(sig);
  const myBuckets = await loadMyBucketsWithOthers(email);
  const match = myBuckets.find(({ bucket }) => actorKey(bucketSignature(bucket)) === targetKey);
  if (match) return bucketSignature(match.bucket);

  return {
    ...sig,
    name: titleCaseActorName(sig.name),
    state: sig.state ? sig.state.toUpperCase() : null,
  };
}

/**
 * For the signed-in parent's email, return all court actors they named that
 * at least one OTHER family also named, with the count of other families.
 * Opposing-side blocks are applied so co-parents on the same case never
 * appear as matches.
 */
export async function listMyActorMatches(email: string, submitterId: string): Promise<MatchActorSummary[]> {
  const myBuckets = await loadMyBucketsWithOthers(email);
  if (myBuckets.length === 0) return [];
  const leftActorKeys = await listLeftCircleActorKeys(email);

  // Fetch the submitter's full name for the adversary-actor guard.
  const sb0 = createAdminSupabaseClient();
  const { data: subNameRow } = await sb0
    .from("survey_submissions")
    .select("first_name, last_name")
    .eq("id", submitterId)
    .maybeSingle();
  const subFirst = (subNameRow as { first_name: string | null; last_name: string | null } | null)?.first_name ?? null;
  const subLast = (subNameRow as { first_name: string | null; last_name: string | null } | null)?.last_name ?? null;

  // Apply the opposing-side filter across ALL candidate emails at once.
  const allOtherEmails = Array.from(new Set(myBuckets.flatMap(b => b.otherEmails)));
  const blocked = await computeOpposingBlockedEmails(email, submitterId, allOtherEmails);

  return myBuckets
    .map(({ bucket, otherEmails }) => {
      const visibleOthers = otherEmails.filter(e => !blocked.has(e));
      const sig = bucketSignature(bucket);
      return {
        actor_key: actorKey(sig),
        actor: sig,
        // Distinct OTHER families (by family key, already deduped) who named
        // this person, minus any opposing-side parent we filtered out.
        other_parents_count: visibleOthers.length,
      };
    })
    .filter(m => {
      if (leftActorKeys.has(m.actor_key)) return false;
      if (m.other_parents_count === 0) return false;
      // Adversary-actor guard: if the authenticated user's name fuzzy-matches
      // this actor's name, exclude the circle from their results.
      // Partial mitigation only — full protection needs an admin-approval gate.
      if (actorNameMatchesSubmitter(m.actor.name, subFirst, subLast)) {
        console.warn(
          `connection-circles: excluded actor circle "${m.actor.name}" for submitter ${submitterId} due to name overlap`,
        );
        return false;
      }
      return true;
    })
    .sort((a, b) => b.other_parents_count - a.other_parents_count);
}

/**
 * Drill-down: for one actor signature (which maps back to a canonical bucket),
 * return the other parents who named that actor, with their pseudonyms (if
 * set), state, and case year. Parents without a pseudonym yet appear with the
 * placeholder "(no handle yet)".
 */
async function activeAccessEmailSet(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const sb = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("connection_circle_access")
    .select("email")
    .in("email", emails)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${now}`);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return new Set();
    throw new Error(`connection_circle_access batch lookup failed: ${error.message}`);
  }
  return new Set((data ?? []).map(row => String(row.email).toLowerCase()));
}

export async function listParentsForActor(
  email: string,
  submitterId: string,
  sig: ActorSignature,
): Promise<MatchedParent[]> {
  const targetKey = actorKey(sig);
  const myBuckets = await loadMyBucketsWithOthers(email);
  const match = myBuckets.find(({ bucket }) => actorKey(bucketSignature(bucket)) === targetKey);
  if (!match) return [];

  const otherEmails = Array.from(new Set(match.otherEmails));
  if (otherEmails.length === 0) return [];

  const sb = createAdminSupabaseClient();
  const { data: subs, error: subsErr } = await sb
    .from("survey_submissions")
    .select("id, email, state_of_occurrence, created_at")
    .in("email", otherEmails);
  if (subsErr) {
    throw new Error(`parent submissions lookup failed: ${subsErr.message}`);
  }
  const subRows = (subs ?? []) as {
    id: string;
    email: string;
    state_of_occurrence: string | null;
    created_at: string | null;
  }[];

  const candidateEmails = Array.from(new Set(subRows.map(r => r.email.toLowerCase())));
  const [blocked, pseudonyms, accessByEmail] = await Promise.all([
    computeOpposingBlockedEmails(email, submitterId, candidateEmails),
    getPseudonymsByEmails(candidateEmails),
    activeAccessEmailSet(candidateEmails),
  ]);

  // Aggregate per email: earliest case year + count of submissions + a state pick.
  const perEmail = new Map<string, {
    state: string | null;
    earliestYear: number | null;
    submissionCount: number;
  }>();
  for (const row of subRows) {
    const e = row.email.toLowerCase();
    // Only surface emails that are part of THIS bucket's other-family set.
    if (!otherEmails.includes(e)) continue;
    const y = yearOf(row.created_at);
    const cur = perEmail.get(e);
    if (!cur) {
      perEmail.set(e, { state: row.state_of_occurrence, earliestYear: y, submissionCount: 1 });
    } else {
      cur.submissionCount += 1;
      if (y && (!cur.earliestYear || y < cur.earliestYear)) cur.earliestYear = y;
      if (!cur.state && row.state_of_occurrence) cur.state = row.state_of_occurrence;
    }
  }

  // Existing outgoing requests from me for this actor.
  let outgoingQuery = sb
    .from("connection_circle_requests")
    .select("id, recipient_email, status, actor_state")
    .ilike("requester_email", email)
    .ilike("actor_name", sig.name)
    .eq("actor_role", sig.role);
  if (sig.state) {
    outgoingQuery = outgoingQuery.eq("actor_state", sig.state);
  } else {
    outgoingQuery = outgoingQuery.is("actor_state", null);
  }
  const { data: existingReqs, error: reqErr } = await outgoingQuery;
  if (reqErr && reqErr.code !== "42P01" && reqErr.code !== "PGRST205") {
    throw new Error(`outgoing requests lookup failed: ${reqErr.message}`);
  }
  const outgoingByEmail = new Map<string, { id: string; status: MatchedParent["outgoing_request_status"] }>();
  for (const r of ((existingReqs ?? []) as { id: string; recipient_email: string; status: NonNullable<MatchedParent["outgoing_request_status"]> }[])) {
    outgoingByEmail.set(r.recipient_email.toLowerCase(), { id: r.id, status: r.status });
  }

  // Which of these parents has THIS user already invited to the circle?
  const invitedRefs = await invitedRefsForCircle(email, targetKey);

  const out: MatchedParent[] = [];
  for (const [emailKey, summary] of perEmail.entries()) {
    if (blocked.has(emailKey)) continue;
    const handle = pseudonyms.get(emailKey);
    const hasAccess = accessByEmail.has(emailKey);
    // Handles require Circle access — hide lapsed members from the connect list.
    // Survey-only families without access stay visible for join invites.
    if (handle && !hasAccess) continue;
    const outgoing = outgoingByEmail.get(emailKey) ?? null;
    const ref = parentRef(emailKey, targetKey);
    out.push({
      pseudonym: handle ?? "(no handle yet)",
      ref,
      has_handle: Boolean(handle),
      state: summary.state,
      case_year: summary.earliestYear,
      submission_count: summary.submissionCount,
      outgoing_request_status: outgoing?.status ?? null,
      outgoing_request_id: outgoing?.id ?? null,
      invited: invitedRefs.has(ref),
    });
  }

  return out.sort((a, b) => a.pseudonym.localeCompare(b.pseudonym));
}

const JOIN_INVITE_EVENT = "circle.join_invite";
const JOIN_INVITE_COOLDOWN_DAYS = 14;
const JOIN_INVITE_DAILY_CAP = 25;

/** Refs this user has invited in this circle within the cooldown window. */
async function invitedRefsForCircle(inviterEmail: string, actorKeyValue: string): Promise<Set<string>> {
  const sb = createAdminSupabaseClient();
  const since = new Date(Date.now() - JOIN_INVITE_COOLDOWN_DAYS * 86400_000).toISOString();
  const { data, error } = await sb
    .from("connection_circle_audit")
    .select("detail")
    .eq("event", JOIN_INVITE_EVENT)
    .ilike("actor_email", inviterEmail)
    .gte("created_at", since);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return new Set();
    throw new Error(`invite history lookup failed: ${error.message}`);
  }
  const refs = new Set<string>();
  for (const row of (data ?? []) as { detail: { actor_key?: string; target_ref?: string } | null }[]) {
    if (row.detail?.actor_key === actorKeyValue && row.detail?.target_ref) {
      refs.add(row.detail.target_ref);
    }
  }
  return refs;
}

/**
 * Send an anonymous "join the circle" invite to a parent the user can see in
 * their circle, targeted by the opaque `ref` (so it works even before the
 * parent has a handle). Neither side's identity is exposed. Deduped per
 * cooldown window and rate-limited per day to prevent abuse.
 *
 * Returns the delivery outcome; the email send itself is the caller's job
 * (scheduled with after()) so a slow SMTP never blocks the request.
 */
export async function prepareCircleJoinInvite(
  email: string,
  submitterId: string,
  sig: ActorSignature,
  ref: string,
): Promise<{ status: "ok" | "already" | "rate_limited" | "not_found"; targetEmail?: string; actorPhrase?: string }> {
  const targetKey = actorKey(sig);
  const parents = await listParentsForActor(email, submitterId, sig);
  const target = parents.find(p => p.ref === ref);
  if (!target) return { status: "not_found" };
  if (target.invited) return { status: "already" };

  // Resolve the ref back to the real email by re-deriving over the bucket's
  // known other-family set (never exposing emails to the client).
  const myBuckets = await loadMyBucketsWithOthers(email);
  const match = myBuckets.find(({ bucket }) => actorKey(bucketSignature(bucket)) === targetKey);
  if (!match) return { status: "not_found" };
  const targetEmail = Array.from(new Set(match.otherEmails)).find(e => parentRef(e, targetKey) === ref);
  if (!targetEmail) return { status: "not_found" };

  // Daily rate limit across all circles for this inviter.
  const sb = createAdminSupabaseClient();
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count, error: countErr } = await sb
    .from("connection_circle_audit")
    .select("id", { count: "exact", head: true })
    .eq("event", JOIN_INVITE_EVENT)
    .ilike("actor_email", email)
    .gte("created_at", since);
  if (countErr && countErr.code !== "42P01" && countErr.code !== "PGRST205") {
    throw new Error(`invite rate check failed: ${countErr.message}`);
  }
  if ((count ?? 0) >= JOIN_INVITE_DAILY_CAP) return { status: "rate_limited" };

  await writeAudit({
    actorEmail: email,
    event: JOIN_INVITE_EVENT,
    detail: { actor_key: targetKey, target_ref: ref },
  });

  const where = sig.state ? ` in ${sig.state}` : "";
  return { status: "ok", targetEmail, actorPhrase: `${sig.role} ${sig.name}${where}` };
}

// =====================================================================
// Connection requests (double opt-in)
// =====================================================================

async function findRecipientEmailForActor(
  myEmail: string,
  mySubmitterId: string,
  sig: ActorSignature,
  recipientPseudonym: string,
): Promise<string | null> {
  // Re-run the same drill-down logic and locate the recipient by pseudonym.
  const parents = await listParentsForActor(myEmail, mySubmitterId, sig);
  const match = parents.find(p => p.pseudonym.toLowerCase() === recipientPseudonym.toLowerCase());
  if (!match) return null;

  // We have to map pseudonym back to an email, which the public list doesn't expose.
  // Look up the pseudonym row directly.
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("connection_circle_pseudonyms")
    .select("email")
    .ilike("handle", recipientPseudonym)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new Error(`recipient email lookup failed: ${error.message}`);
  }
  const email = data?.email?.toLowerCase() ?? null;
  if (!email) return null;
  // Final safety check: ensure they're still in the eligible set.
  return match ? email : null;
}

export async function createConnectionRequest(args: {
  requesterEmail: string;
  requesterSubmitterId: string;
  requesterHandle: string;
  recipientPseudonym: string;
  actor: ActorSignature;
  message: string | null;
  attestation: boolean;
}): Promise<ConnectionRequestRow> {
  if (!args.attestation) {
    throw new CircleAccessError(
      "You need to agree to the Circle safety rule before requesting a connection.",
      400,
    );
  }

  const recipientEmail = await findRecipientEmailForActor(
    args.requesterEmail,
    args.requesterSubmitterId,
    args.actor,
    args.recipientPseudonym,
  );
  if (!recipientEmail) {
    throw new CircleAccessError("That parent is no longer available to connect.", 404);
  }
  if (recipientEmail === args.requesterEmail.toLowerCase()) {
    throw new CircleAccessError("You can't send a connection request to yourself.", 400);
  }

  // Make sure the recipient is ALSO a verified survey submitter currently
  // holding access. Without active access we shouldn't even ping them.
  const recipientSubmitter = await findLatestSurveySubmitter(recipientEmail);
  if (!recipientSubmitter) {
    throw new CircleAccessError("That parent is no longer eligible to connect.", 410);
  }
  const recipientAccess = await listActiveAccess(recipientEmail);
  if (!hasFullCircleAccess(recipientAccess)) {
    throw new CircleAccessError("That parent doesn't have active Circle access right now.", 410);
  }

  const sb = createAdminSupabaseClient();
  const token = newRecipientToken();
  const message = (args.message ?? "").trim().slice(0, MAX_REQUEST_MESSAGE_LEN);

  const { data, error } = await sb
    .from("connection_circle_requests")
    .insert({
      requester_email: args.requesterEmail.toLowerCase(),
      requester_handle: args.requesterHandle,
      recipient_email: recipientEmail,
      recipient_handle: args.recipientPseudonym,
      actor_name: args.actor.name,
      actor_state: args.actor.state,
      actor_role: args.actor.role,
      requester_message: message || null,
      recipient_token: token,
      requester_attestation_at: new Date().toISOString(),
    })
    .select(`
      id, requester_email, requester_handle, recipient_email, recipient_handle,
      actor_name, actor_state, actor_role, requester_message, status,
      requester_attestation_at, recipient_attestation_at, recipient_token,
      created_at, decided_at, intro_sent_at, expires_at
    `)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new CircleAccessError("You already have an open request to this parent for this match.", 409);
    }
    throw new Error(`connection request insert failed: ${error.message}`);
  }

  await writeAudit({ requestId: data.id, actorEmail: args.requesterEmail, event: "request.created" });
  return data as ConnectionRequestRow;
}

// Safe public-facing shapes for listRequestsForEmail — email fields and
// recipient_token are stripped from the appropriate direction.
export type IncomingRequestPublic = Omit<ConnectionRequestRow, "requester_email" | "recipient_email">;
export type OutgoingRequestPublic = Omit<ConnectionRequestRow, "requester_email" | "recipient_email" | "recipient_token">;

export async function listRequestsForEmail(email: string): Promise<{
  incoming: IncomingRequestPublic[];
  outgoing: OutgoingRequestPublic[];
}> {
  const sb = createAdminSupabaseClient();
  const cols = `
    id, requester_email, requester_handle, recipient_email, recipient_handle,
    actor_name, actor_state, actor_role, requester_message, status,
    requester_attestation_at, recipient_attestation_at, recipient_token,
    created_at, decided_at, intro_sent_at, expires_at
  `;

  const [{ data: incoming, error: inErr }, { data: outgoing, error: outErr }] = await Promise.all([
    sb.from("connection_circle_requests").select(cols).ilike("recipient_email", email).order("created_at", { ascending: false }),
    sb.from("connection_circle_requests").select(cols).ilike("requester_email", email).order("created_at", { ascending: false }),
  ]);
  for (const e of [inErr, outErr]) {
    if (e && e.code !== "42P01" && e.code !== "PGRST205") {
      throw new Error(`requests lookup failed: ${e.message}`);
    }
  }

  // Strip email fields from both directions; keep recipient_token on incoming
  // only (needed for the "Review & respond" link), never on outgoing.
  const safeIncoming: IncomingRequestPublic[] = ((incoming ?? []) as ConnectionRequestRow[]).map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ requester_email, recipient_email, ...rest }) => rest,
  );
  const safeOutgoing: OutgoingRequestPublic[] = ((outgoing ?? []) as ConnectionRequestRow[]).map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ requester_email, recipient_email, recipient_token, ...rest }) => rest,
  );

  return { incoming: safeIncoming, outgoing: safeOutgoing };
}

export async function getRequestByToken(token: string): Promise<ConnectionRequestRow | null> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("connection_circle_requests")
    .select(`
      id, requester_email, requester_handle, recipient_email, recipient_handle,
      actor_name, actor_state, actor_role, requester_message, status,
      requester_attestation_at, recipient_attestation_at, recipient_token,
      created_at, decided_at, intro_sent_at, expires_at
    `)
    .eq("recipient_token", token)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new Error(`request token lookup failed: ${error.message}`);
  }
  return data as ConnectionRequestRow | null;
}

export async function acceptRequestByToken(token: string, attestation: boolean): Promise<ConnectionRequestRow> {
  if (!attestation) {
    throw new CircleAccessError("You need to confirm the safety attestation before accepting.", 400);
  }
  const sb = createAdminSupabaseClient();

  // Fetch the full request first so the user sees the real state instead of a
  // generic "no longer accepted" message when a link was already handled.
  const { data: requestRow, error: lookupError } = await sb
    .from("connection_circle_requests")
    .select(`
      id, requester_email, requester_handle, recipient_email, recipient_handle,
      actor_name, actor_state, actor_role, requester_message, status,
      requester_attestation_at, recipient_attestation_at, recipient_token,
      created_at, decided_at, intro_sent_at, expires_at
    `)
    .eq("recipient_token", token)
    .maybeSingle();
  if (lookupError) {
    throw new Error(`request token lookup failed: ${lookupError.message}`);
  }
  if (!requestRow) {
    throw new CircleAccessError("This request link is not valid anymore. It may have already been used, withdrawn, or replaced.", 410);
  }
  const pending = requestRow as ConnectionRequestRow;
  if (pending.status !== "pending") {
    throw new CircleAccessError(`This request is already ${pending.status}.`, 410);
  }
  if (new Date(pending.expires_at) <= new Date()) {
    await sb
      .from("connection_circle_requests")
      .update({ status: "expired", decided_at: new Date().toISOString() })
      .eq("id", pending.id)
      .eq("status", "pending");
    throw new CircleAccessError("This request link has expired.", 410);
  }

  // Verify the recipient still holds active circle access.
  const recipientAccess = await listActiveAccess(pending.recipient_email);
  if (!hasFullCircleAccess(recipientAccess)) {
    throw new CircleAccessError("You need active Circle access before accepting this request. Log in with your survey email, then choose monthly, yearly, sponsored, or hardship access.", 402);
  }
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("connection_circle_requests")
    .update({
      status: "accepted",
      recipient_attestation_at: now,
      decided_at: now,
    })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select(`
      id, requester_email, requester_handle, recipient_email, recipient_handle,
      actor_name, actor_state, actor_role, requester_message, status,
      requester_attestation_at, recipient_attestation_at, recipient_token,
      created_at, decided_at, intro_sent_at, expires_at
    `)
    .single();
  if (error) {
    throw new CircleAccessError("This request can no longer be accepted.", 410);
  }
  await writeAudit({ requestId: data.id, actorEmail: data.recipient_email, event: "request.accepted" });
  return data as ConnectionRequestRow;
}

export async function declineRequestByToken(token: string): Promise<ConnectionRequestRow> {
  const sb = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("connection_circle_requests")
    .update({ status: "declined", decided_at: now })
    .eq("recipient_token", token)
    .eq("status", "pending")
    .select(`
      id, requester_email, requester_handle, recipient_email, recipient_handle,
      actor_name, actor_state, actor_role, requester_message, status,
      requester_attestation_at, recipient_attestation_at, recipient_token,
      created_at, decided_at, intro_sent_at, expires_at
    `)
    .single();
  if (error) {
    throw new CircleAccessError("This request can no longer be declined.", 410);
  }
  await writeAudit({ requestId: data.id, actorEmail: data.recipient_email, event: "request.declined" });
  return data as ConnectionRequestRow;
}

export async function withdrawRequestById(id: string, requesterEmail: string): Promise<ConnectionRequestRow> {
  const sb = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("connection_circle_requests")
    .update({ status: "withdrawn", decided_at: now })
    .eq("id", id)
    .ilike("requester_email", requesterEmail)
    .eq("status", "pending")
    .select(`
      id, requester_email, requester_handle, recipient_email, recipient_handle,
      actor_name, actor_state, actor_role, requester_message, status,
      requester_attestation_at, recipient_attestation_at, recipient_token,
      created_at, decided_at, intro_sent_at, expires_at
    `)
    .single();
  if (error) {
    throw new CircleAccessError("This request can't be withdrawn.", 410);
  }
  await writeAudit({ requestId: data.id, actorEmail: requesterEmail, event: "request.withdrawn" });
  return data as ConnectionRequestRow;
}

export async function markIntroSent(id: string): Promise<void> {
  const sb = createAdminSupabaseClient();
  await sb
    .from("connection_circle_requests")
    .update({ intro_sent_at: new Date().toISOString() })
    .eq("id", id);
}

// =====================================================================
// Audit log — fire-and-forget by callers via await; tolerant of failures.
// =====================================================================

export async function writeAudit(args: {
  requestId?: string | null;
  actorEmail?: string | null;
  event: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sb = createAdminSupabaseClient();
    await sb.from("connection_circle_audit").insert({
      request_id: args.requestId ?? null,
      actor_email: args.actorEmail ? args.actorEmail.toLowerCase() : null,
      event: args.event,
      detail: args.detail ?? null,
    });
  } catch (err) {
    console.error("connection_circle_audit insert failed:", err);
  }
}
