import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { refreshPublicActorCache } from "../../survey/court-actors/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sb = createAdminSupabaseClient();
  const startedAt = Date.now();

  try {
    const actors = await refreshPublicActorCache(sb, { readTimeoutMs: 55_000 });

    return Response.json({
      ok: true,
      actors: actors.length,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("CRON refresh-public-actor-cache failed:", err);
    return Response.json(
      { error: "Refresh failed.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
