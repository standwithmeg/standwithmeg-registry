import { createStripeCheckoutSession } from "../../../../lib/connection-circles";
import { REPORT_KIT_PRICE_CENTS, normalizeKitEmail } from "../../../../lib/report-kit";
import { rateLimit, rateLimitPresets } from "../../../../lib/rate-limit";
import { corsJsonResponse, handleCorsPreflight } from "../../../../lib/shawn-lee-cors";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return handleCorsPreflight(request) ?? corsJsonResponse(request, { ok: true });
}

export async function POST(request: Request) {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const limit = rateLimit(request, rateLimitPresets.contact);
  if (limit) return limit;

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return corsJsonResponse(request, { error: "Invalid request." }, 400);
  }

  const email = normalizeKitEmail(body.email);
  if (!email) {
    return corsJsonResponse(request, { error: "A valid email is required for checkout." }, 400);
  }

  try {
    const priceId = process.env.STRIPE_REPORT_KIT_PRICE_ID?.trim();
    const lineItem = priceId
      ? { priceId }
      : {
          name: "The Report Kit — Fraud Documentation Course",
          amountCents: REPORT_KIT_PRICE_CENTS,
        };

    const session = await createStripeCheckoutSession({
      request,
      mode: "payment",
      lineItem,
      successPath: `/tools/fraud-kit/success?email=${encodeURIComponent(email)}`,
      cancelPath: "/tools/fraud-kit",
      customerEmail: email,
      clientReferenceId: email,
      metadata: {
        purpose: "report_kit",
        user_email: email,
      },
    });

    return corsJsonResponse(request, session);
  } catch (err) {
    console.error("report-kit checkout error:", err);
    return corsJsonResponse(request, { error: "Could not start checkout. Please try again." }, 503);
  }
}