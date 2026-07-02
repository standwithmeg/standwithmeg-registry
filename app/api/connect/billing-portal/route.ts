import { createServerSupabaseClient } from "../../../../lib/supabase";
import { appOrigin, listActiveAccess } from "../../../../lib/connection-circles";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return Response.json({ error: "Please sign in first." }, { status: 401 });
    }

    const access = await listActiveAccess(user.email.toLowerCase());
    const billable = access.find(row => (
      (row.access_type === "supporter_monthly" || row.access_type === "supporter_annual") &&
      row.stripe_customer_id &&
      row.stripe_subscription_id
    ));
    if (!billable?.stripe_customer_id) {
      return Response.json({ error: "No active Stripe subscription was found for this account." }, { status: 404 });
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return Response.json({ error: "Stripe billing is not configured yet." }, { status: 503 });
    }

    const form = new URLSearchParams();
    form.set("customer", billable.stripe_customer_id);
    form.set("return_url", `${appOrigin(request)}/connect/account`);

    const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
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
      return Response.json({ error: data?.error?.message || "Could not open Stripe billing management." }, { status: 500 });
    }

    return Response.json({ url: data.url });
  } catch (err) {
    console.error("POST /api/connect/billing-portal error:", err);
    return Response.json({ error: "Could not open billing management." }, { status: 500 });
  }
}
