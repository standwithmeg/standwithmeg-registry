import { createServerSupabaseClient } from "../../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../../lib/supabase-admin";
import { cleanSingleLine, isValidEmail, normalizeEmail } from "../../../../../../lib/connection-circles";
import { isAdminEmail } from "../../../../../../lib/require-auth";

async function requireAdminEmail() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email) ? user.email : null;
}

export async function POST(request: Request) {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) return Response.json({ error: "Not authorized." }, { status: 403 });

    const body = await request.json();
    const email = normalizeEmail(body.email);
    const reason = cleanSingleLine(body.reason, 500) || "Access revoked by admin.";
    if (!email || !isValidEmail(email)) {
      return Response.json({ error: "A valid email is required." }, { status: 400 });
    }

    const sb = createAdminSupabaseClient();
    const { data, error } = await sb
      .from("connection_circle_access")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: adminEmail,
        revoked_reason: reason,
      })
      .ilike("email", email)
      .eq("status", "active")
      .select("id");

    if (error) {
      console.error("POST /api/admin/connect/access/revoke error:", error.message);
      return Response.json({ error: "Could not revoke access." }, { status: 500 });
    }

    return Response.json({ revoked: data?.length ?? 0 });
  } catch (err) {
    console.error("POST /api/admin/connect/access/revoke error:", err);
    return Response.json({ error: "Could not revoke access." }, { status: 500 });
  }
}
