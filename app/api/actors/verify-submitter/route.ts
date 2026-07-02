import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { rateLimit, rateLimitPresets } from "../../../../lib/rate-limit";

/**
 * Gate endpoint for /actors. Takes an email, checks survey_submissions for a
 * matching record. Returns the most recent matching submission_id so the
 * client can deep-link into the court-actor-update flow if they recognize a
 * named actor.
 *
 * Response:
 *   { matched: true, submission_id: string, first_name: string }
 *   { matched: false }
 *
 * Privacy: only returns the submission_id for the requesting email — no
 * cross-email lookup is possible.
 */
export async function POST(request: Request) {
  const limit = rateLimit(request, rateLimitPresets.email);
  if (limit) return limit;

  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }

    const sb = createAdminSupabaseClient();
    const { data, error } = await sb
      .from("survey_submissions")
      .select("id, first_name")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("POST /api/actors/verify-submitter error:", error.message);
      return Response.json({ error: "Verification failed. Please try again." }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return Response.json({ matched: false });
    }

    return Response.json({
      matched: true,
      submission_id: data[0].id,
      first_name: data[0].first_name || "",
    });
  } catch (err) {
    console.error("POST /api/actors/verify-submitter error:", err);
    return Response.json({ error: "Verification failed." }, { status: 500 });
  }
}
