import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that require auth and which login page they use
const MCG_PROTECTED = ["/dashboard", "/vaults", "/workspace"];
const SWM_PROTECTED = ["/admin"];

function matchesAny(pathname: string, paths: string[]) {
  return paths.some(p => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isMcg = matchesAny(pathname, MCG_PROTECTED);
  const isSwm = matchesAny(pathname, SWM_PROTECTED);

  if (!isMcg && !isSwm) return NextResponse.next();

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Send to the right login page depending on which product the route belongs to
    const loginPath = isSwm ? "/swm-login" : "/login";
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*", "/vaults/:path*", "/workspace/:path*", "/workspace",
    "/admin/:path*", "/admin",
  ],
};
