import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { normalizeOutsideCountryForReporting } from "../../../../lib/survey-location";

const PUBLIC_PERMISSIONS = ["public", "anonymous", "first_name"];

/**
 * Returns the number of approved, publicly shareable quotes per state.
 * Used by the public dashboard to show a "Comments" column.
 *
 * Response: { counts: { [stateCode: string]: number } }
 */
export async function GET() {
  try {
    const adminSupabase = createAdminSupabaseClient();

    // Paginate through all approved public-shareable rows (Supabase caps at 1000 per request)
    const counts: Record<string, number> = {};
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await adminSupabase
        .from("survey_submissions")
        .select("state_of_occurrence, outside_us_country")
        .eq("approved", true)
        .in("permission_to_share", PUBLIC_PERMISSIONS)
        .not("impact_quote", "is", null)
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("GET /api/survey/quote-counts error:", error);
        return Response.json({ counts: {} });
      }

      if (!data || data.length === 0) break;

      for (const row of data) {
        const key = row.state_of_occurrence ?? normalizeOutsideCountryForReporting(row.outside_us_country);
        if (!key) continue;
        counts[key] = (counts[key] ?? 0) + 1;
      }

      if (data.length < pageSize) break;
      from += pageSize;
    }

    return Response.json({ counts });
  } catch (err) {
    console.error("GET /api/survey/quote-counts error:", err);
    return Response.json({ counts: {} });
  }
}
