import { NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import reportIndex from "../../../../public/state-reports/index.json";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Counted downloads are logged server-side, then we redirect to the real
// static PDF in /public/state-reports. The table may not exist yet (migration
// 031) — logging is best-effort and never blocks the download (fail-open).

const VISITOR_COOKIE = "swm_vid";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

type ReportIndexEntry = {
  state: string;
  submissions: number;
  file: string;
  size_kb: number;
};

// Allowlist of valid report keys -> their static file path. Guards against
// open-redirect / path-traversal: only known states resolve to a file.
const REPORT_FILES: ReadonlyMap<string, string> = new Map(
  (reportIndex as ReportIndexEntry[]).map(entry => [entry.state, entry.file])
);

const BOT_UA_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|discord|preview|monitor|curl|wget|python-requests|headless|lighthouse|pingdom|uptime/i;

function logDownload(
  request: Request,
  state: string,
  visitorId: string
): void {
  // Read request-scoped values now (while the request is live), then do the
  // insert inside after() so it still completes once we return the redirect.
  // A plain fire-and-forget promise gets killed when the serverless function
  // freezes after responding — after() keeps the function alive for it.
  // A logging failure must never break a download (fail-open).
  const userAgent = request.headers.get("user-agent") ?? "";
  const referrer = request.headers.get("referer")?.slice(0, 500) ?? null;
  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    null;
  const isBot = BOT_UA_RE.test(userAgent);

  after(async () => {
    try {
      const supabase = createAdminSupabaseClient();
      const { error } = await supabase.from("pdf_downloads").insert({
        state,
        visitor_id: visitorId,
        is_bot: isBot,
        user_agent: userAgent.slice(0, 500) || null,
        referrer,
        country,
      });
      if (error) {
        console.error("pdf_downloads insert failed:", error.message);
      }
    } catch (err) {
      console.error("pdf_downloads logging skipped:", err);
    }
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ state: string }> }
) {
  const { state: rawState } = await params;
  const state = (rawState ?? "").toUpperCase();

  // Resolve against the allowlist. index.json keys are uppercase for US states
  // ("CA") and capitalized for countries ("Canada") — match either casing.
  const file =
    REPORT_FILES.get(state) ??
    REPORT_FILES.get(rawState) ??
    null;

  if (!file) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const existingVisitor = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)swm_vid=([0-9a-f-]{36})/i)?.[1];
  const visitorId = existingVisitor ?? randomUUID();

  logDownload(request, REPORT_FILES.has(state) ? state : rawState, visitorId);

  const response = NextResponse.redirect(new URL(file, request.url), {
    status: 302,
  });
  // Don't let a CDN cache the redirect — every click must reach this handler.
  response.headers.set("Cache-Control", "no-store, max-age=0");
  if (!existingVisitor) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: VISITOR_COOKIE_MAX_AGE,
    });
  }
  return response;
}
