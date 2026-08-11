import { hasReportKitAccess } from "../../../../lib/report-kit";
import { rateLimit, rateLimitPresets } from "../../../../lib/rate-limit";
import { isAdminOrFounderEmail } from "../../../../lib/require-auth";
import { corsJsonResponse, handleCorsPreflight } from "../../../../lib/shawn-lee-cors";
import { createServerSupabaseClient } from "../../../../lib/supabase";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return handleCorsPreflight(request) ?? corsJsonResponse(request, { ok: true });
}

export async function POST(request: Request) {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const limit = rateLimit(request, rateLimitPresets.public);
  if (limit) return limit;

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  const email = user?.email?.trim().toLowerCase() || "";
  if (error || !email) {
    return corsJsonResponse(request, { error: "Sign in to check Report Kit access." }, 401);
  }

  const hasAccess = isAdminOrFounderEmail(email) || await hasReportKitAccess(email);
  return corsJsonResponse(request, { hasAccess });
}
