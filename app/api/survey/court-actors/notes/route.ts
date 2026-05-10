import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorBucketKey, resolveFamilyKey, type CourtActorRowReviewDecision } from "../../../../../lib/court-actors";
import { AliasResolver, type AliasDecisionRow } from "../../../../../lib/court-actor-similarity";

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

async function loadAliasResolver(sb: AdminClient): Promise<AliasResolver | null> {
  const { data, error } = await sb
    .from("court_actor_alias_decisions")
    .select("cluster_key, location_key, decision, canonical_name, canonical_role, name_keys")
    .eq("decision", "same_actor");
  if (error) {
    const missing = error.code === "42P01"
      || error.code === "42703"
      || error.code === "PGRST205"
      || /Could not find the table/i.test(error.message ?? "");
    if (missing) return null;
    console.error("court_actor_alias_decisions select error:", error.message);
    return null;
  }
  return new AliasResolver((data ?? []) as AliasDecisionRow[]);
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

/**
 * Load court_actor_comment_merges → map of primary_row_id → merged_comment.
 * Returns empty map (not null) when the table is missing so pre-migration
 * behavior is unaffected.
 */
async function loadCommentMergeMap(sb: AdminClient): Promise<Map<string, string>> {
  const { data, error } = await sb
    .from("court_actor_comment_merges")
    .select("primary_row_id, merged_comment");
  if (error) {
    const missing = error.code === "42P01"
      || error.code === "PGRST205"
      || /Could not find the table/i.test(error.message ?? "");
    if (missing) return new Map();
    console.error("court_actor_comment_merges select error:", error.message);
    return new Map();
  }
  const map = new Map<string, string>();
  for (const r of (data ?? []) as Array<{ primary_row_id: string; merged_comment: string }>) {
    if (r.merged_comment && r.merged_comment.trim()) {
      map.set(r.primary_row_id, r.merged_comment);
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
          "id, role, name, court_or_county, state_code, notes, submission_id, created_at, survey_submissions(email, state_of_occurrence)"
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
    const aliasResolver = await loadAliasResolver(sb);
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
    const matchingRows: Row[] = [];
    const families = new Set<string>();
    for (const row of all) {
      if (!row.role || !row.name) continue;
      const state = actorState(row);
      if (!state || state !== stateParam) continue;
      const aliasHit = aliasResolver?.resolve(row.name, state) ?? null;
      const effectiveName = aliasHit?.canonical_name ?? row.name;
      const key = actorBucketKey(effectiveName, row.role, state);
      if (key !== targetBucketKey) continue;
      const fk = familyKey(row, rowReviewMap);
      // Skip rows the admin marked as 'duplicate' — testimony is preserved
      // in court_actors but contributes nothing to public counts or notes.
      if (fk === null) continue;
      matchingRows.push(row);
      families.add(fk);
    }

    // Hard gate: only expose notes for actors who have already crossed the
    // public-display threshold. This makes probing /notes useless for
    // looking up a single family's submission.
    if (families.size < COURT_ACTOR_PUBLIC_THRESHOLD) {
      return Response.json({ notes: [], count: 0 });
    }

    // Dedup notes per family — one family writing the same note twice
    // appears once. Pick the longest non-empty note for each family.
    //
    // If an admin promotes an AI/regex-discovered row to counted, strip the
    // internal source tag before showing the underlying family-written text.
    //
    // If this row is the primary of a comment-merge, replace its original
    // notes with the admin-edited merged_comment so all of the same
    // reporter's testimony shows publicly under one display entry.
    const notesByFamily = new Map<string, { note: string; month: string | null }>();
    for (const row of matchingRows) {
      const merged = commentMergeMap.get(row.id);
      const sourceText = merged ?? (row.notes ?? "").trim();
      if (!sourceText) continue;
      // cleanPublicNote strips the internal [extracted_*] tags; merged
      // comments are already admin-edited so the strip is a no-op there.
      const note = cleanPublicNote(sourceText);
      if (!note) continue;
      const fk = familyKey(row, rowReviewMap);
      if (fk === null) continue;
      const month = isoMonth(row.created_at);
      const existing = notesByFamily.get(fk);
      // Prefer merged_comment over any plain note for the same family,
      // even if a plain note happens to be longer character-wise.
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
