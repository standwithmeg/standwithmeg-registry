import "server-only";
import { createAdminSupabaseClient } from "./supabase-admin";

export type FounderDashboardUser = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  state: string | null;
  plan: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

export type FounderDashboardData = {
  users: {
    total: number;
    newThisWeek: number;
    newThisMonth: number;
    activeToday: number;
    recent: FounderDashboardUser[];
  };
  reports: {
    total: number;
    thisWeek: number;
    thisMonth: number;
    pendingApprovals: number;
  };
  circles: {
    activeAccess: number;
    expiringSoon: number;
    pseudonyms: number;
    messagesThisWeek: number;
    pendingRequests: number;
    acceptedRequests: number;
  };
};

function isoOffset(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function count(admin: any, table: string, modify?: (query: any) => any): Promise<number> {
  let query = admin.from(table).select("*", { count: "exact", head: true });
  if (modify) query = modify(query);
  const { count, error } = await query;
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return 0;
    throw new Error(`${table} count failed: ${error.message}`);
  }
  return count ?? 0;
}

export async function fetchFounderDashboardData(): Promise<FounderDashboardData> {
  const admin = createAdminSupabaseClient();
  const weekAgo = isoOffset(24 * 7);
  const monthAgo = isoOffset(24 * 30);
  const dayAgo = isoOffset(24);
  const nowIso = new Date().toISOString();
  const weekAhead = new Date(Date.now() + 24 * 7 * 60 * 60 * 1000).toISOString();

  const authUsers: FounderDashboardUser[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);
    for (const u of data.users) {
      authUsers.push({
        id: u.id,
        email: u.email ?? null,
        first_name: null,
        last_name: null,
        state: null,
        plan: null,
        created_at: (u as { created_at?: string }).created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < perPage) break;
    page++;
  }

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, first_name, last_name, state, plan");
  if (profileError) throw new Error(`profiles select failed: ${profileError.message}`);

  const profileMap = new Map(
    (profiles ?? []).map(p => [
      p.id as string,
      p as {
        first_name?: string | null;
        last_name?: string | null;
        state?: string | null;
        plan?: string | null;
      },
    ])
  );

  const enrichedUsers = authUsers
    .map(u => {
      const p = profileMap.get(u.id);
      return {
        ...u,
        first_name: p?.first_name ?? null,
        last_name: p?.last_name ?? null,
        state: p?.state ?? null,
        plan: p?.plan ?? null,
      };
    })
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

  const newThisWeek = enrichedUsers.filter(u => u.created_at && u.created_at >= weekAgo).length;
  const newThisMonth = enrichedUsers.filter(u => u.created_at && u.created_at >= monthAgo).length;
  const activeToday = enrichedUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at >= dayAgo).length;

  const [
    totalSubmissions,
    submissionsThisWeek,
    submissionsThisMonth,
    pendingApprovals,
    activeAccess,
    activeAccessExpiringSoon,
    totalPseudonyms,
    messagesThisWeek,
    pendingRequests,
    acceptedRequests,
  ] = await Promise.all([
    count(admin, "survey_submissions"),
    count(admin, "survey_submissions", q => q.gte("created_at", weekAgo)),
    count(admin, "survey_submissions", q => q.gte("created_at", monthAgo)),
    count(admin, "survey_submissions", q => q.eq("approved", false)),
    count(admin, "connection_circle_access", q =>
      q.eq("status", "active").or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    ),
    count(admin, "connection_circle_access", q =>
      q.eq("status", "active").lte("expires_at", weekAhead).gt("expires_at", nowIso)
    ),
    count(admin, "connection_circle_pseudonyms"),
    count(admin, "connection_circle_messages", q => q.gte("created_at", weekAgo)),
    count(admin, "connection_circle_requests", q => q.eq("status", "pending").gt("expires_at", nowIso)),
    count(admin, "connection_circle_requests", q => q.eq("status", "accepted")),
  ]);

  return {
    users: {
      total: enrichedUsers.length,
      newThisWeek,
      newThisMonth,
      activeToday,
      recent: enrichedUsers.slice(0, 50),
    },
    reports: {
      total: totalSubmissions,
      thisWeek: submissionsThisWeek,
      thisMonth: submissionsThisMonth,
      pendingApprovals,
    },
    circles: {
      activeAccess,
      expiringSoon: activeAccessExpiringSoon,
      pseudonyms: totalPseudonyms,
      messagesThisWeek,
      pendingRequests,
      acceptedRequests,
    },
  };
}

export type CirclesAccessDetailRow = {
  id: string;
  email: string;
  access_type: string;
  status: string;
  granted_at: string;
  expires_at: string | null;
  state: string | null;
  handle: string | null;
  messages_sent: number;
  last_active: string | null;
  rooms_active: number;
  room_keys: string[];
};

export type CirclesHardshipRow = {
  id: string;
  email: string;
  request_note: string | null;
  status: string;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

export type CircleMember = {
  id: string;
  email: string;
  name: string | null;
  state: string | null;
  handle: string | null;
  access_type: string;
  access_label: string;
  status: string;
  granted_at: string;
  expires_at: string | null;
  last_active: string | null;
  messages_sent: number;
  rooms_active: number;
  free_reason: string | null;
  sponsor_email: string | null;
  referrer_email: string | null;
  referral_status: string | null;
  referrals_made: number;
  referrals_received: number;
  reward_months_earned: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  payment_status: string | null;
  next_billing_date: string | null;
  stripe_dashboard_url: string | null;
};

type RawAccessRow = {
  id: string;
  email: string;
  access_type: string;
  status: string;
  granted_at: string;
  expires_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  sponsor_link_id: string | null;
  referrer_email: string | null;
  referral_status: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
};

type ReferralRow = {
  id: string;
  inviter_email: string;
  referred_email: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
};

export type TopReferrer = {
  email: string;
  referrals: number;
  rewarded: number;
  monthsEarned: number;
  lastReferralAt: string | null;
};

export type PromoStat = {
  code: string;
  uses: number;
  active: boolean;
  expiresAt: string | null;
  disabled: boolean;
  accessDays: number;
  requiresApproval: boolean;
};

export type CircleMessage = {
  id: string;
  actor_key: string;
  sender_email: string;
  sender_handle: string | null;
  body: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type ConnectionRequest = {
  id: string;
  requester_email: string;
  requester_handle: string;
  recipient_email: string;
  recipient_handle: string;
  actor_name: string;
  actor_state: string | null;
  actor_role: string;
  status: string;
  requester_message: string | null;
  created_at: string;
  decided_at: string | null;
  intro_sent_at: string | null;
};

export type InviteLinkDetail = {
  id: string;
  token: string;
  inviter_email: string;
  remaining_uses: number | null;
  used_count: number;
  status: string;
  expires_at: string;
  created_at: string;
};

export type PromoUsage = {
  email: string;
  promo_code: string;
  access_type: string;
  granted_at: string;
  expires_at: string | null;
};

export type CirclesDashboardData = {
  users: {
    totalCircleUsers: number;
    newSignupsToday: number;
    activeAccess: number;
  };
  rooms: {
    activeRooms: number;
    totalMessages: number;
    messages24h: number;
    messages7d: number;
  };
  requests: {
    pendingInvites: number;
    acceptedInvites: number;
    pendingHardship: number;
    fulfilledHardship: number;
  };
  payments: {
    monthly: number;
    annual: number;
    hardship: number;
    sponsored: number;
    promo: number;
    mrrCents: number;
  };
  referrals: {
    total: number;
    pending: number;
    completed: number;
    rewarded: number;
    conversionRate: number;
    monthsRewarded: number;
    topReferrers: TopReferrer[];
  };
  promos: PromoStat[];
  recentAccess: CirclesAccessDetailRow[];
  recentHardship: CirclesHardshipRow[];
  members: CircleMember[];
  recentMessages: CircleMessage[];
  connectionRequests: ConnectionRequest[];
  inviteLinks: InviteLinkDetail[];
  promoUsages: PromoUsage[];
};

export async function fetchCirclesDashboardData(): Promise<CirclesDashboardData> {
  const admin = createAdminSupabaseClient();
  const nowIso = new Date().toISOString();
  const dayAgo = isoOffset(24);
  const weekAgo = isoOffset(24 * 7);
  const monthAgo = isoOffset(24 * 30);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Total distinct users who have ever had access.
  const { count: totalCircleUsers, error: totalUsersErr } = await admin
    .from("connection_circle_access")
    .select("email", { count: "exact", head: true });
  if (totalUsersErr && totalUsersErr.code !== "42P01" && totalUsersErr.code !== "PGRST205") {
    throw new Error(`connection_circle_access distinct users failed: ${totalUsersErr.message}`);
  }

  const [
    newSignupsToday,
    activeAccess,
    activeRooms,
    totalMessages,
    messages24h,
    messages7d,
    pendingInvites,
    acceptedInvites,
    pendingHardship,
    fulfilledHardship,
    monthly,
    annual,
    hardshipAccess,
    sponsoredAccess,
    promoAccess,
  ] = await Promise.all([
    count(admin, "connection_circle_access", q => q.gte("granted_at", todayStart.toISOString())),
    count(admin, "connection_circle_access", q => q.eq("status", "active").or(`expires_at.is.null,expires_at.gt.${nowIso}`)),
    countDistinct(admin, "connection_circle_messages", "actor_key", q => q.gte("created_at", monthAgo).is("deleted_at", null)),
    count(admin, "connection_circle_messages", q => q.is("deleted_at", null)),
    count(admin, "connection_circle_messages", q => q.gte("created_at", dayAgo).is("deleted_at", null)),
    count(admin, "connection_circle_messages", q => q.gte("created_at", weekAgo).is("deleted_at", null)),
    count(admin, "connection_circle_requests", q => q.eq("status", "pending").gt("expires_at", nowIso)),
    count(admin, "connection_circle_requests", q => q.eq("status", "accepted")),
    count(admin, "connection_circle_hardship_requests", q => q.eq("status", "pending")),
    count(admin, "connection_circle_hardship_requests", q => q.eq("status", "fulfilled")),
    count(admin, "connection_circle_access", q => q.eq("status", "active").eq("access_type", "supporter_monthly")),
    count(admin, "connection_circle_access", q => q.eq("status", "active").eq("access_type", "supporter_annual")),
    count(admin, "connection_circle_access", q => q.eq("status", "active").eq("access_type", "hardship")),
    count(admin, "connection_circle_access", q => q.eq("status", "active").or("access_type.eq.sponsored_month,access_type.eq.sponsored_year")),
    count(admin, "connection_circle_access", q => q.eq("status", "active").eq("access_type", "promo")),
  ]);

  const [promoCodesResult] = await Promise.all([
    admin
      .from("connection_circle_promo_codes")
      .select("code, access_type, access_days, expires_at, disabled, max_uses, requires_approval")
      .order("created_at", { ascending: false }),
  ]);

  if (promoCodesResult.error && promoCodesResult.error.code !== "42P01" && promoCodesResult.error.code !== "PGRST205") {
    throw new Error(`promo codes fetch failed: ${promoCodesResult.error.message}`);
  }

  const promoCodes = (promoCodesResult.data ?? []) as { code: string; access_type: string; access_days: number; expires_at: string | null; disabled: boolean; max_uses: number | null; requires_approval: boolean | null }[];
  const promoUseCounts = new Map<string, number>();
  if (promoCodes.length > 0) {
    const { data: promoUses, error: promoUsesError } = await admin
      .from("connection_circle_access")
      .select("promo_code")
      .not("promo_code", "is", null);
    if (promoUsesError && promoUsesError.code !== "42P01" && promoUsesError.code !== "PGRST205") {
      throw new Error(`promo usage fetch failed: ${promoUsesError.message}`);
    }
    for (const row of (promoUses ?? []) as { promo_code: string }[]) {
      const key = row.promo_code.toUpperCase();
      promoUseCounts.set(key, (promoUseCounts.get(key) ?? 0) + 1);
    }
  }
  const promoStats: PromoStat[] = promoCodes.map(p => ({
    code: p.code,
    uses: promoUseCounts.get(p.code.toUpperCase()) ?? 0,
    active: !p.disabled && (!p.expires_at || new Date(p.expires_at) > new Date()),
    expiresAt: p.expires_at,
    disabled: p.disabled,
    accessDays: p.access_days,
    requiresApproval: p.requires_approval ?? false,
  }));

  const [
    recentAccessResult,
    allAccessResult,
    recentHardshipResult,
    referralsResult,
    rewardsResult,
    recentMessagesResult,
    connectionRequestsResult,
    inviteLinksResult,
    promoUsagesResult,
    pseudonymsResult,
  ] = await Promise.all([
    admin
      .from("connection_circle_access")
      .select("id, email, access_type, status, granted_at, expires_at")
      .order("granted_at", { ascending: false })
      .limit(25),
    admin
      .from("connection_circle_access")
      .select("id, email, access_type, status, granted_at, expires_at, stripe_customer_id, stripe_subscription_id, sponsor_link_id, referrer_email, referral_status, revoked_at, revoked_reason")
      .order("granted_at", { ascending: false }),
    admin
      .from("connection_circle_hardship_requests")
      .select("id, email, request_note, status, requested_at, decided_at, decided_by, fulfilled_access_id")
      .order("requested_at", { ascending: false })
      .limit(25),
    admin
      .from("connection_circle_referrals")
      .select("id, inviter_email, referred_email, status, created_at, completed_at"),
    admin
      .from("connection_circle_referrer_rewards")
      .select("referrer_email, reward_months, created_at"),
    admin
      .from("connection_circle_messages")
      .select("id, actor_key, sender_email, body, created_at, deleted_at, deleted_by")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("connection_circle_requests")
      .select("id, requester_email, requester_handle, recipient_email, recipient_handle, actor_name, actor_state, actor_role, status, requester_message, created_at, decided_at, intro_sent_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("connection_circle_invite_links")
      .select("id, token, inviter_email, remaining_uses, used_count, status, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("connection_circle_access")
      .select("email, promo_code, access_type, granted_at, expires_at")
      .not("promo_code", "is", null)
      .order("granted_at", { ascending: false })
      .limit(100),
    admin
      .from("connection_circle_pseudonyms")
      .select("email, handle"),
  ]);

  if (recentAccessResult.error && recentAccessResult.error.code !== "42P01" && recentAccessResult.error.code !== "PGRST205") {
    throw new Error(`recent access failed: ${recentAccessResult.error.message}`);
  }
  if (allAccessResult.error && allAccessResult.error.code !== "42P01" && allAccessResult.error.code !== "PGRST205") {
    throw new Error(`all access fetch failed: ${allAccessResult.error.message}`);
  }
  if (recentHardshipResult.error && recentHardshipResult.error.code !== "42P01" && recentHardshipResult.error.code !== "PGRST205") {
    throw new Error(`recent hardship failed: ${recentHardshipResult.error.message}`);
  }
  if (referralsResult.error && referralsResult.error.code !== "42P01" && referralsResult.error.code !== "PGRST205") {
    throw new Error(`referrals fetch failed: ${referralsResult.error.message}`);
  }
  if (rewardsResult.error && rewardsResult.error.code !== "42P01" && rewardsResult.error.code !== "PGRST205") {
    throw new Error(`rewards fetch failed: ${rewardsResult.error.message}`);
  }
  if (recentMessagesResult.error && recentMessagesResult.error.code !== "42P01" && recentMessagesResult.error.code !== "PGRST205") {
    throw new Error(`messages fetch failed: ${recentMessagesResult.error.message}`);
  }
  if (connectionRequestsResult.error && connectionRequestsResult.error.code !== "42P01" && connectionRequestsResult.error.code !== "PGRST205") {
    throw new Error(`connection requests fetch failed: ${connectionRequestsResult.error.message}`);
  }
  if (inviteLinksResult.error && inviteLinksResult.error.code !== "42P01" && inviteLinksResult.error.code !== "PGRST205") {
    throw new Error(`invite links fetch failed: ${inviteLinksResult.error.message}`);
  }
  if (promoUsagesResult.error && promoUsagesResult.error.code !== "42P01" && promoUsagesResult.error.code !== "PGRST205") {
    throw new Error(`promo usages fetch failed: ${promoUsagesResult.error.message}`);
  }
  if (pseudonymsResult.error && pseudonymsResult.error.code !== "42P01" && pseudonymsResult.error.code !== "PGRST205") {
    throw new Error(`pseudonyms fetch failed: ${pseudonymsResult.error.message}`);
  }

  const handleByEmail = new Map<string, string>();
  for (const row of (pseudonymsResult.data ?? []) as { email: string; handle: string }[]) {
    handleByEmail.set(row.email.toLowerCase(), row.handle);
  }

  const recentMessages: CircleMessage[] = ((recentMessagesResult.data ?? []) as { id: string; actor_key: string; sender_email: string; body: string; created_at: string; deleted_at: string | null; deleted_by: string | null }[]).map(m => ({
    ...m,
    sender_handle: handleByEmail.get(m.sender_email.toLowerCase()) ?? null,
  }));

  const enrichedRecentAccess = await enrichAccessRows(
    admin,
    (recentAccessResult.data ?? []) as { id: string; email: string; access_type: string; status: string; granted_at: string; expires_at: string | null }[]
  );

  const referrals = (referralsResult.data ?? []) as ReferralRow[];
  const rewards = (rewardsResult.data ?? []) as { referrer_email: string; reward_months: number; created_at: string }[];

  const members = await buildMembers(
    admin,
    (allAccessResult.data ?? []) as RawAccessRow[],
    (recentHardshipResult.data ?? []) as { id: string; email: string; status: string; decided_at: string | null; decided_by: string | null; fulfilled_access_id: string | null }[],
    referrals
  );

  const referralTotal = referrals.length;
  const referralPending = referrals.filter(r => r.status === "pending").length;
  const referralCompleted = referrals.filter(r => r.status === "completed" || r.status === "rewarded").length;
  const referralRewarded = referrals.filter(r => r.status === "rewarded").length;
  const conversionRate = referralTotal > 0 ? Math.round((referralRewarded / referralTotal) * 100) : 0;
  const monthsRewarded = rewards.reduce((sum, r) => sum + (r.reward_months || 0), 0);

  const referrerMap = new Map<string, TopReferrer>();
  for (const r of referrals) {
    const email = r.inviter_email.toLowerCase();
    const existing = referrerMap.get(email);
    if (existing) {
      existing.referrals += 1;
      if (r.status === "rewarded") existing.rewarded += 1;
      if (r.created_at && (!existing.lastReferralAt || r.created_at > existing.lastReferralAt)) {
        existing.lastReferralAt = r.created_at;
      }
    } else {
      referrerMap.set(email, {
        email,
        referrals: 1,
        rewarded: r.status === "rewarded" ? 1 : 0,
        monthsEarned: 0,
        lastReferralAt: r.created_at,
      });
    }
  }
  for (const r of rewards) {
    const email = r.referrer_email.toLowerCase();
    const existing = referrerMap.get(email);
    if (existing) {
      existing.monthsEarned += r.reward_months || 0;
    } else {
      referrerMap.set(email, {
        email,
        referrals: 0,
        rewarded: 0,
        monthsEarned: r.reward_months || 0,
        lastReferralAt: null,
      });
    }
  }
  const topReferrers = Array.from(referrerMap.values())
    .sort((a, b) => b.referrals - a.referrals || b.rewarded - a.rewarded)
    .slice(0, 10);

  // MRR estimate: monthly at $6, annual at $50/12.
  const mrrCents = monthly * 600 + Math.round((annual * 5000) / 12);

  return {
    users: {
      totalCircleUsers: totalCircleUsers ?? 0,
      newSignupsToday,
      activeAccess,
    },
    rooms: {
      activeRooms,
      totalMessages,
      messages24h,
      messages7d,
    },
    requests: {
      pendingInvites,
      acceptedInvites,
      pendingHardship,
      fulfilledHardship,
    },
    payments: {
      monthly,
      annual,
      hardship: hardshipAccess,
      sponsored: sponsoredAccess,
      promo: promoAccess,
      mrrCents,
    },
    referrals: {
      total: referralTotal,
      pending: referralPending,
      completed: referralCompleted,
      rewarded: referralRewarded,
      conversionRate,
      monthsRewarded,
      topReferrers,
    },
    promos: promoStats,
    recentAccess: enrichedRecentAccess,
    recentHardship: (recentHardshipResult.data ?? []) as CirclesHardshipRow[],
    members,
    recentMessages,
    connectionRequests: (connectionRequestsResult.data ?? []) as ConnectionRequest[],
    inviteLinks: (inviteLinksResult.data ?? []) as InviteLinkDetail[],
    promoUsages: (promoUsagesResult.data ?? []) as PromoUsage[],
  };
}

async function fetchStripeSubscriptionMap(
  subscriptionIds: string[]
): Promise<Map<string, { status: string; current_period_end: number }>> {
  const map = new Map<string, { status: string; current_period_end: number }>();
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || subscriptionIds.length === 0) return map;

  // Batch by unique ids; Stripe supports up to 100 ids in `ids[]`.
  const uniqueIds = Array.from(new Set(subscriptionIds));
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    const params = new URLSearchParams();
    params.set("status", "all");
    params.set("limit", "100");
    batch.forEach(id => params.append("ids[]", id));
    try {
      const res = await fetch(`https://api.stripe.com/v1/subscriptions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${secretKey}`, "Stripe-Version": "2026-02-25.clover" },
      });
      const data = await res.json().catch(() => ({ data: [] })) as { data?: { id: string; status: string; current_period_end: number }[] };
      for (const sub of (data.data ?? [])) {
        map.set(sub.id, { status: sub.status, current_period_end: sub.current_period_end });
      }
    } catch (err) {
      console.error("Stripe subscription fetch failed:", err);
    }
  }
  return map;
}

function accessTypeLabel(type: string): string {
  switch (type) {
    case "supporter_monthly": return "Paid $6/mo";
    case "supporter_annual": return "Paid $50/yr";
    case "hardship": return "Hardship (free)";
    case "sponsored_month":
    case "sponsored_year": return "Sponsored (donation)";
    case "sponsor_pool": return "Sponsor pool (donation)";
    case "promo": return "Promo (free)";
    default: return type;
  }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString();
}

async function buildMembers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  accessRows: RawAccessRow[],
  hardshipRows: { id: string; email: string; status: string; decided_at: string | null; decided_by: string | null; fulfilled_access_id: string | null }[],
  referrals: ReferralRow[]
): Promise<CircleMember[]> {
  if (accessRows.length === 0) return [];

  const emails = Array.from(new Set(accessRows.map(r => r.email.toLowerCase())));
  const accessIds = accessRows.map(r => r.id);
  const sponsorLinkIds = Array.from(new Set(accessRows.map(r => r.sponsor_link_id).filter(Boolean) as string[]));

  const [
    stateResult,
    profileResult,
    pseudoResult,
    msgResult,
    sponsorLinksResult,
    sponsorContributionsResult,
  ] = await Promise.all([
    admin
      .from("survey_submissions")
      .select("email, state_of_occurrence")
      .in("email", emails)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("email", emails),
    admin
      .from("connection_circle_pseudonyms")
      .select("email, handle, reward_months_earned")
      .in("email", emails),
    admin
      .from("connection_circle_messages")
      .select("sender_email, actor_key, created_at")
      .in("sender_email", emails)
      .is("deleted_at", null),
    sponsorLinkIds.length > 0
      ? admin.from("connection_circle_sponsor_links").select("id, requester_email, fulfilled_at").in("id", sponsorLinkIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("connection_circle_sponsor_contributions")
      .select("access_id, sponsor_email, created_at")
      .in("access_id", accessIds),
  ]);

  const stateByEmail = new Map<string, string>();
  for (const row of (stateResult.data ?? []) as { email: string; state_of_occurrence: string | null }[]) {
    const key = row.email.toLowerCase();
    if (!stateByEmail.has(key) && row.state_of_occurrence) stateByEmail.set(key, row.state_of_occurrence);
  }

  const nameByEmail = new Map<string, string>();
  for (const row of (profileResult.data ?? []) as { email: string; first_name: string | null; last_name: string | null }[]) {
    const key = row.email.toLowerCase();
    const full = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
    if (full) nameByEmail.set(key, full);
  }

  const handleByEmail = new Map<string, string>();
  const rewardMonthsEarnedByEmail = new Map<string, number>();
  for (const row of (pseudoResult.data ?? []) as { email: string; handle: string; reward_months_earned: number }[]) {
    const key = row.email.toLowerCase();
    handleByEmail.set(key, row.handle);
    rewardMonthsEarnedByEmail.set(key, row.reward_months_earned || 0);
  }

  const activityByEmail = new Map<string, { messages: number; last_active: string | null; rooms: Set<string> }>();
  for (const row of (msgResult.data ?? []) as { sender_email: string; actor_key: string; created_at: string }[]) {
    const key = row.sender_email.toLowerCase();
    let a = activityByEmail.get(key);
    if (!a) {
      a = { messages: 0, last_active: null, rooms: new Set<string>() };
      activityByEmail.set(key, a);
    }
    a.messages += 1;
    a.rooms.add(row.actor_key);
    if (!a.last_active || row.created_at > a.last_active) a.last_active = row.created_at;
  }

  const hardshipByAccessId = new Map<string, typeof hardshipRows[0]>();
  for (const row of hardshipRows) {
    if (row.fulfilled_access_id) hardshipByAccessId.set(row.fulfilled_access_id, row);
  }

  const sponsorLinkById = new Map<string, { requester_email: string; fulfilled_at: string | null }>();
  for (const row of (sponsorLinksResult.data ?? []) as { id: string; requester_email: string; fulfilled_at: string | null }[]) {
    sponsorLinkById.set(row.id, row);
  }

  const sponsorContributionByAccessId = new Map<string, { sponsor_email: string; created_at: string }>();
  for (const row of (sponsorContributionsResult.data ?? []) as { access_id: string; sponsor_email: string; created_at: string }[]) {
    sponsorContributionByAccessId.set(row.access_id, row);
  }

  const referralsMadeByEmail = new Map<string, number>();
  const referralsReceivedByEmail = new Map<string, number>();
  for (const r of referrals) {
    const inviter = r.inviter_email.toLowerCase();
    referralsMadeByEmail.set(inviter, (referralsMadeByEmail.get(inviter) ?? 0) + 1);
    if (r.referred_email) {
      const referred = r.referred_email.toLowerCase();
      referralsReceivedByEmail.set(referred, (referralsReceivedByEmail.get(referred) ?? 0) + 1);
    }
  }

  const subscriptionIds = accessRows.map(r => r.stripe_subscription_id).filter(Boolean) as string[];
  const stripeSubscriptionMap = await fetchStripeSubscriptionMap(subscriptionIds);

  return accessRows.map(row => {
    const key = row.email.toLowerCase();
    const activity = activityByEmail.get(key);
    const isPaid = row.access_type === "supporter_monthly" || row.access_type === "supporter_annual";
    const isFree = row.access_type === "hardship" || row.access_type === "sponsored_month" || row.access_type === "sponsored_year";

    let freeReason: string | null = null;
    if (row.access_type === "hardship") {
      const hr = hardshipByAccessId.get(row.id);
      if (hr) {
        freeReason = `Granted by ${hr.decided_by || "admin"} on ${fmtDateTime(hr.decided_at)}`;
      } else {
        freeReason = "Admin granted";
      }
    } else if (row.access_type === "sponsored_month" || row.access_type === "sponsored_year") {
      const contribution = sponsorContributionByAccessId.get(row.id);
      const link = row.sponsor_link_id ? sponsorLinkById.get(row.sponsor_link_id) : null;
      const sponsor = contribution?.sponsor_email ?? "Anonymous donor";
      const when = contribution?.created_at ?? link?.fulfilled_at ?? row.granted_at;
      freeReason = `Donation from ${sponsor} on ${fmtDateTime(when)}`;
    }

    let paymentStatus: string | null = null;
    let nextBillingDate: string | null = null;
    if (row.stripe_subscription_id) {
      const sub = stripeSubscriptionMap.get(row.stripe_subscription_id);
      if (sub) {
        paymentStatus = sub.status.charAt(0).toUpperCase() + sub.status.slice(1);
        nextBillingDate = new Date(sub.current_period_end * 1000).toISOString();
      }
    }
    if (!paymentStatus) {
      if (row.status === "revoked" && row.revoked_reason === "subscription_deleted") {
        paymentStatus = "Canceled";
      } else if (isPaid) {
        paymentStatus = "Active";
      } else if (isFree) {
        paymentStatus = "Free";
      }
    }

    const stripeDashboardUrl = row.stripe_customer_id
      ? `https://dashboard.stripe.com/customers/${row.stripe_customer_id}`
      : row.stripe_subscription_id
        ? `https://dashboard.stripe.com/subscriptions/${row.stripe_subscription_id}`
        : null;

    return {
      id: row.id,
      email: row.email,
      name: nameByEmail.get(key) ?? null,
      state: stateByEmail.get(key) ?? null,
      handle: handleByEmail.get(key) ?? null,
      access_type: row.access_type,
      access_label: accessTypeLabel(row.access_type),
      status: row.status,
      granted_at: row.granted_at,
      expires_at: row.expires_at,
      last_active: activity?.last_active ?? null,
      messages_sent: activity?.messages ?? 0,
      rooms_active: activity?.rooms.size ?? 0,
      free_reason: freeReason,
      sponsor_email: sponsorContributionByAccessId.get(row.id)?.sponsor_email ?? null,
      referrer_email: row.referrer_email,
      referral_status: row.referral_status,
      referrals_made: referralsMadeByEmail.get(key) ?? 0,
      referrals_received: referralsReceivedByEmail.get(key) ?? 0,
      reward_months_earned: rewardMonthsEarnedByEmail.get(key) ?? 0,
      stripe_customer_id: row.stripe_customer_id,
      stripe_subscription_id: row.stripe_subscription_id,
      payment_status: paymentStatus,
      next_billing_date: nextBillingDate,
      stripe_dashboard_url: stripeDashboardUrl,
    };
  });
}

async function enrichAccessRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  rows: { id: string; email: string; access_type: string; status: string; granted_at: string; expires_at: string | null }[]
): Promise<CirclesAccessDetailRow[]> {
  if (rows.length === 0) return [];
  const emails = Array.from(new Set(rows.map(r => r.email.toLowerCase())));

  const [stateResult, pseudoResult, msgResult] = await Promise.all([
    admin
      .from("survey_submissions")
      .select("email, state_of_occurrence")
      .in("email", emails)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("connection_circle_pseudonyms")
      .select("email, handle")
      .in("email", emails),
    admin
      .from("connection_circle_messages")
      .select("sender_email, actor_key, created_at")
      .in("sender_email", emails)
      .is("deleted_at", null),
  ]);

  const stateByEmail = new Map<string, string>();
  for (const row of (stateResult.data ?? []) as { email: string; state_of_occurrence: string | null }[]) {
    const key = row.email.toLowerCase();
    if (!stateByEmail.has(key) && row.state_of_occurrence) {
      stateByEmail.set(key, row.state_of_occurrence);
    }
  }

  const handleByEmail = new Map<string, string>();
  for (const row of (pseudoResult.data ?? []) as { email: string; handle: string }[]) {
    handleByEmail.set(row.email.toLowerCase(), row.handle);
  }

  const activityByEmail = new Map<
    string,
    { messages: number; last_active: string | null; rooms: Set<string> }
  >();
  for (const row of (msgResult.data ?? []) as { sender_email: string; actor_key: string; created_at: string }[]) {
    const key = row.sender_email.toLowerCase();
    let a = activityByEmail.get(key);
    if (!a) {
      a = { messages: 0, last_active: null, rooms: new Set<string>() };
      activityByEmail.set(key, a);
    }
    a.messages += 1;
    a.rooms.add(row.actor_key);
    if (!a.last_active || row.created_at > a.last_active) a.last_active = row.created_at;
  }

  return rows.map(row => {
    const key = row.email.toLowerCase();
    const activity = activityByEmail.get(key);
    return {
      ...row,
      state: stateByEmail.get(key) ?? null,
      handle: handleByEmail.get(key) ?? null,
      messages_sent: activity?.messages ?? 0,
      last_active: activity?.last_active ?? null,
      rooms_active: activity?.rooms.size ?? 0,
      room_keys: activity ? Array.from(activity.rooms) : [],
    };
  });
}

async function countDistinct(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  table: string,
  column: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modify?: (query: any) => any
): Promise<number> {
  let query = admin.from(table).select(column, { count: "exact", head: true });
  if (modify) query = modify(query);
  const { count, error } = await query;
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return 0;
    throw new Error(`${table} distinct count failed: ${error.message}`);
  }
  return count ?? 0;
}
