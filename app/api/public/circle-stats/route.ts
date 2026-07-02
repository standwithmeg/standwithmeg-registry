import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isoStartOfDay(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function isoWeeksAgo(weeks: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function labelForWeek(startIso: string): string {
  const d = new Date(startIso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function GET() {
  try {
    const admin = createAdminSupabaseClient();
    const nowIso = new Date().toISOString();
    const todayStart = isoStartOfDay();
    const weekAgo = isoWeeksAgo(1);
    const eightWeeksAgo = isoWeeksAgo(8);

    const [
      activeAccessResult,
      pseudonymsResult,
      totalMessagesResult,
      todayMessagesResult,
      weeklyAccessResult,
      topStatesResult,
    ] = await Promise.all([
      admin
        .from("connection_circle_access")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
      admin
        .from("connection_circle_pseudonyms")
        .select("*", { count: "exact", head: true }),
      admin
        .from("connection_circle_messages")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null),
      admin
        .from("connection_circle_messages")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", todayStart),
      admin
        .from("connection_circle_access")
        .select("granted_at")
        .gte("granted_at", eightWeeksAgo)
        .order("granted_at", { ascending: true }),
      admin
        .from("connection_circle_requests")
        .select("actor_state")
        .not("actor_state", "is", null),
    ]);

    for (const result of [activeAccessResult, pseudonymsResult, totalMessagesResult, todayMessagesResult, weeklyAccessResult, topStatesResult]) {
      const r = result as { error?: { code?: string; message?: string } | null };
      if (r.error && r.error.code !== "42P01" && r.error.code !== "PGRST205") {
        throw new Error(r.error.message);
      }
    }

    // Build 8-week growth buckets.
    const growth = [];
    for (let i = 0; i < 8; i++) {
      const start = new Date(eightWeeksAgo);
      start.setUTCDate(start.getUTCDate() + i * 7);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      const count = ((weeklyAccessResult.data ?? []) as { granted_at: string }[]).filter(
        r => r.granted_at >= start.toISOString() && r.granted_at < end.toISOString()
      ).length;
      growth.push({ label: labelForWeek(start.toISOString()), families: count });
    }

    // Top states by connection request activity.
    const stateCounts = new Map<string, number>();
    for (const row of (topStatesResult.data ?? []) as { actor_state: string }[]) {
      stateCounts.set(row.actor_state, (stateCounts.get(row.actor_state) ?? 0) + 1);
    }
    const topStates = Array.from(stateCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([state, count]) => ({ state, count }));

    return Response.json(
      {
        connected_families: activeAccessResult.count ?? 0,
        handles_created: pseudonymsResult.count ?? 0,
        total_messages: totalMessagesResult.count ?? 0,
        messages_today: todayMessagesResult.count ?? 0,
        new_signups_this_week: ((weeklyAccessResult.data ?? []) as { granted_at: string }[]).filter(
          r => r.granted_at >= weekAgo
        ).length,
        top_states: topStates,
        weekly_growth: growth,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("GET /api/public/circle-stats error:", err);
    return Response.json({
      connected_families: 0,
      handles_created: 0,
      total_messages: 0,
      messages_today: 0,
      new_signups_this_week: 0,
      top_states: [],
      weekly_growth: [],
    });
  }
}
