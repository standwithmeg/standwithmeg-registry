import "server-only";
import { createAdminSupabaseClient } from "./supabase-admin";

export type AccessRecord = {
  id: string;
  access_type: string;
  status: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_reason: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  sponsor_link_id: string | null;
  created_at: string;
};

export type MessageRecord = {
  id: string;
  actor_key: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type RoomActivity = {
  actor_key: string;
  name: string;
  state: string | null;
  role: string;
  messages: number;
  last_active: string | null;
};

export type SurveySubmission = {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  state_of_occurrence: string | null;
  county: string | null;
  case_year: number | null;
  court_actors: {
    name: string;
    role: string;
    state: string | null;
    county: string | null;
  }[];
};

export type FinancialRecord = {
  kind: "access" | "contribution_received" | "contribution_given" | "sponsor_link";
  id: string;
  date: string;
  amount_cents: number | null;
  description: string;
  metadata: Record<string, unknown>;
};

export type InviteLinkRecord = {
  id: string;
  token: string;
  remaining_uses: number | null;
  used_count: number;
  status: string;
  expires_at: string;
  created_at: string;
};

export type AuditRecord = {
  id: string;
  event: string;
  detail: Record<string, unknown> | null;
  created_at: string;
};

export type ReferralRecord = {
  id: string;
  other_email: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  rewarded_at: string | null;
};

export type SubscriptionRecord = {
  status: string;
  next_billing_date: string | null;
  dashboard_url: string;
};

export type CircleUserProfile = {
  email: string;
  state: string | null;
  handle: string | null;
  join_date: string | null;
  access: {
    current_type: string | null;
    status: string | null;
    expires_at: string | null;
    history: AccessRecord[];
  };
  activity: {
    total_messages: number;
    last_active: string | null;
    active_days: number;
    rooms: RoomActivity[];
    messages: MessageRecord[];
  };
  surveys: SurveySubmission[];
  financial: FinancialRecord[];
  invites: {
    generated: InviteLinkRecord[];
    total_uses: number;
    accepted_count: number;
    pending: number;
    rewarded: number;
    months_earned: number;
  };
  referrals: {
    made: ReferralRecord[];
    received: ReferralRecord[];
    months_earned: number;
  };
  subscription: SubscriptionRecord | null;
  moderation: {
    deleted_messages: MessageRecord[];
    reports: AuditRecord[];
    admin_note: string | null;
  };
  audit: AuditRecord[];
};

function parseActorKey(key: string): { name: string; state: string | null; role: string } | null {
  try {
    const normalized = key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4);
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    const [name, state, role] = decoded.split("|");
    if (!name || !role) return null;
    return { name, state: state || null, role };
  } catch {
    return null;
  }
}

function normalizeEmail(value: string): string {
  return decodeURIComponent(value).trim().toLowerCase();
}

export async function fetchCircleUserProfile(encodedEmail: string): Promise<CircleUserProfile | null> {
  const email = normalizeEmail(encodedEmail);
  const admin = createAdminSupabaseClient();

  const [
    accessResult,
    pseudoResult,
    submissionsResult,
    messagesResult,
    inviteLinksResult,
    sponsorLinksResult,
    contributionsResult,
    notesResult,
    auditResult,
    referralsResult,
    rewardsResult,
  ] = await Promise.all([
    admin
      .from("connection_circle_access")
      .select("id, access_type, status, granted_at, expires_at, revoked_at, revoked_by, revoked_reason, stripe_customer_id, stripe_subscription_id, sponsor_link_id, created_at")
      .ilike("email", email)
      .order("granted_at", { ascending: false }),
    admin
      .from("connection_circle_pseudonyms")
      .select("handle, reward_months_earned")
      .ilike("email", email)
      .maybeSingle(),
    admin
      .from("survey_submissions")
      .select("id, created_at, first_name, last_name, state_of_occurrence, county, case_year")
      .ilike("email", email)
      .order("created_at", { ascending: false }),
    admin
      .from("connection_circle_messages")
      .select("id, actor_key, body, created_at, deleted_at, deleted_by")
      .ilike("sender_email", email)
      .order("created_at", { ascending: false }),
    admin
      .from("connection_circle_invite_links")
      .select("id, token, remaining_uses, used_count, status, expires_at, created_at")
      .ilike("inviter_email", email)
      .order("created_at", { ascending: false }),
    admin
      .from("connection_circle_sponsor_links")
      .select("id, token, requester_note, status, fulfilled_at, expires_at, created_at")
      .ilike("requester_email", email)
      .order("created_at", { ascending: false }),
    admin
      .from("connection_circle_sponsor_contributions")
      .select("id, contribution_type, sponsor_email, requester_email, sponsor_link_id, amount_cents, created_at")
      .or(`sponsor_email.ilike.${email},requester_email.ilike.${email}`)
      .order("created_at", { ascending: false }),
    admin
      .from("connection_circle_user_notes")
      .select("note")
      .ilike("email", email)
      .maybeSingle(),
    admin
      .from("connection_circle_audit")
      .select("id, event, detail, created_at")
      .ilike("actor_email", email)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("connection_circle_referrals")
      .select("id, inviter_email, referred_email, status, created_at, completed_at, rewarded_at")
      .or(`inviter_email.ilike.${email},referred_email.ilike.${email}`),
    admin
      .from("connection_circle_referrer_rewards")
      .select("reward_months")
      .ilike("referrer_email", email)
      .in("status", ["active", "applied"]),
  ]);

  for (const result of [accessResult, pseudoResult, submissionsResult, messagesResult, inviteLinksResult, sponsorLinksResult, contributionsResult, notesResult, auditResult, referralsResult, rewardsResult]) {
    const r = result as { error?: { code?: string; message?: string } | null };
    if (r.error && r.error.code !== "42P01" && r.error.code !== "PGRST205") {
      // Log but don't fail the whole profile; treat a broken optional table as empty.
      console.warn("circle-user-profile: optional lookup error:", r.error.message);
    }
  }

  const accessRows = (accessResult.data ?? []) as AccessRecord[];
  const currentAccess = accessRows.find(r => r.status === "active" && (!r.expires_at || r.expires_at > new Date().toISOString())) || accessRows[0] || null;

  const messages = (messagesResult.data ?? []) as MessageRecord[];
  const nonDeletedMessages = messages.filter(m => !m.deleted_at);
  const deletedMessages = messages.filter(m => m.deleted_at);
  const activeDays = new Set(nonDeletedMessages.map(m => m.created_at.slice(0, 10))).size;
  const lastActive = nonDeletedMessages[0]?.created_at ?? null;

  const roomMap = new Map<string, { actor_key: string; name: string; state: string | null; role: string; messages: number; last_active: string | null }>();
  for (const m of nonDeletedMessages) {
    const existing = roomMap.get(m.actor_key);
    if (existing) {
      existing.messages += 1;
      if (m.created_at > (existing.last_active || "")) existing.last_active = m.created_at;
    } else {
      const parsed = parseActorKey(m.actor_key);
      roomMap.set(m.actor_key, {
        actor_key: m.actor_key,
        name: parsed?.name ?? m.actor_key,
        state: parsed?.state ?? null,
        role: parsed?.role ?? "Unknown role",
        messages: 1,
        last_active: m.created_at,
      });
    }
  }
  const rooms = Array.from(roomMap.values()).sort((a, b) => b.messages - a.messages);

  const submissions = (submissionsResult.data ?? []) as SurveySubmission[];
  const submissionIds = submissions.map(s => s.id);
  let courtActors: { submission_id: string; name: string; role: string; state: string | null; county: string | null }[] = [];
  if (submissionIds.length > 0) {
    const { data: actors, error: actorsErr } = await admin
      .from("court_actors")
      .select("submission_id, name, role, state, court_or_county")
      .in("submission_id", submissionIds);
    if (actorsErr && actorsErr.code !== "42P01" && actorsErr.code !== "PGRST205") {
      throw new Error(`court actors lookup failed: ${actorsErr.message}`);
    }
    courtActors = (actors ?? []).map(a => ({
      submission_id: a.submission_id,
      name: a.name,
      role: a.role,
      state: a.state,
      county: a.court_or_county,
    }));
  }
  const actorsBySubmission = new Map<string, SurveySubmission["court_actors"]>();
  for (const a of courtActors) {
    if (!actorsBySubmission.has(a.submission_id)) actorsBySubmission.set(a.submission_id, []);
    actorsBySubmission.get(a.submission_id)!.push({ name: a.name, role: a.role, state: a.state, county: a.county });
  }
  const surveysWithActors = submissions.map(s => ({
    ...s,
    court_actors: actorsBySubmission.get(s.id) ?? [],
  }));

  const financial: FinancialRecord[] = [];
  for (const a of accessRows) {
    financial.push({
      kind: "access",
      id: a.id,
      date: a.granted_at,
      amount_cents: null,
      description: `${a.access_type} access granted`,
      metadata: { status: a.status, expires_at: a.expires_at, stripe_subscription_id: a.stripe_subscription_id },
    });
  }
  for (const c of (contributionsResult.data ?? []) as { id: string; contribution_type: string; sponsor_email: string; requester_email: string; amount_cents: number; created_at: string }[]) {
    const isGiver = c.sponsor_email.toLowerCase() === email;
    financial.push({
      kind: isGiver ? "contribution_given" : "contribution_received",
      id: c.id,
      date: c.created_at,
      amount_cents: c.amount_cents,
      description: isGiver ? `Sponsored ${c.contribution_type}` : `Received sponsored ${c.contribution_type}`,
      metadata: { contribution_type: c.contribution_type },
    });
  }
  for (const s of (sponsorLinksResult.data ?? []) as { id: string; token: string; requester_note: string | null; status: string; created_at: string }[]) {
    financial.push({
      kind: "sponsor_link",
      id: s.id,
      date: s.created_at,
      amount_cents: null,
      description: `Sponsor request link created${s.requester_note ? `: ${s.requester_note}` : ""}`,
      metadata: { status: s.status, token: s.token },
    });
  }
  financial.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const inviteLinks = (inviteLinksResult.data ?? []) as InviteLinkRecord[];
  const totalInviteUses = inviteLinks.reduce((sum, l) => sum + l.used_count, 0);

  const referrals = (referralsResult.data ?? []) as { id: string; inviter_email: string; referred_email: string | null; status: string; created_at: string; completed_at: string | null; rewarded_at: string | null }[];
  const referralsMade: ReferralRecord[] = referrals
    .filter(r => r.inviter_email.toLowerCase() === email)
    .map(r => ({
      id: r.id,
      other_email: r.referred_email ?? "Unknown",
      status: r.status,
      created_at: r.created_at,
      completed_at: r.completed_at,
      rewarded_at: r.rewarded_at,
    }));
  const referralsReceived: ReferralRecord[] = referrals
    .filter(r => r.referred_email && r.referred_email.toLowerCase() === email)
    .map(r => ({
      id: r.id,
      other_email: r.inviter_email,
      status: r.status,
      created_at: r.created_at,
      completed_at: r.completed_at,
      rewarded_at: r.rewarded_at,
    }));
  const pendingReferrals = referrals.filter(r => r.status === "pending" && r.inviter_email.toLowerCase() === email).length;
  const rewardedReferrals = referrals.filter(r => r.status === "rewarded" && r.inviter_email.toLowerCase() === email).length;
  const monthsEarned = ((rewardsResult.data ?? []) as { reward_months: number }[]).reduce((sum, r) => sum + (r.reward_months || 0), 0);

  // Stripe subscription status for the current access.
  let subscription: SubscriptionRecord | null = null;
  if (currentAccess?.stripe_subscription_id) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (secretKey) {
      try {
        const res = await fetch(`https://api.stripe.com/v1/subscriptions/${currentAccess.stripe_subscription_id}`, {
          headers: { Authorization: `Bearer ${secretKey}`, "Stripe-Version": "2026-02-25.clover" },
        });
        const sub = await res.json().catch(() => null) as { status?: string; current_period_end?: number } | null;
        if (sub?.status) {
          subscription = {
            status: sub.status.charAt(0).toUpperCase() + sub.status.slice(1),
            next_billing_date: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            dashboard_url: currentAccess.stripe_subscription_id
              ? `https://dashboard.stripe.com/subscriptions/${currentAccess.stripe_subscription_id}`
              : `https://dashboard.stripe.com/customers/${currentAccess.stripe_customer_id}`,
          };
        }
      } catch (err) {
        console.error("profile stripe subscription fetch failed:", err);
      }
    }
  }

  return {
    email,
    state: surveysWithActors[0]?.state_of_occurrence ?? null,
    handle: (pseudoResult.data as { handle?: string } | null)?.handle ?? null,
    join_date: currentAccess?.granted_at ?? accessRows[accessRows.length - 1]?.granted_at ?? null,
    access: {
      current_type: currentAccess?.access_type ?? null,
      status: currentAccess?.status ?? null,
      expires_at: currentAccess?.expires_at ?? null,
      history: accessRows,
    },
    activity: {
      total_messages: nonDeletedMessages.length,
      last_active: lastActive,
      active_days: activeDays,
      rooms,
      messages: nonDeletedMessages.slice(0, 100),
    },
    surveys: surveysWithActors,
    financial,
    invites: {
      generated: inviteLinks,
      total_uses: totalInviteUses,
      accepted_count: rewardedReferrals,
      pending: pendingReferrals,
      rewarded: rewardedReferrals,
      months_earned: monthsEarned,
    },
    referrals: {
      made: referralsMade,
      received: referralsReceived,
      months_earned: monthsEarned,
    },
    subscription,
    moderation: {
      deleted_messages: deletedMessages,
      reports: [],
      admin_note: (notesResult.data as { note?: string } | null)?.note ?? null,
    },
    audit: (auditResult.data ?? []) as AuditRecord[],
  };
}

export async function saveCircleUserAdminNote(email: string, note: string, updatedBy: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("connection_circle_user_notes")
    .upsert(
      { email: email.toLowerCase(), note: note.trim(), updated_by: updatedBy, updated_at: new Date().toISOString() },
      { onConflict: "email" }
    );
  if (error) throw new Error(`save admin note failed: ${error.message}`);
}
