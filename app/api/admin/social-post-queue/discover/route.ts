import { requireFounderApi } from "../../../../../lib/social-post/admin-auth";
import { discoverSocialPostCandidates } from "../../../../../lib/social-post/discover";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    await requireFounderApi();
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") === "full" ? "full" : "lite";
    const refresh = searchParams.get("refresh") === "1";
    const result = await discoverSocialPostCandidates({ mode, refresh });
    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Founder access required.") {
      return Response.json({ error: message }, { status: 403 });
    }
    console.error("GET social-post-queue/discover error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}