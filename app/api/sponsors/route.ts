import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../lib/supabase-admin";

export const runtime = "nodejs";

// Public-safe columns only — never expose price_cents, notes, billing_period.
const PUBLIC_FIELDS =
  "id,business_name,website_url,phone,services,tagline,location_label,brand_color,logo_url,slot,tier,sort_order";

type Placement = "state_page" | "main_page" | "pdf" | "court_actor_spotlight";

// Which slot types appear on each surface.
const SLOTS_BY_PLACEMENT: Record<Placement, string[]> = {
  main_page: ["presenting", "co_sponsor", "movement_partner"],
  state_page: ["state_exclusive", "community_supporter"],
  pdf: ["state_exclusive"],
  court_actor_spotlight: ["court_actor_spotlight"],
};

function parsePlacement(value: string | null): Placement {
  if (value === "main_page" || value === "pdf" || value === "court_actor_spotlight") return value;
  return "state_page";
}

/**
 * GET /api/sponsors?state=WA&placement=state_page
 * Returns ONLY approved sponsors for a surface, edge-cached 5 min, fail-open.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawState = (url.searchParams.get("state") ?? "").trim();
  // Canada keeps its full name; US states are 2-letter codes.
  const state = rawState.toLowerCase() === "canada" ? "Canada" : rawState.toUpperCase().slice(0, 2) || null;
  const placement = parsePlacement(url.searchParams.get("placement"));

  const headers = {
    "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
  };

  try {
    const supabase = createAdminSupabaseClient();
    let query = supabase
      .from("sponsors")
      .select(PUBLIC_FIELDS)
      .eq("status", "active")
      .eq("approved", true)
      .in("slot", SLOTS_BY_PLACEMENT[placement])
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    // State surfaces are scoped to one state; the national page is not.
    if (placement !== "main_page" && state) {
      query = query.eq("state", state);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ sponsors: [] }, { headers });
    }
    return NextResponse.json({ sponsors: data ?? [] }, { headers });
  } catch {
    return NextResponse.json({ sponsors: [] }, { headers });
  }
}
