import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { isFounderEmail } from "../../../../lib/require-auth";
import { getAuthenticatedGmailEmail, getTokensFromCode, saveTokens, targetGmailMailboxEmail } from "../../../../lib/gmail";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return new Response(`Gmail auth error: ${error}`, { status: 400 });
  }
  if (!code) {
    return new Response("Missing authorization code.", { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const founderEmail = state || user?.email;
  if (!founderEmail || !isFounderEmail(founderEmail)) {
    return new Response("Founder access required.", { status: 401 });
  }

  try {
    const tokens = await getTokensFromCode(code);
    if (!tokens.refresh_token) {
      return new Response(
        "No refresh token received. Make sure you selected 'consent' prompt and approved access. Try revoking access at https://myaccount.google.com/permissions and reconnect.",
        { status: 400 },
      );
    }
    const admin = createAdminSupabaseClient();
    const connectedEmail = await getAuthenticatedGmailEmail(tokens);
    const targetEmail = targetGmailMailboxEmail(founderEmail);
    const tokenEmail = connectedEmail || targetEmail || founderEmail;
    await saveTokens(admin, tokenEmail, tokens);
    if (targetEmail && targetEmail.toLowerCase() !== tokenEmail.toLowerCase()) {
      await saveTokens(admin, targetEmail, tokens);
    }
    return new Response(`Gmail connected successfully for ${targetEmail || tokenEmail}. You can close this tab and return to the admin dashboard.`, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (err) {
    console.error("GET /api/gmail/callback error:", err);
    const message = err instanceof Error ? err.message : "Could not complete Gmail auth.";
    return new Response(message, { status: 500 });
  }
}
