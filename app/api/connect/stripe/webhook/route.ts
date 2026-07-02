import { after } from "next/server";
import { addDaysIso, cleanSingleLine, verifyStripeSignature } from "../../../../../lib/connection-circles";
import { grantReportKitAccess } from "../../../../../lib/report-kit";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { sendCircleAccessGrantedEmail } from "../../../../../lib/connection-circle-emails";
import { summarizeEmailError } from "../../../../../lib/smtp-email";

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com").replace(/\/+$/, "");

type StripeCheckoutSession = {
  id: string;
  object: "checkout.session";
  mode?: string;
  amount_total?: number | null;
  currency?: string | null;
  customer?: string | null;
  subscription?: string | null;
  customer_details?: { email?: string | null } | null;
  customer_email?: string | null;
  metadata?: Record<string, string | undefined> | null;
};

type StripeSubscriptionDeleted = {
  id: string;
  object: "subscription";
};

type StripeInvoicePaymentSucceeded = {
  id?: string;
  object: "invoice";
  amount_paid?: number | null;
  billing_reason?: string | null;
  currency?: string | null;
  customer_email?: string | null;
  customer?: string | null;
  subscription?: string | null;
  lines?: { data?: { metadata?: Record<string, string | undefined> }[] };
};

type StripeEventObject = StripeCheckoutSession | StripeSubscriptionDeleted | StripeInvoicePaymentSucceeded;

type StripeEvent = {
  type: string;
  data?: { object?: StripeEventObject };
};

function accessDays(accessType: string | null | undefined): number | null {
  if (accessType === "supporter_annual" || accessType === "sponsored_year") return 370;
  if (accessType === "supporter_monthly" || accessType === "sponsored_month") return 35;
  return null;
}

function tagPreferenceFromMetadata(metadata: Record<string, string | undefined>): {
  tag_permission: "tag" | "first_name" | "anonymous";
  sponsor_name: string | null;
  social_handle: string | null;
} {
  const raw = metadata.tag_permission;
  const permission = raw === "tag" || raw === "first_name" ? raw : "anonymous";
  return {
    tag_permission: permission,
    sponsor_name: permission === "first_name" ? cleanSingleLine(metadata.sponsor_name, 80) : null,
    social_handle: permission === "tag" ? cleanSingleLine(metadata.social_handle, 80) : null,
  };
}

function extendFromCurrent(expiresAt: string | null | undefined, days: number): string {
  const now = Date.now();
  const current = expiresAt ? new Date(expiresAt).getTime() : 0;
  const base = Number.isFinite(current) && current > now ? current : now;
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

async function handleCheckoutCompleted(session: StripeCheckoutSession) {
  const metadata = session.metadata ?? {};
  const purpose = metadata.purpose;
  const sb = createAdminSupabaseClient();
  const sponsorEmail = session.customer_details?.email || session.customer_email || null;
  const amountCents = Number(session.amount_total ?? 0);
  const currency = session.currency || "usd";

  // Idempotency guard: every checkout event must be processed once.
  // `stripe_session_id` is treated as a unique idempotency key.
  const { data: existingAccess } = await sb
    .from("connection_circle_access")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existingAccess) {
    return;
  }

  if (purpose === "connect_supporter") {
    const email = metadata.user_email;
    const accessType = metadata.access_type === "supporter_annual" ? "supporter_annual" : "supporter_monthly";
    if (!email) throw new Error("connect_supporter session missing user_email metadata.");

    // Validate access_type is one of the allowed supporter types
    if (accessType !== "supporter_monthly" && accessType !== "supporter_annual") {
      throw new Error(`connect_supporter invalid access_type: ${metadata.access_type}`);
    }

    const fallbackExpiresAt = accessType === "supporter_annual" ? addDaysIso(370) : addDaysIso(35);

    const { data: access, error } = await sb
      .from("connection_circle_access")
      .insert({
        email,
        access_type: accessType,
        status: "active",
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
        stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null,
        stripe_session_id: session.id,
        expires_at: fallbackExpiresAt,
      })
      .select("id")
      .single();
    if (error && error.code !== "23505") throw new Error(`supporter access insert failed: ${error.message}`);

    const accessId = access?.id;
    if (accessId && metadata.ref_token) {
      try {
        const { completeReferral } = await import("../../../../../lib/connection-circle-invites");
        await completeReferral(metadata.ref_token, email, accessId);
      } catch (referralErr) {
        console.error("referral reward failed for session", session.id, referralErr);
      }
    }
    return;
  }

  if (purpose === "connect_sponsor_direct") {
    const requesterEmail = metadata.requester_email;
    const sponsorLinkId = metadata.sponsor_link_id;
    const accessType = metadata.access_type === "sponsored_year" ? "sponsored_year" : "sponsored_month";
    if (!requesterEmail || !sponsorLinkId) throw new Error("connect_sponsor_direct session missing requester metadata.");

    // Idempotency: if this session was already processed by the guard above, bail.
    // Also verify the sponsor link hasn't been fulfilled by a different session.
    const { data: existingLink } = await sb
      .from("connection_circle_sponsor_links")
      .select("status, fulfilled_access_id")
      .eq("id", sponsorLinkId)
      .maybeSingle();
    if (existingLink?.status === "fulfilled") {
      return;
    }

    const { data: access, error: accessError } = await sb
      .from("connection_circle_access")
      .insert({
        email: requesterEmail,
        access_type: accessType,
        status: "active",
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
        stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null,
        stripe_session_id: session.id,
        sponsor_link_id: sponsorLinkId,
        expires_at: addDaysIso(accessDays(accessType) ?? 35),
      })
      .select("id")
      .single();
    if (accessError && accessError.code !== "23505") throw new Error(`sponsored access insert failed: ${accessError.message}`);
    if (!access) {
      // 23505 case: another webhook processed this session concurrently.
      return;
    }

    const { error: linkError } = await sb
      .from("connection_circle_sponsor_links")
      .update({
        status: "fulfilled",
        fulfilled_access_id: access.id,
        fulfilled_at: new Date().toISOString(),
      })
      .eq("id", sponsorLinkId)
      .eq("status", "pending");
    if (linkError) throw new Error(`sponsor link update failed: ${linkError.message}`);

    const { error: contributionError } = await sb.from("connection_circle_sponsor_contributions").insert({
      contribution_type: accessType === "sponsored_year" ? "direct_year" : "direct_month",
      sponsor_email: sponsorEmail,
      requester_email: requesterEmail,
      sponsor_link_id: sponsorLinkId,
      access_id: access.id,
      stripe_session_id: session.id,
      amount_cents: amountCents || (accessType === "sponsored_year" ? 5000 : 600),
      currency,
      ...tagPreferenceFromMetadata(metadata),
    });
    if (contributionError && contributionError.code !== "23505") {
      throw new Error(`sponsor contribution insert failed: ${contributionError.message}`);
    }

    // Tell the sponsored family their access is live so they actually log in.
    // Non-blocking: a failed email must never fail the webhook (Stripe would
    // retry and double-process).
    after(async () => {
      try {
        await sendCircleAccessGrantedEmail({ email: requesterEmail, appOrigin: APP_ORIGIN, reason: "sponsored" });
      } catch (mailErr) {
        console.error("sponsored access notification email failed:", summarizeEmailError(mailErr));
      }
    });
    return;
  }

  if (purpose === "report_kit") {
    const email = (metadata.user_email || sponsorEmail || "").trim().toLowerCase();
    if (!email) throw new Error("report_kit session missing user_email metadata.");

    const { data: existingKit } = await sb
      .from("report_kit_access")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle();
    if (existingKit) return;

    await grantReportKitAccess({
      email,
      stripeSessionId: session.id,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    });
    return;
  }

  if (purpose === "connect_sponsor_pool") {
    const rawKind = metadata.kind;
    const contributionType = rawKind === "sponsor_pool_year"
      ? "pool_year"
      : rawKind === "sponsor_pool_custom"
        ? "pool_custom"
        : "pool_month";
    const { error } = await sb.from("connection_circle_sponsor_contributions").insert({
      contribution_type: contributionType,
      sponsor_email: sponsorEmail,
      stripe_session_id: session.id,
      amount_cents: amountCents || (contributionType === "pool_year" ? 5000 : 600),
      currency,
      ...tagPreferenceFromMetadata(metadata),
    });
    if (error && error.code !== "23505") throw new Error(`sponsor pool contribution insert failed: ${error.message}`);
  }
}

async function handleInvoicePaymentSucceeded(invoice: StripeInvoicePaymentSucceeded) {
  if (invoice.billing_reason === "subscription_create") return;

  const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
  if (!subscriptionId) return;

  const sb = createAdminSupabaseClient();
  const { data: accessRows, error: accessError } = await sb
    .from("connection_circle_access")
    .select("id, access_type, expires_at")
    .eq("stripe_subscription_id", subscriptionId)
    .eq("status", "active");
  if (accessError) throw new Error(`invoice access lookup failed: ${accessError.message}`);

  for (const row of (accessRows ?? []) as { id: string; access_type: string; expires_at: string | null }[]) {
    const days = accessDays(row.access_type);
    if (!days) continue;
    const { error } = await sb
      .from("connection_circle_access")
      .update({ expires_at: extendFromCurrent(row.expires_at, days) })
      .eq("id", row.id);
    if (error) throw new Error(`invoice access extension failed: ${error.message}`);
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json({ error: "Stripe webhook secret is not configured." }, { status: 500 });
  }
  if (!verifyStripeSignature(body, request.headers.get("stripe-signature"), webhookSecret)) {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    const event = JSON.parse(body) as StripeEvent;

    if (event.type === "checkout.session.completed" && event.data?.object?.object === "checkout.session") {
      await handleCheckoutCompleted(event.data.object as StripeCheckoutSession);
    }

    if (event.type === "customer.subscription.deleted" && event.data?.object?.object === "subscription") {
      const sub = event.data.object as StripeSubscriptionDeleted;
      const sb = createAdminSupabaseClient();
      await sb
        .from("connection_circle_access")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_reason: "subscription_deleted" })
        .eq("stripe_subscription_id", sub.id)
        .eq("status", "active");
    }

    if (event.type === "invoice.payment_succeeded" && event.data?.object?.object === "invoice") {
      await handleInvoicePaymentSucceeded(event.data.object as StripeInvoicePaymentSucceeded);
    }

    return Response.json({ received: true });
  } catch (err) {
    console.error("POST /api/connect/stripe/webhook error:", err);
    return Response.json({ error: "Webhook handling failed." }, { status: 500 });
  }
}
