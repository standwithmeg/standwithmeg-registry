import "server-only";
import { randomBytes } from "crypto";
import { createAdminSupabaseClient } from "./supabase-admin";
import { normalizeEmail } from "./connection-circles";

export const INVITE_LINK_EXPIRY_DAYS = 30;

export type InviteLink = {
  id: string;
  token: string;
  inviter_email: string;
  remaining_uses: number | null;
  used_count: number;
  status: "active" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
};

export type ReferralStats = {
  total_referrals: number;
  pending_referrals: number;
  completed_referrals: number;
  rewarded_referrals: number;
  months_earned: number;
};

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function listInviteLinks(inviterEmail: string): Promise<{
  links: InviteLink[];
  stats: ReferralStats;
}> {
  const sb = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const email = inviterEmail.toLowerCase();

  const [linksResult, referralsResult, rewardsResult] = await Promise.all([
    sb
      .from("connection_circle_invite_links")
      .select("id, token, inviter_email, remaining_uses, used_count, status, expires_at, created_at")
      .ilike("inviter_email", email)
      .eq("status", "active")
      .gt("expires_at", now)
      .order("created_at", { ascending: false }),
    sb
      .from("connection_circle_referrals")
      .select("status", { count: "exact", head: false })
      .ilike("inviter_email", email),
    sb
      .from("connection_circle_referrer_rewards")
      .select("reward_months", { count: "exact", head: false })
      .ilike("referrer_email", email)
      .in("status", ["active", "applied"]),
  ]);

  if (linksResult.error && linksResult.error.code !== "42P01" && linksResult.error.code !== "PGRST205") {
    throw new Error(`list invite links failed: ${linksResult.error.message}`);
  }
  if (referralsResult.error && referralsResult.error.code !== "42P01" && referralsResult.error.code !== "PGRST205") {
    throw new Error(`referral stats failed: ${referralsResult.error.message}`);
  }
  if (rewardsResult.error && rewardsResult.error.code !== "42P01" && rewardsResult.error.code !== "PGRST205") {
    throw new Error(`reward stats failed: ${rewardsResult.error.message}`);
  }

  const refs = (referralsResult.data ?? []) as { status: string }[];
  const pending = refs.filter(r => r.status === "pending").length;
  const completed = refs.filter(r => r.status === "completed").length;
  const rewarded = refs.filter(r => r.status === "rewarded").length;
  const monthsEarned = ((rewardsResult.data ?? []) as { reward_months: number }[]).reduce((s, r) => s + r.reward_months, 0);

  return {
    links: (linksResult.data ?? []) as InviteLink[],
    stats: {
      total_referrals: refs.length,
      pending_referrals: pending,
      completed_referrals: completed,
      rewarded_referrals: rewarded,
      months_earned: monthsEarned,
    },
  };
}

export async function createInviteLink(inviterEmail: string): Promise<InviteLink> {
  const sb = createAdminSupabaseClient();
  const expiresAt = new Date(Date.now() + INVITE_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("connection_circle_invite_links")
    .insert({
      token: newToken(),
      inviter_email: normalizeEmail(inviterEmail),
      remaining_uses: null,
      used_count: 0,
      status: "active",
      expires_at: expiresAt,
    })
    .select("id, token, inviter_email, remaining_uses, used_count, status, expires_at, created_at")
    .single();

  if (error) throw new Error(`create invite link failed: ${error.message}`);
  return data as InviteLink;
}

export async function revokeInviteLink(inviterEmail: string, linkId: string): Promise<void> {
  const sb = createAdminSupabaseClient();
  const { error } = await sb
    .from("connection_circle_invite_links")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", linkId)
    .ilike("inviter_email", inviterEmail);
  if (error) throw new Error(`revoke invite link failed: ${error.message}`);
}

export async function getInviteLinkByToken(token: string): Promise<InviteLink | null> {
  const sb = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("connection_circle_invite_links")
    .select("id, token, inviter_email, remaining_uses, used_count, status, expires_at, created_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`invite link lookup failed: ${error.message}`);
  if (!data) return null;
  const link = data as InviteLink;
  if (link.status !== "active" || link.expires_at <= now) return null;
  return link;
}

export type TrackReferralResult =
  | { ok: true; inviter_email: string; already: boolean }
  | { ok: false; reason: "self_referral" | "invalid_link" };

export async function trackPendingReferral(token: string, referredEmail: string): Promise<TrackReferralResult> {
  const sb = createAdminSupabaseClient();
  const link = await getInviteLinkByToken(token);
  if (!link) return { ok: false, reason: "invalid_link" };

  const inviter = link.inviter_email.toLowerCase();
  const referred = normalizeEmail(referredEmail);
  if (inviter === referred) return { ok: false, reason: "self_referral" };

  const { data: existing } = await sb
    .from("connection_circle_referrals")
    .select("id, status")
    .ilike("referred_email", referred)
    .ilike("inviter_email", inviter)
    .maybeSingle();

  if (existing) {
    return { ok: true, inviter_email: inviter, already: true };
  }

  const { error } = await sb.from("connection_circle_referrals").insert({
    inviter_email: inviter,
    referred_email: referred,
    invite_link_token: token,
    status: "pending",
  });
  if (error) throw new Error(`track referral failed: ${error.message}`);
  return { ok: true, inviter_email: inviter, already: false };
}

export async function completeReferral(token: string, referredEmail: string, accessId: string): Promise<void> {
  const sb = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const referred = normalizeEmail(referredEmail);

  const { data: referral } = await sb
    .from("connection_circle_referrals")
    .select("id, inviter_email, status")
    .ilike("referred_email", referred)
    .eq("invite_link_token", token)
    .maybeSingle();

  if (!referral || referral.status !== "pending") return;

  // Mark referral completed and reward the inviter with one free month.
  const { error: updateErr } = await sb
    .from("connection_circle_referrals")
    .update({ status: "rewarded", completed_at: now, rewarded_at: now })
    .eq("id", referral.id);
  if (updateErr) throw new Error(`complete referral failed: ${updateErr.message}`);

  // Record the reward.
  const rewardExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const { error: rewardErr } = await sb.from("connection_circle_referrer_rewards").insert({
    referral_id: referral.id,
    referrer_email: referral.inviter_email,
    reward_months: 1,
    status: "active",
    expires_at: rewardExpiresAt,
  });
  if (rewardErr && rewardErr.code !== "23505") throw new Error(`reward insert failed: ${rewardErr.message}`);

  // Bump the inviter's earned total.
  const { data: pseudo } = await sb
    .from("connection_circle_pseudonyms")
    .select("id, reward_months_earned")
    .ilike("email", referral.inviter_email)
    .maybeSingle();
  if (pseudo) {
    await sb
      .from("connection_circle_pseudonyms")
      .update({ reward_months_earned: (pseudo.reward_months_earned || 0) + 1 })
      .eq("id", pseudo.id);
  }

  // Extend the inviter's active access by one month if they have it.
  const { data: accessRows } = await sb
    .from("connection_circle_access")
    .select("id, expires_at")
    .ilike("email", referral.inviter_email)
    .eq("status", "active")
    .or("expires_at.is.null,expires_at.gt.now()");
  for (const row of (accessRows ?? []) as { id: string; expires_at: string | null }[]) {
    const current = row.expires_at ? new Date(row.expires_at).getTime() : Date.now();
    const base = current > Date.now() ? current : Date.now();
    const next = new Date(base);
    next.setUTCDate(next.getUTCDate() + 30);
    await sb.from("connection_circle_access").update({ expires_at: next.toISOString() }).eq("id", row.id);
  }

  // Stamp the new access grant with referrer info.
  await sb
    .from("connection_circle_access")
    .update({ referrer_email: referral.inviter_email, referral_status: "rewarded" })
    .eq("id", accessId);
}
