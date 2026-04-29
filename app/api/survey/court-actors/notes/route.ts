import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { actorBucketKey } from "../../../../../lib/court-actors";

/**
 * Returns the anonymized factual notes that families wrote about ONE named
 * court actor — but only when that actor has crossed the public threshold
 * (≥ 3 different families naming them in the same state). This protects a
 * single submission's note from ever being exposed by probing this endpoint.
 *
 * Never returns: email, first_name, last_name, submission_id, ip_hash,
 * exact created_at timestamps. Each note is also deduped per family so
 * one family writing the same note twice does not appear twice.
 *
 * Query params (all required):
 *   - name  — original submitted name string (will be normalized via
 *             actorBucketKey, so any casing/punctuation works).
 *   - state — US state code (uppercase 2-letter).
 *
 * Response:
 *   { notes: [{ note: string, month: "YYYY-MM" }], count: number }
 */

const PUBLIC_THRESHOLD = 3;

type Row = {
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  notes: string | null;
  submission_id: string;
  created_at: string;
  survey_submissions:
    | { email: string | null; state_of_occurrence: string | null }
    | { email: string | null; state_of_occurrence: string | null }[]
    | null;
};

function joinedSubmission(row: Row) {
  return Array.isArray(row.survey_submissions)
    ? row.survey_submissions[0] ?? null
    : row.survey_submissions;
}

function actorState(row: Row): string | null {
  const direct = row.state_code?.trim().toUpperCase();
  if (direct) return direct;
  const joined = joinedSubmission(row)?.state_of_occurrence?.trim().toUpperCase();
  return joined || null;
}

function familyKey(row: Row): string {
  const state = actorState(row) ?? "";
  const email = joinedSubmission(row)?.email?.trim().toLowerCase();
  return email ? `${email}|${state}` : `submission:${row.submission_id}`;
}

function isoMonth(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const nameParam = searchParams.get("name")?.trim();
    const stateParam = searchParams.get("state")?.trim().toUpperCase();
    if (!nameParam || !stateParam) {
      return Response.json({ notes: [], count: 0, error: "name and state are required." }, { status: 400 });
    }

    const targetBucketKey = actorBucketKey(nameParam, "", stateParam);
    if (!targetBucketKey.split("|")[0]) {
      return Response.json({ notes: [], count: 0 });
    }

    const sb = createAdminSupabaseClient();

    // Fetch all form_direct rows + joined email/state. Same shape and pagination
    // as the public actors list so threshold logic stays consistent.
    let from = 0;
    const pageSize = 1000;
    const all: Row[] = [];
    while (true) {
      const { data, error } = await sb
        .from("court_actors")
        .select(
          "role, name, court_or_county, state_code, notes, submission_id, created_at, survey_submissions(email, state_of_occurrence)"
        )
        .eq("source", "form_direct")
        .range(from, from + pageSize - 1);
      if (error) {
        console.error("GET /api/survey/court-actors/notes (non-blocking):", error.message);
        return Response.json({ notes: [], count: 0 });
      }
      if (!data || data.length === 0) break;
      all.push(...(data as unknown as Row[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Find rows that match the requested actor bucket + state.
    const matchingRows: Row[] = [];
    const families = new Set<string>();
    for (const row of all) {
      if (!row.role || !row.name) continue;
      const state = actorState(row);
      if (!state || state !== stateParam) continue;
      const key = actorBucketKey(row.name, row.role, state);
      if (key !== targetBucketKey) continue;
      matchingRows.push(row);
      families.add(familyKey(row));
    }

    // Hard gate: only expose notes for actors who have already crossed the
    // public-display threshold. This makes probing /notes useless for
    // looking up a single family's submission.
    if (families.size < PUBLIC_THRESHOLD) {
      return Response.json({ notes: [], count: 0 });
    }

    // Dedup notes per family — one family writing the same note twice
    // appears once. Pick the longest non-empty note for each family.
    const notesByFamily = new Map<string, { note: string; month: string | null }>();
    for (const row of matchingRows) {
      const note = row.notes?.trim();
      if (!note) continue;
      const fk = familyKey(row);
      const month = isoMonth(row.created_at);
      const existing = notesByFamily.get(fk);
      if (!existing || note.length > existing.note.length) {
        notesByFamily.set(fk, { note, month });
      }
    }

    const notes = [...notesByFamily.values()]
      .sort((a, b) => (b.month ?? "").localeCompare(a.month ?? ""))
      .map(n => ({ note: n.note, month: n.month ?? "" }));

    return Response.json({ notes, count: families.size });
  } catch (err) {
    console.error("GET /api/survey/court-actors/notes error:", err);
    return Response.json({ notes: [], count: 0 });
  }
}
