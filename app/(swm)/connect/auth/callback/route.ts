import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "";

  // Sanitize redirect: only accept relative paths starting with "/" but not "//".
  // "//evil.com" would be treated as a protocol-relative URL by browsers.
  const safeNext = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/connect";

  if (code) {
    try {
      const supabase = await createServerSupabaseClient();
      await supabase.auth.exchangeCodeForSession(code);
    } catch (err) {
      console.error("Auth callback error:", err);
      // Redirect to connect page even on error - user can retry login
      return NextResponse.redirect(new URL("/connect?error=auth_failed", url.origin));
    }
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
