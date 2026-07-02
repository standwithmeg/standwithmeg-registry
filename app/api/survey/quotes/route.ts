import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { withSupabaseReadTimeout } from "../../../../lib/supabase-timeout";
import { PUBLIC_REPORT_CACHE_HEADERS, PUBLIC_REPORT_FALLBACK_CACHE_HEADERS } from "../../../../lib/public-cache";

// Permission values that allow public display (short enum values from the submit form)
const PUBLIC_PERMISSIONS = ["public", "anonymous", "first_name"];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state");
    const isUs = searchParams.get("is_us") === "true";

    const adminSupabase = createAdminSupabaseClient();

    let query = adminSupabase
      .from("survey_submissions")
      .select("id, first_name, permission_to_share, impact_quote, created_at, case_county, state_of_occurrence, outside_us_country")
      .eq("approved", true)
      .in("permission_to_share", PUBLIC_PERMISSIONS)
      .not("impact_quote", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    // Optionally filter by state
    if (state) {
      query = query.eq(isUs ? "state_of_occurrence" : "outside_us_country", state);
    }

    const { data, error } = await withSupabaseReadTimeout(query, "public survey quotes");

    if (error) {
      console.error("GET /api/survey/quotes error:", error);
      return Response.json(
        {
          quotes: [],
          data_only_count: 0,
        },
        { headers: PUBLIC_REPORT_FALLBACK_CACHE_HEADERS },
      );
    }

    // Strip last names and emails — only return safe public data
    const quotes = (data ?? []).map(q => {
      let attribution = "Anonymous";
      if (q.permission_to_share === "public" && q.first_name) {
        attribution = q.first_name;
      } else if (q.permission_to_share === "first_name" && q.first_name) {
        attribution = q.first_name[0] + ".";
      }

      return {
        id: q.id,
        quote: q.impact_quote,
        attribution,
        state: q.state_of_occurrence ?? q.outside_us_country,
        county: q.case_county,
        created_at: q.created_at,
      };
    });

    // Optionally include count of data-only submissions for the state
    const includeCounts = searchParams.get("include_counts") === "true";
    let data_only_count = 0;
    if (includeCounts && state) {
      const { count } = await withSupabaseReadTimeout(
        adminSupabase
          .from("survey_submissions")
          .select("id", { count: "exact", head: true })
          .eq("permission_to_share", "data_only")
          .eq(isUs ? "state_of_occurrence" : "outside_us_country", state),
        "public survey data-only count",
      );
      data_only_count = count ?? 0;
    }

    return Response.json(
      { quotes, data_only_count },
      { headers: PUBLIC_REPORT_CACHE_HEADERS },
    );
  } catch (err) {
    console.error("GET /api/survey/quotes error:", err);
    return Response.json(
      {
        quotes: [],
        data_only_count: 0,
      },
      { headers: PUBLIC_REPORT_FALLBACK_CACHE_HEADERS },
    );
  }
}
