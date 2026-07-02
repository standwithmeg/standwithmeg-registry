import { createAdminSupabaseClient } from "./supabase-admin";
import { REPORT_KIT_PRICE_CENTS } from "./report-kit-constants";

export { REPORT_KIT_PRICE_CENTS };

export function normalizeKitEmail(value: unknown): string | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) return null;
  return raw.slice(0, 200);
}

export async function hasReportKitAccess(email: string): Promise<boolean> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("report_kit_access")
    .select("id")
    .eq("email", email)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("report_kit_access lookup failed:", error.message);
    return false;
  }
  return Boolean(data);
}

export async function grantReportKitAccess(args: {
  email: string;
  stripeSessionId: string;
  stripeCustomerId?: string | null;
}): Promise<void> {
  const sb = createAdminSupabaseClient();
  const { error } = await sb.from("report_kit_access").insert({
    email: args.email,
    status: "active",
    stripe_session_id: args.stripeSessionId,
    stripe_customer_id: args.stripeCustomerId ?? null,
  });
  if (error && error.code !== "23505") {
    throw new Error(`report_kit_access insert failed: ${error.message}`);
  }
}