import { grantManualReportKitAccess } from "../../../../lib/report-kit";
import { rateLimit, rateLimitPresets } from "../../../../lib/rate-limit";
import { requireFounderApi } from "../../../../lib/social-post/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = rateLimit(request, rateLimitPresets.contact);
  if (limit) return limit;

  try {
    await requireFounderApi();
  } catch {
    return Response.json({ error: "Founder access required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  try {
    const email = await grantManualReportKitAccess(body.email);
    return Response.json({ ok: true, email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not grant tester access.";
    if (message.startsWith("A valid")) {
      return Response.json({ error: message }, { status: 400 });
    }
    console.error("manual Report Kit access grant failed:", message);
    return Response.json({ error: "Could not grant tester access." }, { status: 500 });
  }
}
