import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createAdminSupabaseClient } from "./supabase-admin";

export const CONNECT_MONTHLY_PRICE_CENTS = 600;
export const CONNECT_ANNUAL_PRICE_CENTS = 5000;
export const CONNECT_HARDSHIP_DAYS = 30;

export type ConnectAccessType =
  | "supporter_monthly"
  | "supporter_annual"
  | "hardship"
  | "sponsored_month"
  | "sponsored_year"
  | "sponsor_pool";

export type ConnectAccessRow = {
  id: string;
  email: string;
  access_type: ConnectAccessType;
  status: "active" | "expired" | "revoked";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_session_id: string | null;
  sponsor_link_id: string | null;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
};

export type StripeCheckoutPurpose =
  | "connect_supporter"
  | "connect_sponsor_direct"
  | "connect_sponsor_pool";

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function cleanSingleLine(value: unknown, maxLength: number): string {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function cleanMultiline(value: unknown, maxLength: number): string {
  return String(value || "").trim().replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").slice(0, maxLength);
}

export function addDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function appOrigin(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(request.url).origin ||
    "https://my.standwithmeg.com"
  ).replace(/\/+$/, "");
}

export type SurveySubmitterDetails = {
  id: string;
  first_name: string | null;
  state_code: string | null;
  court_actor_count: number;
  created_at: string;
};

export async function findLatestSurveySubmitter(email: string): Promise<{ id: string; first_name: string | null } | null> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("survey_submissions")
    .select("id, first_name")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`survey_submissions lookup failed: ${error.message}`);
  }
  return data?.[0] ?? null;
}

export async function findLatestSurveySubmitterWithDetails(
  email: string,
): Promise<SurveySubmitterDetails | null> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("survey_submissions")
    .select("id, first_name, state_of_occurrence, outside_us_country, created_at")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`survey_submissions lookup failed: ${error.message}`);
  }
  const row = data?.[0];
  if (!row) return null;

  const stateCode =
    String(row.state_of_occurrence || "").trim().toUpperCase() ||
    String(row.outside_us_country || "").trim() ||
    null;

  const { count, error: countError } = await sb
    .from("court_actors")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", row.id);

  if (countError) {
    console.error("court_actors count error:", countError.message);
  }

  return {
    id: row.id,
    first_name: row.first_name as string | null,
    state_code: stateCode,
    court_actor_count: count ?? 0,
    created_at: row.created_at as string,
  };
}

export async function listActiveAccess(email: string): Promise<ConnectAccessRow[]> {
  const sb = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("connection_circle_access")
    .select("id, email, access_type, status, stripe_customer_id, stripe_subscription_id, stripe_session_id, sponsor_link_id, granted_at, expires_at, revoked_at, revoked_reason")
    .ilike("email", email)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("granted_at", { ascending: false });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(`connection_circle_access select failed: ${error.message}`);
  }
  return (data ?? []) as ConnectAccessRow[];
}

export function hasFullCircleAccess(access: ConnectAccessRow[]): boolean {
  return access.some(row => row.status === "active" && (!row.expires_at || new Date(row.expires_at) > new Date()));
}

export function sponsorToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createStripeCheckoutSession(args: {
  request: Request;
  mode: "payment" | "subscription";
  lineItem: { priceId: string } | { name: string; amountCents: number; recurringInterval?: "month" | "year" };
  successPath: string;
  cancelPath: string;
  customerEmail?: string | null;
  clientReferenceId?: string | null;
  metadata: Record<string, string>;
}): Promise<{ url: string }> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  const origin = appOrigin(args.request);
  const form = new URLSearchParams();
  form.set("mode", args.mode);
  form.set("success_url", `${origin}${args.successPath}`);
  form.set("cancel_url", `${origin}${args.cancelPath}`);
  if (args.customerEmail) form.set("customer_email", args.customerEmail);
  if (args.clientReferenceId) form.set("client_reference_id", args.clientReferenceId);
  form.set("line_items[0][quantity]", "1");
  if ("priceId" in args.lineItem) {
    form.set("line_items[0][price]", args.lineItem.priceId);
  } else {
    form.set("line_items[0][price_data][currency]", "usd");
    form.set("line_items[0][price_data][unit_amount]", String(args.lineItem.amountCents));
    form.set("line_items[0][price_data][product_data][name]", args.lineItem.name);
    if (args.mode === "subscription") {
      const interval = args.lineItem.recurringInterval;
      if (!interval) throw new Error("Recurring checkout requires a recurring interval.");
      form.set("line_items[0][price_data][recurring][interval]", interval);
    }
  }
  for (const [key, value] of Object.entries(args.metadata)) {
    form.set(`metadata[${key}]`, value);
    if (args.mode === "subscription") {
      form.set(`subscription_data[metadata][${key}]`, value);
    }
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2026-02-25.clover",
    },
    body: form,
  });
  const data = await res.json().catch(() => null) as { url?: string; error?: { message?: string } } | null;
  if (!res.ok || !data?.url) {
    throw new Error(data?.error?.message || "Stripe Checkout session could not be created.");
  }
  return { url: data.url };
}

export function verifyStripeSignature(body: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = new Map(header.split(",").map(part => {
    const [k, v] = part.split("=", 2);
    return [k, v] as const;
  }));
  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return false;
  // Reject events older than 5 minutes to prevent replay attacks.
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parseInt(timestamp, 10)) > 300) return false;
  const hmac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const a = Buffer.from(hmac, "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
