import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import {
  isUnitedStatesCountry,
} from "../../../../lib/survey-location";
import { VALID_US_JURISDICTION_CODES } from "../../../../lib/us-jurisdictions";
import { courtActorLocationKey } from "../../../../lib/court-actors";
import { isCourtActorRoleOption, normalizeCourtActorRoleLabel } from "../../../../lib/court-actor-roles";
import {
  loadCourtActorThresholdSnapshot,
  queueStateRegenerationIfCourtActorThresholdCrossed,
} from "../../../../lib/threshold-regeneration";
import { refreshPublicActorCache } from "../court-actors/route";
import { after } from "next/server";

const VALID_SHARE_PERMISSIONS = new Set(["public", "anonymous", "first_name", "data_only"]);
const VALID_AWARENESS = new Set(["Yes", "No", "Unsure"]);
const ACTOR_NOTE_MIN_CHARS = 12;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_COMPACT_RE = /^[0-9a-f]{32}$/i;
const UUID_PREFIX_MIN_COMPACT_LENGTH = 28;

type ActorInput = {
  id?: unknown;
  role?: unknown;
  name?: unknown;
  court?: unknown;
  notes?: unknown;
};

function cleanText(value: unknown, maxLength = 4000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safeNumeric(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function compactUuid(value: string) {
  return value.toLowerCase().replace(/[^0-9a-f]/g, "");
}

function dashedUuidFromCompact(value: string) {
  if (!UUID_COMPACT_RE.test(value)) return null;
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function verifyArgs(body: Record<string, unknown>) {
  const submissionIdInput = cleanText(body.submission_id, 80);
  const email = cleanText(body.verification_email || body.email, 254).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid email address is required." };
  }
  const compactId = compactUuid(submissionIdInput);
  if (UUID_RE.test(submissionIdInput)) {
    return { submissionIdInput, compactId, email };
  }
  const dashedFromCompact = dashedUuidFromCompact(compactId);
  if (dashedFromCompact && UUID_RE.test(dashedFromCompact)) {
    return { submissionIdInput: dashedFromCompact, compactId, email };
  }
  if (compactId.length >= UUID_PREFIX_MIN_COMPACT_LENGTH && compactId.length < 32) {
    return { submissionIdInput, compactId, email };
  }
  return { error: "A valid submission ID is required. Paste the full ID, or at least the first 28 letters/numbers." };
}

async function resolveSubmission(
  sb: ReturnType<typeof createAdminSupabaseClient>,
  verified: Exclude<ReturnType<typeof verifyArgs>, { error: string }>,
) {
  const compactInput = verified.compactId;

  if (UUID_RE.test(verified.submissionIdInput)) {
    const { data: submission, error } = await sb
      .from("survey_submissions")
      .select("*")
      .eq("id", verified.submissionIdInput)
      .eq("email", verified.email)
      .maybeSingle();
    if (error) {
      console.error("survey update lookup error:", error.message);
      return { error: "Could not load that submission.", status: 500 };
    }
    if (!submission) {
      return { error: "No matching submission found for that email and submission ID.", status: 404 };
    }
    return { submission };
  }

  const { data: submissions, error } = await sb
    .from("survey_submissions")
    .select("*")
    .eq("email", verified.email)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("survey update prefix lookup error:", error.message);
    return { error: "Could not load that submission.", status: 500 };
  }

  const matches = (submissions ?? []).filter(row => compactUuid(String(row.id)).startsWith(compactInput));
  if (matches.length === 0) {
    return { error: "No matching submission found for that email and submission ID.", status: 404 };
  }
  if (matches.length > 1) {
    return { error: "That submission ID matches more than one survey. Paste the full saved ID.", status: 400 };
  }
  return { submission: matches[0] };
}

function validatePayload(body: Record<string, unknown>) {
  const outsideUS = body.outside_us === true || body.outside_us === "true";
  let state_of_occurrence: string | null = null;
  let outside_us_country: string | null = null;

  if (outsideUS) {
    const country = cleanText(body.outside_us_country, 160);
    if (!country) return { error: "Country is required for international submissions." };
    if (isUnitedStatesCountry(country)) {
      return { error: "If your case is in the United States, choose \"I am in the United States\" and select the state." };
    }
    outside_us_country = country;
  } else {
    const state = cleanText(body.state_of_occurrence, 4).toUpperCase();
    if (!VALID_US_JURISDICTION_CODES.has(state)) {
      return { error: "A valid US state, district, or territory is required." };
    }
    state_of_occurrence = state;
  }

  const case_county = cleanText(body.case_county, 160);
  if (!case_county) return { error: "County is required." };

  const case_status = cleanText(body.case_status, 180);
  if (!case_status) return { error: "Case status is required." };

  const number_of_kids = parseInt(String(body.number_of_kids ?? ""), 10);
  if (!Number.isInteger(number_of_kids) || number_of_kids < 0 || number_of_kids > 20) {
    return { error: "Number of children is required and must be between 0 and 20." };
  }

  const system_affected = cleanText(body.system_affected, 180);
  if (!system_affected) return { error: "System affected is required." };

  const time_in_system = cleanText(body.time_in_system, 120);
  if (!time_in_system) return { error: "Time in system is required." };

  const custody_status = cleanText(body.custody_status, 180);
  if (!custody_status) return { error: "Custody status is required." };

  const legal_rep_history = cleanText(body.legal_rep_history, 240);
  if (!legal_rep_history) return { error: "Legal representation history is required." };

  const allegation_type = cleanText(body.allegation_type, 240);
  if (!allegation_type) return { error: "Allegation type is required." };

  const due_process_checklist = Array.isArray(body.due_process_checklist)
    ? body.due_process_checklist.map(item => cleanText(item, 240)).filter(Boolean)
    : [];
  if (due_process_checklist.length === 0) {
    return { error: "Due Process & Fraud Checklist requires at least one selection." };
  }

  const conflict_of_interest_awareness = cleanText(body.conflict_of_interest_awareness, 20);
  if (!VALID_AWARENESS.has(conflict_of_interest_awareness)) {
    return { error: "Conflict of interest awareness is required." };
  }

  const impact_quote = cleanText(body.impact_quote, 6000);
  if (!impact_quote) return { error: "Impact quote is required." };

  const permission_to_share = cleanText(body.permission_to_share, 40);
  if (!VALID_SHARE_PERMISSIONS.has(permission_to_share)) {
    return { error: "A valid permission to share option is required." };
  }

  const first_name = cleanText(body.first_name, 120);
  if (!first_name) return { error: "First name is required." };

  const last_name = cleanText(body.last_name, 120);
  if (!last_name) return { error: "Last name is required." };

  const email = cleanText(body.email, 254).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid email address is required." };
  }

  const actorRows = [];
  const rawActors = Array.isArray(body.court_actors) ? body.court_actors : [];
  for (let i = 0; i < rawActors.length; i += 1) {
    const raw = rawActors[i] as ActorInput | null;
    const id = cleanText(raw?.id, 80);
    const role = normalizeCourtActorRoleLabel(cleanText(raw?.role, 100));
    const name = cleanText(raw?.name, 180);
    const court = cleanText(raw?.court, 180) || null;
    const notes = cleanText(raw?.notes, 1600);
    const hasAnyActorField = Boolean(role || name || court || notes);
    if (!hasAnyActorField) continue;
    if (!role || !isCourtActorRoleOption(role) || !name || notes.length < ACTOR_NOTE_MIN_CHARS) {
      return { error: `Court actor #${i + 1} needs a role, name, and one short reason/note.` };
    }
    actorRows.push({ id: UUID_RE.test(id) ? id : null, role, name, court, notes });
  }

  const attorney_fees = safeNumeric(body.attorney_fees);
  const gal_fees = safeNumeric(body.gal_fees);
  const therapy_eval_fees = safeNumeric(body.therapy_eval_fees);
  const reunification_fees = safeNumeric(body.reunification_fees);
  const other_court_actors_fees = safeNumeric(body.other_court_actors_fees);
  const lost_wages = safeNumeric(body.lost_wages);
  const asset_liquidation_loss = safeNumeric(body.asset_liquidation_loss);
  const total_financial_loss =
    (attorney_fees ?? 0) + (gal_fees ?? 0) + (therapy_eval_fees ?? 0) +
    (reunification_fees ?? 0) + (other_court_actors_fees ?? 0) +
    (lost_wages ?? 0) + (asset_liquidation_loss ?? 0);

  return {
    update: {
      state_of_occurrence,
      outside_us_country,
      case_county,
      case_status,
      number_of_kids,
      system_affected,
      time_in_system,
      custody_status,
      is_pro_se: body.is_pro_se === true || body.is_pro_se === "true" || body.is_pro_se === "yes",
      legal_rep_history,
      allegation_type,
      allegation_other_detail: allegation_type === "Other" ? cleanText(body.allegation_other_detail, 1000) || null : null,
      allegation_root_cause: cleanText(body.allegation_root_cause, 2000) || null,
      due_process_checklist,
      other_allegation_details: cleanText(body.other_allegation_details, 3000) || null,
      conflict_of_interest_awareness,
      conflict_description: conflict_of_interest_awareness === "Yes"
        ? cleanText(body.conflict_description, 3000) || null
        : null,
      federal_funding_influence: VALID_AWARENESS.has(cleanText(body.federal_funding_influence, 20))
        ? cleanText(body.federal_funding_influence, 20)
        : "Unsure",
      months_lost_parenting_time: (() => {
        const months = parseInt(String(body.months_lost_parenting_time ?? ""), 10);
        return Number.isInteger(months) && months >= 0 ? months : null;
      })(),
      lost_milestones_description: cleanText(body.lost_milestones_description, 3000) || null,
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
      approved: ["public", "anonymous", "first_name"].includes(permission_to_share),
    },
    actorRows,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const verified = verifyArgs(body);
    if ("error" in verified) return Response.json({ error: verified.error }, { status: 400 });

    const sb = createAdminSupabaseClient();
    const resolved = await resolveSubmission(sb, verified);
    if ("error" in resolved) return Response.json({ error: resolved.error }, { status: resolved.status });
    const submission = resolved.submission;
    const submissionId = String(submission.id);

    const { data: actors, error: actorsError } = await sb
      .from("court_actors")
      .select("id, role, name, court_or_county, notes, source, created_at")
      .eq("submission_id", submissionId)
      .eq("source", "form_direct")
      .order("created_at", { ascending: true });
    if (actorsError) {
      console.error("survey update actor lookup error:", actorsError.message);
    }

    let visibleActors = actors ?? [];
    if (visibleActors.length > 0) {
      const { data: reviews, error: reviewsError } = await sb
        .from("court_actor_row_review")
        .select("row_id, decision")
        .in("row_id", visibleActors.map(actor => actor.id));
      if (!reviewsError) {
        const hiddenIds = new Set((reviews ?? [])
          .filter(review => review.decision === "submitter_hidden")
          .map(review => String(review.row_id)));
        visibleActors = visibleActors.filter(actor => !hiddenIds.has(String(actor.id)));
      }
    }

    return Response.json({
      submission,
      court_actors: actorsError ? [] : visibleActors,
    });
  } catch (err) {
    console.error("POST /api/survey/update error:", err);
    return Response.json({ error: "Could not load submission." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const verified = verifyArgs(body);
    if ("error" in verified) return Response.json({ error: verified.error }, { status: 400 });

    const parsed = validatePayload(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    const sb = createAdminSupabaseClient();
    const resolved = await resolveSubmission(sb, verified);
    if ("error" in resolved) return Response.json({ error: resolved.error }, { status: resolved.status });
    const existing = resolved.submission;
    const submissionId = String(existing.id);

    const { data: existingActors, error: actorsLookupError } = await sb
      .from("court_actors")
      .select("*")
      .eq("submission_id", submissionId)
      .eq("source", "form_direct");
    if (actorsLookupError) {
      console.error("survey update existing actors lookup error:", actorsLookupError.message);
      return Response.json({ error: "Could not load existing court actors." }, { status: 500 });
    }

    const { error: revisionError } = await sb
      .from("survey_submission_revisions")
      .insert({
        submission_id: submissionId,
        revision_reason: "submitter_update",
        previous_submission: existing,
        previous_court_actors: existingActors ?? [],
        updated_by_email: verified.email,
      });
    if (revisionError) {
      console.error("survey revision insert error:", revisionError.message);
      return Response.json({
        error: revisionError.code === "42P01"
          ? "The survey_submission_revisions migration needs to be run before survey updates can save."
          : "Could not save a revision snapshot before updating.",
      }, { status: 500 });
    }

    const { error: updateError } = await sb
      .from("survey_submissions")
      .update(parsed.update)
      .eq("id", submissionId);
    if (updateError) {
      console.error("survey update error:", updateError.message);
      return Response.json({ error: "Could not update the survey." }, { status: 500 });
    }

    const rowState = parsed.update.state_of_occurrence;
    const rowLocationKey = courtActorLocationKey(parsed.update.state_of_occurrence, parsed.update.outside_us_country);
    const actorThresholdBefore = rowLocationKey && parsed.actorRows.length > 0
      ? await loadCourtActorThresholdSnapshot(sb, rowLocationKey)
      : null;
    const existingActorIds = new Set((existingActors ?? []).map(row => String(row.id)));
    const submittedExistingIds = new Set(parsed.actorRows.map(row => row.id).filter(Boolean) as string[]);

    for (const actor of parsed.actorRows) {
      if (actor.id && existingActorIds.has(actor.id)) {
        const { error } = await sb
          .from("court_actors")
          .update({
            role: actor.role,
            name: actor.name,
            court_or_county: actor.court,
            notes: actor.notes,
            state_code: rowState,
            location_key: rowLocationKey,
            source: "form_direct",
          })
          .eq("id", actor.id)
          .eq("submission_id", submissionId);
        if (error) {
          console.error("survey actor update error:", error.message);
          return Response.json({ error: "Could not update one of the court actors." }, { status: 500 });
        }
        await sb.from("court_actor_row_review").delete().eq("row_id", actor.id).eq("decision", "submitter_hidden");
      } else {
        const { error } = await sb
          .from("court_actors")
          .insert({
            submission_id: submissionId,
            role: actor.role,
            name: actor.name,
            court_or_county: actor.court,
            notes: actor.notes,
            state_code: rowState,
            location_key: rowLocationKey,
            source: "form_direct",
          });
        if (error) {
          console.error("survey actor insert error:", error.message);
          return Response.json({ error: "Could not add one of the court actors." }, { status: 500 });
        }
      }
    }

    const removedActorIds = [...existingActorIds].filter(id => !submittedExistingIds.has(id));
    if (removedActorIds.length > 0) {
      const now = new Date().toISOString();
      const { error } = await sb
        .from("court_actor_row_review")
        .upsert(
          removedActorIds.map(rowId => ({
            row_id: rowId,
            decision: "submitter_hidden",
            note: "Submitter removed this actor during survey update. Original row preserved.",
            decided_by: verified.email,
            decided_at: now,
            updated_at: now,
          })),
          { onConflict: "row_id" },
        );
      if (error) {
        console.error("survey actor hide error:", error.message);
        return Response.json({
          error: error.code === "23514" || error.code === "42P01"
            ? "The submitter-hidden court actor migration needs to be run before removed actors can be hidden."
            : "Could not hide removed court actors.",
        }, { status: 500 });
      }
    }

    const crossedPublicActorThreshold = await queueStateRegenerationIfCourtActorThresholdCrossed({
      sb,
      location: rowLocationKey,
      before: actorThresholdBefore,
      reason: "survey submitter update crossed court actor threshold",
    });
    if (crossedPublicActorThreshold) {
      after(() => refreshPublicActorCache(sb).catch(err => {
        console.error("public actor cache refresh failed after survey update threshold crossing:", err);
      }));
    }
    return Response.json({ success: true, id: submissionId });
  } catch (err) {
    console.error("PATCH /api/survey/update error:", err);
    return Response.json({ error: "Survey update failed." }, { status: 500 });
  }
}
