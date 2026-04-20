import { createClient } from "@supabase/supabase-js";

// Use service role key here — we're writing sensitive token data server-side
// and the callback has no user session cookie yet (Google redirected the browser here).
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const { searchParams } = new URL(request.url);

  const code = searchParams.get("code");
  const state = searchParams.get("state");   // user_id we passed in /api/auth/google
  const errorParam = searchParams.get("error");

  if (errorParam || !code || !state) {
    const reason = errorParam ?? "missing_code";
    return Response.redirect(`${appUrl}/vaults?google_error=${encodeURIComponent(reason)}`);
  }

  const redirectUri = `${appUrl}/api/auth/google/callback`;

  // Exchange authorization code for tokens
  let tokenData: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("Google token exchange failed:", body);
      return Response.redirect(`${appUrl}/vaults?google_error=token_exchange_failed`);
    }

    tokenData = await tokenRes.json();
  } catch (err) {
    console.error("Google token exchange error:", err);
    return Response.redirect(`${appUrl}/vaults?google_error=token_exchange_failed`);
  }

  if (!tokenData.refresh_token) {
    // This happens when the user had already granted consent before and
    // the OAuth flow didn't return a fresh refresh_token.
    // We used prompt=consent so this shouldn't happen — but guard anyway.
    console.error("Google OAuth: no refresh_token in response. Token data:", tokenData);
    return Response.redirect(`${appUrl}/vaults?google_error=no_refresh_token`);
  }

  // Fetch the user's Google email
  let googleEmail = "";
  try {
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      googleEmail = profile.email ?? "";
    }
  } catch {
    // Non-fatal — we can store without email
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  // Upsert into google_connections — one row per user, replace on reconnect
  const supabase = createServiceClient();
  const { error: upsertError } = await supabase
    .from("google_connections")
    .upsert(
      {
        user_id: state,
        google_email: googleEmail,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    console.error("google_connections upsert error:", upsertError.code, upsertError.message);
    return Response.redirect(`${appUrl}/vaults?google_error=db_error`);
  }

  return Response.redirect(`${appUrl}/vaults?google_connected=1`);
}
