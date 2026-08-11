import { createAdminSupabaseClient } from "./supabase-admin";
import { normalizeKitEmail, REPORT_KIT_PRICE_CENTS } from "./report-kit-constants";

export { normalizeKitEmail, REPORT_KIT_PRICE_CENTS };

export async function hasReportKitAccess(email: string): Promise<boolean> {
  const normalizedEmail = normalizeKitEmail(email);
  if (!normalizedEmail) return false;
  try {
    const sb = createAdminSupabaseClient();
    const { data, error } = await sb
      .from("report_kit_access")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("report_kit_access lookup failed:", error.message);
      return false;
    }
    return Boolean(data);
  } catch (error) {
    // Missing service-role env must not crash the Report Kit page for guests.
    console.error("report_kit_access lookup failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

export async function grantReportKitAccess(args: {
  email: string;
  stripeSessionId: string;
  stripeCustomerId?: string | null;
}): Promise<void> {
  const email = normalizeKitEmail(args.email);
  if (!email) throw new Error("A valid Report Kit email is required.");
  const sb = createAdminSupabaseClient();
  const { error } = await sb.from("report_kit_access").insert({
    email,
    status: "active",
    stripe_session_id: args.stripeSessionId,
    stripe_customer_id: args.stripeCustomerId ?? null,
  });
  if (error && error.code !== "23505") {
    throw new Error(`report_kit_access insert failed: ${error.message}`);
  }
}

export async function grantManualReportKitAccess(emailValue: unknown): Promise<string> {
  const email = normalizeKitEmail(emailValue);
  if (!email) throw new Error("A valid Report Kit email is required.");

  const sb = createAdminSupabaseClient();
  const { data: existing, error: lookupError } = await sb
    .from("report_kit_access")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  if (lookupError) throw new Error(`report_kit_access lookup failed: ${lookupError.message}`);

  const query = existing
    ? sb
        .from("report_kit_access")
        .update({ email, status: "active", granted_at: new Date().toISOString(), revoked_at: null })
        .eq("id", existing.id)
    : sb
        .from("report_kit_access")
        .insert({ email, status: "active", stripe_session_id: null, stripe_customer_id: null });

  const { error } = await query;
  if (error) throw new Error(`report_kit_access grant failed: ${error.message}`);
  return email;
}
