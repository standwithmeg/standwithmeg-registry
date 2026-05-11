import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorBucketKey, resolveFamilyKey, type CourtActorRowReviewDecision } from "../../../../../lib/court-actors";
import { isCountableSubmission, isPublicShareableSubmission } from "../../../../../lib/submission-public-visibility";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

/**
 * Returns the anonymized factual notes that families wrote about ONE named
 * court actor — but only when that actor has crossed the public threshold
 * (using the shared independent-family threshold in the same state). This
 * protects a single submission's note from ever being exposed by probing this endpoint.
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

type Row = {
  id: string;
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  notes: string | null;
  submission_id: string;
  created_at: string;
  survey_submissions:
    | { email: string | null; state_of_occurrence: string | null; permission_to_share: string | null; approved: boolean | null }
    | { email: string | null; state_of_occurrence: string | null; permission_to_share: string | null; approved: boolean | null }[]
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

async function loadRowReviewMap(sb: AdminClient): Promise<Map<string, CourtActorRowReviewDecision>> {
  const { data, error } = await sb
    .from("court_actor_row_review")
    .select("row_id, decision");
  if (error) {
    const missing = error.code === "42P01"
      || error.code === "PGRST205"
      || /Could not find the table/i.test(error.message ?? "");
    if (missing) return new Map();
    console.error("court_actor_row_review select error:", error.message);
    return new Map();
  }
  const map = new Map<string, CourtActorRowReviewDecision>();
  for (const r of (data ?? []) as Array<{ row_id: string; decision: CourtActorRowReviewDecision }>) {
    map.set(r.row_id, r.decision);
  }
  return map;
}

type CommentMergeEntry = { merged_comment: string; merged_row_ids: string[] };

async function loadCommentMergeMap(sb: AdminClient): Promise<Map<string, CommentMergeEntry>> {
  const { data, error } = await sb
    .from("court_actor_comment_merges")
    .select("primary_row_id, merged_comment, merged_row_ids");
  if (error) {
    const missing = error.code === "42P01"
      || error.code === "PGRST205"
      || /Could not find the table/i.test(error.message ?? "");
    if (missing) return new Map();
    console.error("court_actor_comment_merges select error:", error.message);
    return new Map();
  }
  const map = new Map<string, CommentMergeEntry>();
  for (const r of (data ?? []) as Array<{ primary_row_id: string; merged_comment: string; merged_row_ids: string[] }>) {
    if (r.merged_comment && r.merged_comment.trim()) {
      map.set(r.primary_row_id, {
        merged_comment: r.merged_comment,
        merged_row_ids: r.merged_row_ids ?? [],
      });
    }
  }
  return map;
}

function familyKey(row: Row, reviewMap: Map<string, CourtActorRowReviewDecision>): string | null {
  const state = actorState(row) ?? "";
  return resolveFamilyKey({
    row_id: row.id,
    reporter_email: joinedSubmission(row)?.email ?? null,
    submission_id: row.submission_id,
    location_key: state,
    review_decision: reviewMap.get(row.id) ?? null,
  });
}

// Internal admin/source prefixes that get prepended when notes were
// extracted from legacy free-text by AI / regex passes and later promoted.
// Not appropriate to display publicly — strip the leading tag while
// preserving the underlying family-written text.
const EXTRACTED_PREFIX_RE = /^\s*\[\s*extracted[_\s-]*[a-z0-9]*\s*\]\s*/i;

function cleanPublicNote(note: string | null | undefined): string {
  if (!note) return "";
  let cleaned = note;
  // Loop in case more than one prefix was concatenated.
  while (EXTRACTED_PREFIX_RE.test(cleaned)) {
    cleaned = cleaned.replace(EXTRACTED_PREFIX_RE, "");
  }
  return cleaned.trim();
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
          "id, role, name, court_or_county, state_code, notes, submission_id, created_at, survey_submissions(email, state_of_occurrence, permission_to_share, approved)"
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

    // Apply the same alias / row-review overlays as /api/survey/court-actors
    // so an actor whose public count came from an admin 'same_actor' decision
    // (e.g. Catherine Conklin rolling up Cathrin/Cathrine) actually returns
    // its rows here. Without this, the gate below sees zero matching families
    // for alias-merged actors and silently returns an empty notes list.
    const rowReviewMap = await loadRowReviewMap(sb);

    // Comment merges: when the same reporter submitted multiple rows about
    // the same actor and the admin merged the comments, the primary row's
    // displayed note is replaced by the admin-edited merged_comment, and
    // the merged rows are excluded from family counts (their decision in
    // row_review is 'merge_comments' so resolveFamilyKey returns null).
    const commentMergeMap = await loadCommentMergeMap(sb);

    // Find rows that match the requested actor bucket + state. A row matches
    // if either its own bucket key OR its alias-canonical bucket key equals
    // the target.
    // Identify non-public rows across ALL loaded data so we can check
    // merge taint even for rows outside the matched bucket.
    const nonPublicRowIds = new Set<string>();
    for (const row of all) {
      const submission = joinedSubmission(row);
      if (!isPublicShareableSubmission(submission)) {
        nonPublicRowIds.add(row.id);
      }
    }

    const matchingRows: Row[] = [];
    const families = new Set<string>();
    for (const row of all) {
      if (!row.role || !row.name) continue;
      const submission = joinedSubmission(row);
      if (!isCountableSubmission(submission)) continue;
      const state = actorState(row);
      if (!state || state !== stateParam) continue;
      const effectiveName = row.name;
      const key = actorBucketKey(effectiveName, row.role, state);
      if (key !== targetBucketKey) continue;
      const fk = familyKey(row, rowReviewMap);
      if (fk === null) continue;
      matchingRows.push(row);
      families.add(fk);
    }

    if (families.size < COURT_ACTOR_PUBLIC_THRESHOLD) {
      return Response.json({ notes: [], count: 0 });
    }

    const notesByFamily = new Map<string, { note: string; month: string | null }>();
    for (const row of matchingRows) {
      // Only display notes from publicly-shareable submissions.
      // data_only rows counted above but their text stays hidden.
      if (nonPublicRowIds.has(row.id)) continue;

      const mergeEntry = commentMergeMap.get(row.id);
      let merged: string | undefined;
      if (mergeEntry) {
        // If any merged source row came from a non-public submission,
        // the merged_comment could contain their text — fall back to
        // this row's own notes only.
        const mergeTainted = mergeEntry.merged_row_ids.some(
          id => nonPublicRowIds.has(id)
        );
        if (!mergeTainted) {
          merged = mergeEntry.merged_comment;
        }
      }

      const sourceText = merged ?? (row.notes ?? "").trim();
      if (!sourceText) continue;
      const note = cleanPublicNote(sourceText);
      if (!note) continue;
      const fk = familyKey(row, rowReviewMap);
      if (fk === null) continue;
      const month = isoMonth(row.created_at);
      const existing = notesByFamily.get(fk);
      const isMerged = Boolean(merged);
      const existingIsMerged = Boolean(existing && existing.note === merged);
      const shouldReplace = !existing
        || (isMerged && !existingIsMerged)
        || (!existingIsMerged && note.length > existing.note.length);
      if (shouldReplace) {
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
