import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { isFounderEmail } from "../../../../lib/require-auth";
import { getGmailCredentialDiagnostics, loadStoredTokens, targetGmailMailboxEmail } from "../../../../lib/gmail";

export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !isFounderEmail(user.email)) {
    return Response.json({ error: "Founder access required." }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const targetEmail = targetGmailMailboxEmail(user.email);
  const stored = targetEmail ? await loadStoredTokens(admin, targetEmail) : null;
  const diagnostics = getGmailCredentialDiagnostics();

  return Response.json({
    configured: diagnostics,
    target_email: targetEmail || null,
    tokens: {
      present: !!stored,
      hasRefreshToken: !!stored?.refresh_token,
      expiry: stored?.expiry_date ?? null,
      email: stored?.email ?? null,
    },
  });
}
