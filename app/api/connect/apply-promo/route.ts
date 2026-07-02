import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { applyPromoCode } from "../../../../lib/promo-codes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) {
      return Response.json({ error: "Promo code is required." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const result = await applyPromoCode(admin, user.email, code);

    if (result.kind === "pending") {
      return Response.json({
        ok: true,
        pending: true,
        requestId: result.requestId,
        message: "Your promo request has been sent for approval. You'll get access once it's reviewed.",
      });
    }

    return Response.json({
      ok: true,
      accessId: result.accessId,
      expiresAt: result.expiresAt,
      alreadyActive: result.alreadyActive ?? false,
    });
  } catch (err) {
    console.error("POST /api/connect/apply-promo error:", err);
    const message = err instanceof Error ? err.message : "Could not apply promo code.";
    return Response.json({ error: message }, { status: 400 });
  }
}
