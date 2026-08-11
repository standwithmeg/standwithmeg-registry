import { NextResponse } from "next/server";
import { safeInternalNextPath } from "../../../../../lib/safe-next-path";
import { createServerSupabaseClient } from "../../../../../lib/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const authError = url.searchParams.get("error") || url.searchParams.get("error_code");
  const safeNext = safeInternalNextPath(url.searchParams.get("next"), "/connect");

  // Supabase sometimes bounces failed OTP to Site URL with error params.
  if (authError && !code) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", "magic_link_failed");
    login.searchParams.set("next", safeNext);
    return NextResponse.redirect(login);
  }

  if (code) {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } catch (err) {
      console.error("Auth callback error:", err);
      const login = new URL("/login", url.origin);
      login.searchParams.set("error", "auth_failed");
      login.searchParams.set("next", safeNext);
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
