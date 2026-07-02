import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import {
  cleanSingleLine,
  createStripeCheckoutSession,
  findLatestSurveySubmitter,
  isValidEmail,
  normalizeEmail,
} from "../../../../lib/connection-circles";

type CheckoutKind =
  | "supporter_monthly"
  | "supporter_annual"
  | "sponsor_direct_month"
  | "sponsor_direct_year"
  | "sponsor_pool_month"
  | "sponsor_pool_year"
  | "sponsor_pool_custom";

function priceIdFor(kind: CheckoutKind): string | null {
  if (kind === "supporter_monthly") return process.env.STRIPE_CONNECT_MONTHLY_PRICE_ID || null;
  if (kind === "supporter_annual") return process.env.STRIPE_CONNECT_ANNUAL_PRICE_ID || null;
  if (kind === "sponsor_direct_month" || kind === "sponsor_pool_month") {
    return process.env.STRIPE_CONNECT_SPONSOR_MONTH_PRICE_ID || null;
  }
  if (kind === "sponsor_direct_year" || kind === "sponsor_pool_year") {
    return process.env.STRIPE_CONNECT_SPONSOR_YEAR_PRICE_ID || null;
  }
  return null;
}

function sponsorLineItem(kind: "month" | "year", direct: boolean): { priceId: string } | { name: string; amountCents: number; recurringInterval: "month" | "year" } {
  const priceKind = direct
    ? kind === "year" ? "sponsor_direct_year" : "sponsor_direct_month"
    : kind === "year" ? "sponsor_pool_year" : "sponsor_pool_month";
  const priceId = priceIdFor(priceKind);
  if (priceId) return { priceId };
  return {
    name: kind === "year" ? "Sponsor one parent for one year" : "Sponsor one parent for one month",
    amountCents: kind === "year" ? 5000 : 600,
    recurringInterval: kind,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const kind = String(body.kind || "") as CheckoutKind;
    const validKinds: CheckoutKind[] = [
      "supporter_monthly",
      "supporter_annual",
      "sponsor_direct_month",
      "sponsor_direct_year",
      "sponsor_pool_month",
      "sponsor_pool_year",
      "sponsor_pool_custom",
    ];
    if (!validKinds.includes(kind)) {
      return Response.json({ error: "A valid checkout type is required." }, { status: 400 });
    }

    const metadata: Record<string, string> = { kind };
    let customerEmail: string | null = null;
    let clientReferenceId: string | null = null;
    let mode: "payment" | "subscription" = "payment";
    let lineItem: { priceId: string } | { name: string; amountCents: number; recurringInterval?: "month" | "year" };
    let successPath = "/connect/success";
    let cancelPath = "/connect";

    if (kind === "supporter_monthly" || kind === "supporter_annual") {
      const supabase = await createServerSupabaseClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user?.email) {
        return Response.json({ error: "Please sign in first." }, { status: 401 });
      }
      customerEmail = user.email.toLowerCase();
      const submitter = await findLatestSurveySubmitter(customerEmail);
      if (!submitter) {
        return Response.json({ error: "Connection Circles are limited to verified Stand With Meg submitters." }, { status: 403 });
      }
      const priceId = priceIdFor(kind);
      if (!priceId) return Response.json({ error: "Stripe supporter prices are not configured yet." }, { status: 503 });
      mode = "subscription";
      lineItem = { priceId };
      clientReferenceId = customerEmail;
      metadata.purpose = "connect_supporter";
      metadata.user_email = customerEmail;
      metadata.access_type = kind;
      const refToken = cleanSingleLine(body.ref_token, 80);
      if (refToken) metadata.ref_token = refToken;
    } else if (kind === "sponsor_direct_month" || kind === "sponsor_direct_year") {
      const token = cleanSingleLine(body.token, 80);
      if (!token) return Response.json({ error: "Sponsor token is required." }, { status: 400 });

      const admin = createAdminSupabaseClient();
      const { data: link, error } = await admin
        .from("connection_circle_sponsor_links")
        .select("id, token, requester_email, status, expires_at")
        .eq("token", token)
        .maybeSingle();
      if (error) {
        console.error("POST /api/connect/checkout sponsor lookup error:", error.message);
        return Response.json({ error: "Could not load sponsor link." }, { status: 500 });
      }
      if (!link || link.status !== "active" || new Date(link.expires_at) <= new Date()) {
        return Response.json({ error: "This sponsor link is no longer active." }, { status: 404 });
      }

      lineItem = sponsorLineItem(kind === "sponsor_direct_year" ? "year" : "month", true);
      mode = "subscription";
      customerEmail = isValidEmail(normalizeEmail(body.sponsor_email)) ? normalizeEmail(body.sponsor_email) : null;
      clientReferenceId = token;
      successPath = `/connect/success?kind=sponsor&token=${encodeURIComponent(token)}`;
      cancelPath = `/connect/sponsor/${encodeURIComponent(token)}`;
      metadata.purpose = "connect_sponsor_direct";
      metadata.sponsor_link_id = link.id;
      metadata.sponsor_token = token;
      metadata.requester_email = link.requester_email;
      metadata.access_type = kind === "sponsor_direct_month" ? "sponsored_month" : "sponsored_year";
      metadata.tag_permission = ["tag", "first_name", "anonymous"].includes(body.tag_permission) ? body.tag_permission : "anonymous";
      if (metadata.tag_permission === "first_name") {
        const name = cleanSingleLine(body.sponsor_name, 80);
        if (name) metadata.sponsor_name = name;
      }
      if (metadata.tag_permission === "tag") {
        const handle = cleanSingleLine(body.social_handle, 80);
        if (handle) metadata.social_handle = handle;
      }
    } else {
      const sponsorEmail = normalizeEmail(body.sponsor_email);
      customerEmail = isValidEmail(sponsorEmail) ? sponsorEmail : null;
      clientReferenceId = "connect-sponsor-pool";
      successPath = "/connect/success?kind=pool";
      cancelPath = "/connect/sponsor";
      metadata.purpose = "connect_sponsor_pool";
      metadata.access_type = "sponsor_pool";
      metadata.tag_permission = ["tag", "first_name", "anonymous"].includes(body.tag_permission) ? body.tag_permission : "anonymous";
      if (metadata.tag_permission === "first_name") {
        const name = cleanSingleLine(body.sponsor_name, 80);
        if (name) metadata.sponsor_name = name;
      }
      if (metadata.tag_permission === "tag") {
        const handle = cleanSingleLine(body.social_handle, 80);
        if (handle) metadata.social_handle = handle;
      }

      if (kind === "sponsor_pool_custom") {
        const dollars = Number(body.amount_dollars);
        const amountCents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
        if (amountCents < 100 || amountCents > 500000) {
          return Response.json({ error: "Custom sponsorship must be between $1 and $5,000." }, { status: 400 });
        }
        lineItem = { name: "Stand With Meg parent access sponsorship", amountCents };
      } else {
        lineItem = sponsorLineItem(kind === "sponsor_pool_year" ? "year" : "month", false);
        mode = "subscription";
      }
    }

    const session = await createStripeCheckoutSession({
      request,
      mode,
      lineItem,
      successPath,
      cancelPath,
      customerEmail,
      clientReferenceId,
      metadata,
    });

    return Response.json(session);
  } catch (err) {
    console.error("POST /api/connect/checkout error:", err);
    return Response.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
