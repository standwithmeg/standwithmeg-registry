import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { cleanSingleLine } from "../../../../lib/connection-circles";
import { listPromoRequests, approvePromoRequest, denyPromoRequest } from "../../../../lib/promo-codes";
import { isAdminEmail } from "../../../../lib/require-auth";

async function requireAdminEmail() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email) ? user.email.toLowerCase() : null;
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) return Response.json({ error: "Not authorized." }, { status: 403 });

    const sb = createAdminSupabaseClient();
    const requests = await listPromoRequests(sb);
    return Response.json({ requests });
  } catch (err) {
    console.error("GET /api/admin/promo-requests error:", err);
    return Response.json({ error: "Could not load promo requests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) return Response.json({ error: "Not authorized." }, { status: 403 });

    const body = await request.json();
    const id = cleanSingleLine(body.id, 80);
    const action = cleanSingleLine(body.action, 20);
    if (!id || !["approve", "deny"].includes(action)) {
      return Response.json({ error: "A request id and valid action are required." }, { status: 400 });
    }

    const sb = createAdminSupabaseClient();
    if (action === "approve") {
      const { request, access } = await approvePromoRequest(sb, id, adminEmail);
      return Response.json({ request, access });
    }

    const denied = await denyPromoRequest(sb, id, adminEmail);
    return Response.json({ request: denied });
  } catch (err) {
    console.error("POST /api/admin/promo-requests error:", err);
    const message = err instanceof Error ? err.message : "Could not update promo request.";
    return Response.json({ error: message }, { status: 500 });
  }
}
