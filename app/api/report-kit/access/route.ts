import { hasReportKitAccess, normalizeKitEmail } from "../../../../lib/report-kit";
import { rateLimit, rateLimitPresets } from "../../../../lib/rate-limit";
import { corsJsonResponse, handleCorsPreflight } from "../../../../lib/shawn-lee-cors";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return handleCorsPreflight(request) ?? corsJsonResponse(request, { ok: true });
}

export async function POST(request: Request) {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const limit = rateLimit(request, rateLimitPresets.public);
  if (limit) return limit;

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return corsJsonResponse(request, { error: "Invalid request." }, 400);
  }

  const email = normalizeKitEmail(body.email);
  if (!email) {
    return corsJsonResponse(request, { error: "Valid email required." }, 400);
  }

  const hasAccess = await hasReportKitAccess(email);
  return corsJsonResponse(request, { hasAccess, email });
}