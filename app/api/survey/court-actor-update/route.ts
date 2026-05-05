import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { courtActorLocationKey } from "../../../../lib/court-actors";

const ACTOR_NOTE_MIN_CHARS = 12;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_ROLES = new Set([
  "Judge",
  "Attorney (Mine)",
  "Attorney (Opposing)",
  "GAL / Child Representative",
  "Custody Evaluator",
  "Psychological Evaluator",
  "CPS Worker",
  "Therapist / Counselor",
  "Mediator",
  "Reunification Therapist",
  "Other",
]);

type ActorInput = {
  role?: unknown;
  name?: unknown;
  court?: unknown;
  notes?: unknown;
};

type SubmissionRow = {
  id: string;
  email: string | null;
  state_of_occurrence: string | null;
  outside_us_country: string | null;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const submissionId = cleanText(body.submission_id, 80);
    const actorId = cleanText(body.actor_id, 80);
    const email = cleanText(body.email, 254).toLowerCase();
    // Optional override: when the visitor came from /actors → "On my case"
    // for an actor in a specific state, the client forwards that state code
    // so we tag the new row to the actor's state instead of inheriting the
    // visitor's submission state. Validate strictly as a 2-letter US state.
    const stateOverrideRaw = cleanText(body.state_code_override, 4).toUpperCase();
    const stateOverride = /^[A-Z]{2}$/.test(stateOverrideRaw) ? stateOverrideRaw : null;

    if (!UUID_RE.test(submissionId)) {
      return Response.json({ error: "A valid submission link is required." }, { status: 400 });
    }
    if (actorId && !UUID_RE.test(actorId)) {
      return Response.json({ error: "A valid actor link is required." }, { status: 400 });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }

    const rawActors = Array.isArray(body.court_actors) ? body.court_actors : [];
    if (rawActors.length === 0) {
      return Response.json({ error: "Add at least one court actor." }, { status: 400 });
    }

    const actors: Array<{ role: string; name: string; court: string | null; notes: string }> = rawActors.map((raw: ActorInput, idx: number) => {
      const role = cleanText(raw?.role, 80);
      const name = cleanText(raw?.name, 160);
      const court = cleanText(raw?.court, 160) || null;
      const notes = cleanText(raw?.notes, 1200);

      if (!VALID_ROLES.has(role)) {
        throw new Error(`Court actor #${idx + 1} needs a valid role.`);
      }
      if (!name) {
        throw new Error(`Court actor #${idx + 1} needs a name.`);
      }
      if (notes.length < ACTOR_NOTE_MIN_CHARS) {
        throw new Error(`Court actor #${idx + 1} needs one short reason/note.`);
      }

      return { role, name, court, notes };
    });

    const adminSupabase = createAdminSupabaseClient();
    const { data: submission, error: submissionError } = await adminSupabase
      .from("survey_submissions")
      .select("id,email,state_of_occurrence,outside_us_country")
      .eq("id", submissionId)
      .maybeSingle();

    if (submissionError) {
      console.error("court actor update submission lookup error:", submissionError.message);
      return Response.json({ error: "Could not verify the original submission." }, { status: 500 });
    }
    if (!submission) {
      return Response.json({ error: "Original submission not found." }, { status: 404 });
    }

    const submissionRow = submission as SubmissionRow;
    const originalEmail = String(submissionRow.email || "").trim().toLowerCase();
    if (!originalEmail || originalEmail !== email) {
      return Response.json({
        error: "That email does not match the original submission. Please use the same email you used on the survey.",
      }, { status: 403 });
    }

    const rowState = stateOverride ?? submissionRow.state_of_occurrence;
    const rowLocationKey = courtActorLocationKey(rowState, stateOverride ? null : submissionRow.outside_us_country);

    let updated = 0;
    let insertStart = 0;

    if (actorId && actors.length > 0) {
      const first = actors[0];
      const { data: existingActor, error: actorLookupError } = await adminSupabase
        .from("court_actors")
        .select("id,submission_id")
        .eq("id", actorId)
        .eq("submission_id", submissionId)
        .maybeSingle();

      if (actorLookupError) {
        console.error("court actor update actor lookup error:", actorLookupError.message);
        return Response.json({ error: "Could not verify the court actor row." }, { status: 500 });
      }

      if (existingActor) {
        const { error: updateError } = await adminSupabase
          .from("court_actors")
          .update({
            role: first.role,
            name: first.name,
            court_or_county: first.court,
            notes: first.notes,
            state_code: rowState,
            location_key: rowLocationKey,
            source: "form_direct",
          })
          .eq("id", actorId)
          .eq("submission_id", submissionId);

        if (updateError) {
          console.error("court actor update error:", updateError.message);
          return Response.json({ error: "Could not update the court actor." }, { status: 500 });
        }
        updated = 1;
        insertStart = 1;
      }
    }

    const actorsToInsert = actors.slice(insertStart).map(actor => ({
      submission_id: submissionId,
      role: actor.role,
      name: actor.name,
      court_or_county: actor.court,
      state_code: rowState,
      location_key: rowLocationKey,
      notes: actor.notes,
      source: "form_direct",
    }));

    if (actorsToInsert.length > 0) {
      const { error: insertError } = await adminSupabase.from("court_actors").insert(actorsToInsert);
      if (insertError) {
        console.error("court actor update insert error:", insertError.message);
        return Response.json({ error: "Could not save the court actor details." }, { status: 500 });
      }
    }

    return Response.json({
      success: true,
      updated,
      inserted: actorsToInsert.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Court actor update failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
