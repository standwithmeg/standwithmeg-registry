import { promises as fs } from "fs";
import path from "path";
import { createServerSupabaseClient } from "../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../lib/supabase-admin";
import {
  isUnitedStatesCountry,
  normalizeOutsideCountryForReporting,
} from "../../../lib/survey-location";
import { VALID_US_JURISDICTION_CODES } from "../../../lib/us-jurisdictions";
import { PUBLIC_REPORT_CACHE_HEADERS, PUBLIC_REPORT_FALLBACK_CACHE_HEADERS } from "../../../lib/public-cache";
import { actorLooseNameKey, courtActorLocationKey } from "../../../lib/court-actors";
import { dispatchPendingPhotoRequests } from "../../../lib/court-actor-public-notifications";
import { isCourtActorRoleOption, normalizeCourtActorRoleLabel } from "../../../lib/court-actor-roles";
import {
  loadCourtActorThresholdSnapshot,
  queueStateRegenerationIfCourtActorThresholdCrossed,
  queueStateRegenerationIfReportThresholdReached,
} from "../../../lib/threshold-regeneration";
import { sendSurveyConfirmationEmail } from "../../../lib/survey-confirmation-email";
import { withSupabaseReadTimeout } from "../../../lib/supabase-timeout";
import { createHash } from "crypto";
import { after } from "next/server";
import { refreshPublicActorCache } from "./court-actors/route";

function appOrigin(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(request.url).origin ||
    "https://my.standwithmeg.com"
  ).replace(/\/+$/, "");
}

// Public submissions come in anonymously from untrusted visitors, but the
// server has already validated every field above. Use the admin client to
// insert so the write isn't blocked by RLS on survey_submissions.

const VALID_SHARE_PERMISSIONS = new Set(["public", "anonymous", "first_name", "data_only"]);
const ACTOR_NOTE_MIN_CHARS = 12;

type StaticSurveySummaryRow = {
  state: string;
  is_us: boolean;
  total_submissions: number;
  total_financial_loss: number | null;
};

type AdminSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

type ExistingSurveySubmission = {
  id: string;
  state_of_occurrence: string | null;
  outside_us_country: string | null;
  [key: string]: unknown;
};

type ValidatedActorRow = {
  role: string;
  name: string;
  court: string | null;
  notes: string;
};

function actorMatchKey(actor: { role: string | null; name: string | null; court_or_county?: string | null }) {
  return [
    actor.role ?? "",
    actorLooseNameKey(actor.name ?? ""),
    String(actor.court_or_county ?? "").trim().toLowerCase(),
  ].join("|");
}

async function loadStaticSurveySummary() {
  try {
    const [indexRaw, financialsRaw] = await Promise.all([
      fs.readFile(path.join(process.cwd(), "public", "state-reports", "index.json"), "utf-8"),
      fs.readFile(path.join(process.cwd(), "public", "state-reports", "financials.json"), "utf-8").catch(() => "{}"),
    ]);
    const index = JSON.parse(indexRaw) as Array<{ state: string; submissions: number }>;
    const financials = JSON.parse(financialsRaw) as { by_state?: Record<string, number> };
    const lossByState = financials.by_state ?? {};
    const byState: StaticSurveySummaryRow[] = index.map(row => ({
      state: row.state,
      is_us: VALID_US_JURISDICTION_CODES.has(row.state),
      total_submissions: Number(row.submissions) || 0,
      total_financial_loss: typeof lossByState[row.state] === "number" ? lossByState[row.state] : null,
    }));
    return {
      total: byState.reduce((sum, row) => sum + row.total_submissions, 0),
      by_state: byState,
    };
  } catch {
    return { total: 0, by_state: [] as StaticSurveySummaryRow[] };
  }
}

function safeNumeric(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return isNaN(n) || n < 0 ? null : n;
}

async function findExistingSubmissionForResubmission(
  adminSupabase: AdminSupabaseClient,
  email: string,
  locationKey: string | null,
) {
  const { data, error } = await adminSupabase
    .from("survey_submissions")
    .select("*")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("survey existing-submission lookup error:", error.message);
    return { error };
  }

  const submissions = (data ?? []) as ExistingSurveySubmission[];
  const sameLocation = submissions.filter(row =>
    courtActorLocationKey(row.state_of_occurrence, row.outside_us_country) === locationKey
  );

  if (sameLocation.length > 0) return { submission: sameLocation[0] };
  return { submission: null };
}

async function saveResubmissionRevision(
  adminSupabase: AdminSupabaseClient,
  existing: ExistingSurveySubmission,
  updatedByEmail: string,
) {
  const { data: existingActors, error: actorsLookupError } = await adminSupabase
    .from("court_actors")
    .select("*")
    .eq("submission_id", existing.id)
    .eq("source", "form_direct");

  if (actorsLookupError) {
    console.error("survey resubmission actor snapshot error:", actorsLookupError.message);
    return { error: "Could not snapshot existing court actors before updating." };
  }

  const { error: revisionError } = await adminSupabase
    .from("survey_submission_revisions")
    .insert({
      submission_id: existing.id,
      revision_reason: "public_resubmission",
      previous_submission: existing,
      previous_court_actors: existingActors ?? [],
      updated_by_email: updatedByEmail,
    });

  if (revisionError) {
    console.error("survey resubmission revision insert error:", revisionError.message);
    return {
      error: revisionError.code === "42P01"
        ? "The survey_submission_revisions migration needs to be run before survey resubmissions can update existing rows."
        : "Could not save a revision snapshot before updating the existing survey.",
    };
  }

  return { existingActors: existingActors ?? [] };
}

async function upsertResubmittedCourtActors(
  adminSupabase: AdminSupabaseClient,
  submissionId: string,
  actorRows: ValidatedActorRow[],
  locationKey: string | null,
  stateCode: string | null,
) {
  if (actorRows.length === 0) return { insertedBucketKeys: new Set<string>() };

  const { data: existingActors, error: lookupError } = await adminSupabase
    .from("court_actors")
    .select("id, role, name, court_or_county")
    .eq("submission_id", submissionId)
    .eq("source", "form_direct");

  if (lookupError) {
    console.error("survey resubmission actor lookup error:", lookupError.message);
    return { error: "Could not load existing court actors before updating." };
  }

  const existingByKey = new Map(
    (existingActors ?? []).map(actor => [
      actorMatchKey({
        role: actor.role,
        name: actor.name,
        court_or_county: actor.court_or_county,
      }),
      actor,
    ]),
  );
  const insertedBucketKeys = new Set<string>();

  for (const actor of actorRows) {
    const existing = existingByKey.get(actorMatchKey({
      role: actor.role,
      name: actor.name,
      court_or_county: actor.court,
    }));

    if (existing?.id) {
      const { error } = await adminSupabase
        .from("court_actors")
        .update({
          role: actor.role,
          name: actor.name,
          court_or_county: actor.court,
          notes: actor.notes,
          state_code: stateCode,
          location_key: locationKey,
          source: "form_direct",
        })
        .eq("id", existing.id)
        .eq("submission_id", submissionId);
      if (error) {
        console.error("survey resubmission actor update error:", error.message);
        return { error: "Could not update one of the court actors." };
      }
      continue;
    }

    const { error } = await adminSupabase
      .from("court_actors")
      .insert({
        submission_id: submissionId,
        role: actor.role,
        name: actor.name,
        court_or_county: actor.court,
        state_code: stateCode,
        location_key: locationKey,
        notes: actor.notes,
        source: "form_direct",
      });

    if (error) {
      console.error("survey resubmission actor insert error:", error.message);
      return { error: "Could not add one of the court actors." };
    }

    const looseKey = actorLooseNameKey(actor.name);
    if (looseKey && locationKey) insertedBucketKeys.add(`${looseKey}|${locationKey}`);
  }

  return { insertedBucketKeys };
}

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
      if (isUnitedStatesCountry(country)) {
        return Response.json({
          error: "If your case is in the United States, choose \"I am in the United States\" and select the state.",
        }, { status: 400 });
      }
      outside_us_country = country;
    } else {
      const state = String(body.state_of_occurrence || "").toUpperCase().trim();
      if (!VALID_US_JURISDICTION_CODES.has(state)) {
        return Response.json({ error: "A valid US state, district, or territory is required." }, { status: 400 });
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

    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }

    // ── Stolen time ────────────────────────────────────────────────
    const months_lost_raw = parseInt(String(body.months_lost_parenting_time ?? ""), 10);
    const months_lost_parenting_time = !isNaN(months_lost_raw) && months_lost_raw >= 0 ? months_lost_raw : null;
    const lost_milestones_description = String(body.lost_milestones_description || "").trim() || null;

    // ── Financials ─────────────────────────────────────────────────
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
    if (!VALID_SHARE_PERMISSIONS.has(permission_to_share)) {
      return Response.json({ error: "A valid permission to share option is required." }, { status: 400 });
    }

    const first_name = String(body.first_name || "").trim();
    if (!first_name) return Response.json({ error: "First name is required." }, { status: 400 });

    // ── Court actors ─────────────────────────────────────────────
    // Optional overall, but if a family names an actor, every actor row
    // must include the role, name, and a short factual note. This keeps the
    // admin/public pattern review useful and prevents empty actor records.
    const incomingActors = Array.isArray(body.court_actors) ? body.court_actors : [];
    const actorRows: ValidatedActorRow[] = [];
    for (let i = 0; i < incomingActors.length; i += 1) {
      const a = incomingActors[i] as { role?: string; name?: string; court?: string; notes?: string } | null;
      const role  = normalizeCourtActorRoleLabel(String(a?.role  || "").trim());
      const name  = String(a?.name  || "").trim();
      const court = String(a?.court || "").trim() || null;
      const notes = String(a?.notes || "").trim();
      const hasAnyActorField = Boolean(role || name || court || notes);
      if (!hasAnyActorField) continue;
      if (!role || !isCourtActorRoleOption(role) || !name || notes.length < ACTOR_NOTE_MIN_CHARS) {
        return Response.json({
          error: `Court actor #${i + 1} needs a role, name, and one short reason/note.`,
        }, { status: 400 });
      }
      actorRows.push({
        role,
        name,
        court,
        notes,
      });
    }

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
    const location_key = courtActorLocationKey(state_of_occurrence, outside_us_country);
    const submissionCanPublishActorComments = ["public", "anonymous", "first_name"].includes(permission_to_share);
    const actorThresholdBefore = location_key && actorRows.length > 0
      ? await loadCourtActorThresholdSnapshot(adminSupabase, location_key)
      : null;

    const submissionPayload = {
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
      approved: submissionCanPublishActorComments,
    };

    const existingLookup = await findExistingSubmissionForResubmission(adminSupabase, email, location_key);
    if (existingLookup.error) {
      return Response.json({ error: "Failed to check for an existing survey. Please try again." }, { status: 500 });
    }

    let submissionId: string;
    let updatedExisting = false;
    let insertedActorBucketKeys = new Set<string>();

    if (existingLookup.submission) {
      const revision = await saveResubmissionRevision(adminSupabase, existingLookup.submission, email);
      if (revision.error) {
        return Response.json({ error: revision.error }, { status: 500 });
      }

      const { error: updateError } = await adminSupabase
        .from("survey_submissions")
        .update(submissionPayload)
        .eq("id", existingLookup.submission.id);

      if (updateError) {
        console.error("survey resubmission update error:", updateError);
        return Response.json({ error: "Failed to update your existing survey. Please try again." }, { status: 500 });
      }

      submissionId = existingLookup.submission.id;
      updatedExisting = true;

      const actorResult = await upsertResubmittedCourtActors(
        adminSupabase,
        submissionId,
        actorRows,
        location_key,
        state_of_occurrence,
      );
      if (actorResult.error) {
        return Response.json({ error: actorResult.error }, { status: 500 });
      }
      insertedActorBucketKeys = actorResult.insertedBucketKeys ?? new Set<string>();
    } else {
      const { data, error } = await adminSupabase
        .from("survey_submissions")
        .insert(submissionPayload)
        .select("id")
        .single();

      if (error) {
        console.error("survey insert error:", error);
        return Response.json({ error: "Failed to save submission. Please try again." }, { status: 500 });
      }

      submissionId = data.id;
    }

    if (!updatedExisting && actorRows.length > 0) {
      const rowsToInsert = actorRows.map(a => ({
        submission_id: submissionId,
        role: a.role,
        name: a.name,
        court_or_county: a.court,
        state_code: state_of_occurrence,
        location_key: location_key,
        notes: a.notes,
        // Every public counting query filters on source=form_direct; without
        // it these rows never count toward the 3-family public threshold.
        source: "form_direct",
      }));
      if (rowsToInsert.length > 0) {
        const { error: actorsErr } = await adminSupabase.from("court_actors").insert(rowsToInsert);
        if (actorsErr) {
          // Log but don't fail the whole submission
          console.error("court_actors insert error (non-blocking):", actorsErr.message);
        } else if (location_key) {
          // Fire-and-forget: if any of the actors this family just named has
          // *now* crossed the public threshold, the dispatcher will email
          // every contributing reporter who hasn't already been emailed for
          // that actor. Scoped to the just-submitted bucket keys so we never
          // do unbounded SMTP work in the request path. Errors are logged
          // and never thrown — the submission response is unaffected.
          const onlyActorBucketKeys = new Set<string>();
          for (const a of actorRows) {
            const looseKey = actorLooseNameKey(a.name);
            if (looseKey) onlyActorBucketKeys.add(`${looseKey}|${location_key}`);
          }
          const smtpUser = process.env.GOOGLE_SMTP_USER;
          const smtpPass = process.env.GOOGLE_SMTP_PASSWORD;
          if (smtpUser && smtpPass && onlyActorBucketKeys.size > 0) {
            const fromAddress = process.env.GOOGLE_SMTP_FROM || smtpUser;
            const replyToAddress = process.env.GOOGLE_SMTP_REPLY_TO || fromAddress;
            after(() => dispatchPendingPhotoRequests({
              smtpUser,
              smtpPass,
              fromAddress,
              replyToAddress,
              onlyActorBucketKeys,
            }).catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("instant photo-request dispatch failed (non-blocking):", msg);
            }));
          }
        }
      }
    }

    if (updatedExisting && location_key && submissionCanPublishActorComments && insertedActorBucketKeys.size > 0) {
      const smtpUser = process.env.GOOGLE_SMTP_USER;
      const smtpPass = process.env.GOOGLE_SMTP_PASSWORD;
      if (smtpUser && smtpPass) {
        const fromAddress = process.env.GOOGLE_SMTP_FROM || smtpUser;
        const replyToAddress = process.env.GOOGLE_SMTP_REPLY_TO || fromAddress;
        after(() => dispatchPendingPhotoRequests({
          smtpUser,
          smtpPass,
          fromAddress,
          replyToAddress,
          onlyActorBucketKeys: insertedActorBucketKeys,
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("instant photo-request dispatch failed (non-blocking):", msg);
        }));
      }
    }

    if (actorThresholdBefore) {
      const crossedPublicActorThreshold = await queueStateRegenerationIfCourtActorThresholdCrossed({
        sb: adminSupabase,
        location: location_key,
        before: actorThresholdBefore,
        reason: updatedExisting
          ? "survey resubmission crossed court actor threshold"
          : "new survey crossed court actor threshold",
      });
      if (crossedPublicActorThreshold) {
        after(() => refreshPublicActorCache(adminSupabase).catch(err => {
          console.error("public actor cache refresh failed after survey threshold crossing:", err);
        }));
      }
    }

    if (!updatedExisting) {
      await queueStateRegenerationIfReportThresholdReached(
        adminSupabase,
        location_key,
        "new survey reached report threshold",
      );
    }

    if (!updatedExisting) {
      // Fire-and-forget: email the submitter a thank-you + next-steps message.
      // A flaky mail server must never block or fail a saved submission, so
      // errors are logged and swallowed here.
      const confirmationEmailHash = createHash("sha256")
        .update(email.trim().toLowerCase())
        .digest("hex")
        .slice(0, 12);
      const confirmationEmailDomain = email.split("@").pop()?.toLowerCase() ?? "unknown";
      after(() => sendSurveyConfirmationEmail({
        email,
        firstName: first_name,
        submissionId,
        appOrigin: appOrigin(request),
      }).then((info) => {
        console.log("survey confirmation email accepted", {
          submissionId,
          recipientDomain: confirmationEmailDomain,
          recipientHash: confirmationEmailHash,
          messageId: info.messageId ?? null,
        });
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("survey confirmation email failed (non-blocking):", msg);
      }));
    }

    return Response.json(
      { success: true, id: submissionId, updated: updatedExisting },
      { status: updatedExisting ? 200 : 201 },
    );
  } catch (err) {
    console.error("POST /api/survey error:", err);
    return Response.json({ error: "Submission failed. Please try again." }, { status: 500 });
  }
}

// GET — public summary (total count + by-state breakdown, no PII)
// Uses movement_stats_by_state which applies outlier thresholds ($5M cap)
// so bogus financial entries don't inflate the public-facing totals.
let reportStatsCache:
  | { expiresAt: number; promise: Promise<{ total: number; by_state: unknown[] }> }
  | null = null;
const REPORT_STATS_CACHE_TTL_MS = 5 * 60 * 1000;

async function computeReportStats(): Promise<{ total: number; by_state: unknown[] }> {
  const adminSupabase = createAdminSupabaseClient();

  const byStateResult = await withSupabaseReadTimeout(
    adminSupabase.from("movement_stats_by_state").select("*"),
    "movement_stats_by_state",
  );

  if (byStateResult.error) throw byStateResult.error;

  if (!byStateResult.data || byStateResult.data.length === 0) {
    return loadStaticSurveySummary();
  }

  const byState = (byStateResult.data ?? []).map(row => {
    const r = row as { is_us?: boolean; state?: string | null };
    return r.is_us ? r : { ...r, state: normalizeOutsideCountryForReporting(r.state) };
  });
  const byStateRows = byState as Array<{ total_submissions: number | null }>;
  const total = byStateRows.reduce(
    (sum, row) => sum + (Number(row.total_submissions) || 0),
    0
  );

  return { total, by_state: byState };
}

export async function GET() {
  try {
    const now = Date.now();
    if (!reportStatsCache || reportStatsCache.expiresAt <= now) {
      const promise = computeReportStats();
      reportStatsCache = { expiresAt: now + REPORT_STATS_CACHE_TTL_MS, promise };
      promise.catch(() => { reportStatsCache = null; });
    }

    const { total, by_state } = await reportStatsCache.promise;

    return Response.json(
      { total, by_state },
      { headers: PUBLIC_REPORT_CACHE_HEADERS },
    );
  } catch (err) {
    console.error("GET /api/survey error:", err);
    const fallback = await loadStaticSurveySummary();
    return Response.json(fallback, { headers: PUBLIC_REPORT_FALLBACK_CACHE_HEADERS });
  }
}
