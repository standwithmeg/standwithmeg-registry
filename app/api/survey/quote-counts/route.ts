import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { normalizeOutsideCountryForReporting } from "../../../../lib/survey-location";
import { withSupabaseReadTimeout } from "../../../../lib/supabase-timeout";
import { PUBLIC_REPORT_CACHE_HEADERS, PUBLIC_REPORT_FALLBACK_CACHE_HEADERS } from "../../../../lib/public-cache";

/**
 * Returns the number of approved, publicly shareable quotes per state.
 * Used by the public dashboard to show a "Comments" column.
 *
 * Response: { counts: { [stateCode: string]: number } }
 *
 * The per-state count is computed in Postgres via the quote_counts_by_state
 * view (migration 037) — one cheap grouped query instead of paginating every
 * approved row into Node. Country normalization runs in-route on the small
 * grouped result. CDN headers + static fallback behavior are unchanged.
 */
export async function GET() {
  try {
    const adminSupabase = createAdminSupabaseClient();

    const { data, error } = await withSupabaseReadTimeout(
      adminSupabase
        .from("quote_counts_by_state")
        .select("state_of_occurrence, outside_us_country, n"),
      "public survey quote counts",
    );

    if (error) {
      console.error("GET /api/survey/quote-counts error:", error);
      return Response.json(
        { counts: {} },
        { headers: PUBLIC_REPORT_FALLBACK_CACHE_HEADERS },
      );
    }

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const key = row.state_of_occurrence ?? normalizeOutsideCountryForReporting(row.outside_us_country);
      if (!key) continue;
      counts[key] = (counts[key] ?? 0) + Number(row.n ?? 0);
    }

    return Response.json(
      { counts },
      { headers: PUBLIC_REPORT_CACHE_HEADERS },
    );
  } catch (err) {
    console.error("GET /api/survey/quote-counts error:", err);
    return Response.json(
      { counts: {} },
      { headers: PUBLIC_REPORT_FALLBACK_CACHE_HEADERS },
    );
  }
}
