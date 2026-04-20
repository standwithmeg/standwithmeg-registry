import { createServerSupabaseClient } from "../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../lib/supabase-admin";
import { createHash } from "crypto";

// Public submissions come in anonymously from untrusted visitors, but the
// server has already validated every field above. Use the admin client to
// insert so the write isn't blocked by RLS on survey_submissions.

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY",
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // ── Location: exactly one of state or country ──────────────────
    const outsideUS = body.outside_us === true || body.outside_us === "true";
    let state_of_occurrence: string | null = null;
    let outside_us_country: string | null = null;

    if (outsideUS) {
      const country = String(body.outside_us_country || "").trim();
      if (!country) {
        return Response.json({ error: "Country is required for international submissions." }, { status: 400 });
      }
      outside_us_country = country;
    } else {
      const state = String(body.state_of_occurrence || "").toUpperCase().trim();
      if (!VALID_STATES.has(state)) {
        return Response.json({ error: "A valid US state is required." }, { status: 400 });
      }
      state_of_occurrence = state;
    }

    // ── Required fields ────────────────────────────────────────────
    const case_county = String(body.case_county || "").trim();
    if (!case_county) return Response.json({ error: "County is required." }, { status: 400 });

    const case_status = String(body.case_status || "").trim();
    if (!case_status) return Response.json({ error: "Case status is required." }, { status: 400 });

    const number_of_kids_raw = body.number_of_kids === null || body.number_of_kids === undefined || body.number_of_kids === ""
      ? null
      : parseInt(String(body.number_of_kids), 10);
    if (number_of_kids_raw === null || isNaN(number_of_kids_raw) || number_of_kids_raw < 0 || number_of_kids_raw > 20) {
      return Response.json({ error: "Number of children is required and must be between 0 and 20." }, { status: 400 });
    }
    const number_of_kids = number_of_kids_raw;

    const system_affected = String(body.system_affected || "").trim();
    if (!system_affected) return Response.json({ error: "System affected is required." }, { status: 400 });

    const time_in_system = String(body.time_in_system || "").trim();
    if (!time_in_system) return Response.json({ error: "Time in system is required." }, { status: 400 });

    const custody_status = String(body.custody_status || "").trim();
    if (!custody_status) return Response.json({ error: "Custody status is required." }, { status: 400 });

    const is_pro_se: boolean =
      body.is_pro_se === true || body.is_pro_se === "true" || body.is_pro_se === "yes";

    const legal_rep_history = String(body.legal_rep_history || "").trim();
    if (!legal_rep_history) return Response.json({ error: "Legal representation history is required." }, { status: 400 });

    // ── Allegation fields ──────────────────────────────────────────
    const allegation_type = String(body.allegation_type || "").trim();
    if (!allegation_type) return Response.json({ error: "Allegation type is required." }, { status: 400 });

    const allegation_other_detail =
      allegation_type === "Other" ? String(body.allegation_other_detail || "").trim() || null : null;
    const allegation_root_cause = String(body.allegation_root_cause || "").trim() || null;

    const due_process_checklist: string[] = Array.isArray(body.due_process_checklist)
      ? body.due_process_checklist.map(String)
      : [];
    if (due_process_checklist.length === 0) {
      return Response.json({ error: "Due Process & Fraud Checklist requires at least one selection." }, { status: 400 });
    }

    const other_allegation_details = String(body.other_allegation_details || "").trim() || null;

    // ── Conflict of interest awareness ────────────────────────────
    const VALID_AWARENESS = new Set(["Yes", "No", "Unsure"]);
    const conflict_of_interest_awareness = String(body.conflict_of_interest_awareness || "").trim();
    if (!VALID_AWARENESS.has(conflict_of_interest_awareness)) {
      return Response.json({ error: "Conflict of interest awareness is required." }, { status: 400 });
    }

    const conflict_description =
      conflict_of_interest_awareness === "Yes"
        ? String(body.conflict_description || "").trim() || null
        : null;

    // ── Federal funding influence ──────────────────────────────────
    // Accepted but no longer required on the form. Stored for backward
    // compatibility with historical data. Defaults to "Unsure" if not sent.
    const federal_funding_raw = String(body.federal_funding_influence || "").trim();
    const federal_funding_influence = VALID_AWARENESS.has(federal_funding_raw) ? federal_funding_raw : "Unsure";

    // ── Contact fields ─────────────────────────────────────────────
    const last_name = String(body.last_name || "").trim();
    if (!last_name) return Response.json({ error: "Last name is required." }, { status: 400 });

    const email = String(body.email || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }

    // ── Stolen time ────────────────────────────────────────────────
    const months_lost_raw = parseInt(String(body.months_lost_parenting_time ?? ""), 10);
    const months_lost_parenting_time = !isNaN(months_lost_raw) && months_lost_raw >= 0 ? months_lost_raw : null;
    const lost_milestones_description = String(body.lost_milestones_description || "").trim() || null;

    // ── Financials ─────────────────────────────────────────────────
    function safeNumeric(v: unknown): number | null {
      if (v === null || v === undefined || v === "") return null;
      const n = parseFloat(String(v).replace(/[$,]/g, ""));
      return isNaN(n) || n < 0 ? null : n;
    }
    const attorney_fees           = safeNumeric(body.attorney_fees);
    const gal_fees                = safeNumeric(body.gal_fees);
    const therapy_eval_fees       = safeNumeric(body.therapy_eval_fees);
    const reunification_fees      = safeNumeric(body.reunification_fees);
    const other_court_actors_fees = safeNumeric(body.other_court_actors_fees);
    const lost_wages              = safeNumeric(body.lost_wages);
    const asset_liquidation_loss  = safeNumeric(body.asset_liquidation_loss);
    // total_financial_loss — compute server-side from the individual fees.
    // (The original schema defined this as a GENERATED column but it has
    // since been changed to a regular numeric column; we compute + store it.)
    const total_financial_loss =
      (attorney_fees ?? 0) + (gal_fees ?? 0) + (therapy_eval_fees ?? 0) +
      (reunification_fees ?? 0) + (other_court_actors_fees ?? 0) +
      (lost_wages ?? 0) + (asset_liquidation_loss ?? 0);

    // ── Story ──────────────────────────────────────────────────────
    const impact_quote = String(body.impact_quote || "").trim();
    if (!impact_quote) return Response.json({ error: "Impact quote is required." }, { status: 400 });

    const permission_to_share = String(body.permission_to_share || "").trim();
    if (!permission_to_share) return Response.json({ error: "Permission to share is required." }, { status: 400 });

    const first_name = String(body.first_name || "").trim();
    if (!first_name) return Response.json({ error: "First name is required." }, { status: 400 });

    // ── IP hash ────────────────────────────────────────────────────
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
    const ip_hash = createHash("sha256").update(ip).digest("hex");

    // Get optional user_id (if someone is logged in while submitting), but
    // perform the insert with the admin client to bypass RLS. Every field
    // above has been validated server-side.
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    const adminSupabase = createAdminSupabaseClient();

    const { data, error } = await adminSupabase
      .from("survey_submissions")
      .insert({
        state_of_occurrence,
        outside_us_country,
        case_county,
        case_status,
        number_of_kids,
        system_affected,
        time_in_system,
        custody_status,
        is_pro_se,
        legal_rep_history,
        allegation_type,
        allegation_other_detail,
        allegation_root_cause,
        due_process_checklist,
        other_allegation_details,
        conflict_of_interest_awareness,
        conflict_description,
        federal_funding_influence,
        months_lost_parenting_time,
        lost_milestones_description,
        attorney_fees,
        gal_fees,
        therapy_eval_fees,
        reunification_fees,
        other_court_actors_fees,
        lost_wages,
        asset_liquidation_loss,
        total_financial_loss,
        impact_quote,
        permission_to_share,
        first_name,
        last_name,
        email,
        user_id: user?.id ?? null,
        ip_hash,
        // Auto-approve based on permission. If the family consented to
        // public display (public/anonymous/first_name), the quote goes
        // live immediately. data_only submissions stay approved=false
        // and are never shown publicly.
        approved: ["public", "anonymous", "first_name"].includes(permission_to_share),
      })
      .select("id")
      .single();

    if (error) {
      console.error("survey insert error:", error);
      return Response.json({ error: "Failed to save submission. Please try again." }, { status: 500 });
    }

    // ── Court actors ─────────────────────────────────────────────
    // Accept a list of named court actors tied to this submission. Each
    // row is lightly validated server-side: must have role + name, notes
    // and court are optional free text. Failures here do NOT reject the
    // submission — the quote already saved is more important to preserve.
    if (Array.isArray(body.court_actors) && body.court_actors.length > 0) {
      const actorRows = body.court_actors
        .map((a: { role?: string; name?: string; court?: string; notes?: string }) => {
          const role  = String(a?.role  || "").trim();
          const name  = String(a?.name  || "").trim();
          const court = String(a?.court || "").trim() || null;
          const notes = String(a?.notes || "").trim() || null;
          if (!role || !name) return null;
          return {
            submission_id: data.id,
            role,
            name,
            court_or_county: court,
            state_code: state_of_occurrence,
            notes,
          };
        })
        .filter(Boolean);

      if (actorRows.length > 0) {
        const { error: actorsErr } = await adminSupabase.from("court_actors").insert(actorRows);
        if (actorsErr) {
          // Log but don't fail the whole submission
          console.error("court_actors insert error (non-blocking):", actorsErr.message);
        }
      }
    }

    return Response.json({ success: true, id: data.id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/survey error:", err);
    return Response.json({ error: "Submission failed. Please try again." }, { status: 500 });
  }
}

// GET — public summary (total count + by-state breakdown, no PII)
// Uses movement_stats_by_state which applies outlier thresholds ($5M cap)
// so bogus financial entries don't inflate the public-facing totals.
export async function GET() {
  try {
    const adminSupabase = createAdminSupabaseClient();

    const [surveyCount, legacyCount, byStateResult] = await Promise.all([
      adminSupabase.from("survey_submissions").select("id", { count: "exact", head: true }),
      adminSupabase.from("legacy_submissions").select("id", { count: "exact", head: true }),
      adminSupabase.from("movement_stats_by_state").select("*"),
    ]);

    return Response.json({
      total: (surveyCount.count ?? 0) + (legacyCount.count ?? 0),
      by_state: byStateResult.data ?? [],
    });
  } catch (err) {
    console.error("GET /api/survey error:", err);
    return Response.json({ error: "Failed to load stats." }, { status: 500 });
  }
}
