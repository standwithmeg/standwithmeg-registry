import { createServerSupabaseClient } from "../../../../lib/supabase";
import { findLatestSurveySubmitter, hasFullCircleAccess, listActiveAccess } from "../../../../lib/connection-circles";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return Response.json({ authenticated: false });
    }

    const email = user.email.toLowerCase();
    const submitter = await findLatestSurveySubmitter(email);
    const access = await listActiveAccess(email);
    const admin = createAdminSupabaseClient();
    const { data: hardshipRequest, error: hardshipError } = await admin
      .from("connection_circle_hardship_requests")
      .select("id, status, requested_at")
      .ilike("email", email)
      .eq("status", "pending")
      .maybeSingle();
    if (hardshipError && hardshipError.code !== "42P01" && hardshipError.code !== "PGRST205") {
      console.error("GET /api/connect/me hardship request lookup error:", hardshipError.message);
    }

    // Strip Stripe IDs before sending to the browser — clients have no need
    // for them and they could aid account-linkage attacks.
    const safeAccess = access.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ stripe_customer_id, stripe_session_id, stripe_subscription_id, ...rest }) => rest,
    );

    return Response.json({
      authenticated: true,
      email,
      first_name: submitter?.first_name ?? "",
      submitter: Boolean(submitter),
      access: safeAccess,
      has_full_access: hasFullCircleAccess(access),
      can_manage_billing: access.some(row => (
        (row.access_type === "supporter_monthly" || row.access_type === "supporter_annual") &&
        Boolean(row.stripe_customer_id && row.stripe_subscription_id)
      )),
      hardship_request: hardshipRequest ?? null,
      pricing: {
        monthly_cents: 600,
        annual_cents: 5000,
        hardship_days: 90,
      },
      stripe_ready: Boolean(
        process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_CONNECT_MONTHLY_PRICE_ID &&
        process.env.STRIPE_CONNECT_ANNUAL_PRICE_ID
      ),
    });
  } catch (err) {
    console.error("GET /api/connect/me error:", err);
    return Response.json({ error: "Could not load Connection Circles access." }, { status: 500 });
  }
}
