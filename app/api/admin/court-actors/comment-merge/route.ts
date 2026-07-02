import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../../lib/require-auth";

/**
 * Admin-only: merge comments from N duplicate rows into one primary row's
 * display text, without losing either testimony.
 *
 *   GET                                list all merges
 *   GET ?primary_row_ids=a,b,c        list merges for a subset of primaries
 *
 *   POST  { primary_row_id, merged_row_ids: [...], merged_comment }
 *         Upserts the merge:
 *           - reads the EXISTING merge row first to capture the prior
 *             merged_row_ids (needed for stale cleanup below).
 *           - writes/overwrites the row in court_actor_comment_merges.
 *           - upserts a court_actor_row_review entry with decision
 *             'merge_comments' for each merged_row_id (so public read paths
 *             skip their original notes while their families still count).
 *           - clears row_review entries for rows that USED TO be in this
 *             merge but are no longer (admin unchecked them during edit).
 *             Scoped to decision='merge_comments' so we never clobber a
 *             separate 'duplicate' or 'count_separately' decision.
 *
 *   DELETE { primary_row_id }
 *         Removes the merge entirely:
 *           - deletes the row in court_actor_comment_merges.
 *           - deletes any court_actor_row_review entries with
 *             decision='merge_comments' for the merged rows (back to
 *             "normal" — they re-enter family counts).
 *
 * Original court_actors rows are NEVER touched. Reporter testimony stays
 * preserved in court_actors.notes for every row, including merged ones.
 *
 * Verification path (run after migration 023 is applied):
 *   1. Pick a cluster with 3+ rows from one reporter (e.g. Bud Dale @ KS,
 *      reporter@redacted.invalid — 3 rows).
 *   2. Open the cluster in /admin Possible Matches, click "Merge comments"
 *      on row A, check rows B + C, save.
 *      → court_actor_comment_merges has 1 row (primary=A, merged=[B, C]).
 *      → court_actor_row_review has 2 new rows (B, C) with decision='merge_comments'.
 *      → /api/survey/court-actors/notes for that actor returns the merged_comment.
 *   3. Click "Edit merged comment" on row A, uncheck row C, save.
 *      → court_actor_comment_merges still has 1 row, merged=[B] only.
 *      → court_actor_row_review for C is GONE (this is the bug-fix path).
 *      → C's original note can be considered again for public display.
 *   4. Click "Undo merge" on row A.
 *      → court_actor_comment_merges row gone.
 *      → court_actor_row_review entry for B (the remaining merged row)
 *        with decision='merge_comments' is also gone.
 *      → Display reverts to "longest note wins" again.
 */

type MergeRow = {
  primary_row_id: string;
  merged_row_ids: string[];
  merged_comment: string;
  decided_by: string | null;
  decided_at: string;
  updated_at: string;
};

async function requireAdminEmail() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email) ? user.email : null;
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return Boolean(error.message && /Could not find the table/i.test(error.message));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    if (!(await requireAdminEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const primaryParam = searchParams.get("primary_row_ids");
    const primaries = primaryParam
      ? primaryParam.split(",").map(s => s.trim()).filter(Boolean)
      : null;

    const sb = createAdminSupabaseClient();
    let query = sb
      .from("court_actor_comment_merges")
      .select("primary_row_id, merged_row_ids, merged_comment, decided_by, decided_at, updated_at")
      .order("decided_at", { ascending: false });
    if (primaries && primaries.length > 0) query = query.in("primary_row_id", primaries);

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error)) {
        return Response.json({ merges: [], available: false });
      }
      console.error("comment-merge GET error:", error);
      return Response.json({ merges: [], error: error.message }, { status: 500 });
    }
    return Response.json({ merges: (data ?? []) as MergeRow[], available: true });
  } catch (err) {
    console.error("GET /api/admin/court-actors/comment-merge error:", err);
    return Response.json({ error: "Failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json();
    const primaryRowId = typeof body?.primary_row_id === "string" ? body.primary_row_id.trim() : "";
    const mergedRowIdsRaw = Array.isArray(body?.merged_row_ids) ? body.merged_row_ids : null;
    const mergedComment = typeof body?.merged_comment === "string" ? body.merged_comment.trim() : "";

    if (!UUID_RE.test(primaryRowId)) {
      return Response.json({ error: "primary_row_id must be a uuid." }, { status: 400 });
    }
    if (!mergedRowIdsRaw) {
      return Response.json({ error: "merged_row_ids must be an array." }, { status: 400 });
    }
    const mergedRowIds: string[] = [];
    for (const r of mergedRowIdsRaw) {
      if (typeof r !== "string" || !UUID_RE.test(r.trim())) {
        return Response.json({ error: "Each merged_row_ids entry must be a uuid." }, { status: 400 });
      }
      const v = r.trim();
      if (v === primaryRowId) {
        return Response.json({ error: "merged_row_ids cannot include the primary." }, { status: 400 });
      }
      if (!mergedRowIds.includes(v)) mergedRowIds.push(v);
    }
    if (mergedRowIds.length === 0) {
      return Response.json({ error: "merged_row_ids must contain at least one row id." }, { status: 400 });
    }
    if (!mergedComment) {
      return Response.json({ error: "merged_comment is required." }, { status: 400 });
    }
    if (mergedComment.length > 8000) {
      return Response.json({ error: "merged_comment must be 8000 characters or fewer." }, { status: 400 });
    }

    const sb = createAdminSupabaseClient();
    const now = new Date().toISOString();

    // Read the EXISTING merge BEFORE the upsert so we can compute which
    // previously-merged rows were dropped during this edit and clear their
    // 'merge_comments' row_review entries afterward. Reading after the
    // upsert would return the just-written row, leaving stale entries.
    const { data: priorMerge, error: priorReadError } = await sb
      .from("court_actor_comment_merges")
      .select("merged_row_ids")
      .eq("primary_row_id", primaryRowId)
      .maybeSingle();
    if (priorReadError && !isMissingTable(priorReadError)) {
      console.error("comment-merge POST prior read error:", priorReadError);
      return Response.json({ error: priorReadError.message }, { status: 500 });
    }
    const priorMergedRowIds: string[] = (priorMerge?.merged_row_ids as string[] | undefined) ?? [];

    // Upsert the merge row.
    const { data: mergeData, error: mergeError } = await sb
      .from("court_actor_comment_merges")
      .upsert(
        {
          primary_row_id: primaryRowId,
          merged_row_ids: mergedRowIds,
          merged_comment: mergedComment,
          decided_by: adminEmail,
          decided_at: now,
          updated_at: now,
        },
        { onConflict: "primary_row_id" },
      )
      .select("primary_row_id, merged_row_ids, merged_comment, decided_by, decided_at, updated_at")
      .single();

    if (mergeError) {
      const message = isMissingTable(mergeError)
        ? "The court_actor_comment_merges Supabase migration (023) needs to be run before merges can save."
        : mergeError.message;
      console.error("comment-merge POST upsert error:", mergeError);
      return Response.json({ error: message }, { status: 500 });
    }

    // Upsert review rows for the merged rows.
    const reviewRows = mergedRowIds.map(rowId => ({
      row_id: rowId,
      decision: "merge_comments" as const,
      decided_by: adminEmail,
      decided_at: now,
      updated_at: now,
    }));
    const { error: reviewError } = await sb
      .from("court_actor_row_review")
      .upsert(reviewRows, { onConflict: "row_id" });
    if (reviewError) {
      console.error("comment-merge POST review upsert error:", reviewError);
      // Don't roll back the merge row: the merge is still useful for the
      // admin UI even if the review-row write failed. Surface the error.
      return Response.json({
        merge: mergeData,
        warning: `Saved the merge but failed to mark merged rows as merge_comments in row_review: ${reviewError.message}. Original notes may still display until this is fixed.`,
      });
    }

    // Clear stale 'merge_comments' row_review entries for rows that USED TO
    // be in this merge but were unchecked during the edit. Scoped strictly
    // to decision='merge_comments' so an admin's separate 'duplicate' or
    // 'count_separately' decision on the same row is never touched.
    const newSet = new Set(mergedRowIds);
    const removedRowIds = priorMergedRowIds.filter(id => !newSet.has(id));
    let clearedRemoved = 0;
    if (removedRowIds.length > 0) {
      const { error: clearError, count } = await sb
        .from("court_actor_row_review")
        .delete({ count: "exact" })
        .in("row_id", removedRowIds)
        .eq("decision", "merge_comments");
      if (clearError) {
        console.error("comment-merge POST stale-cleanup error:", clearError);
        return Response.json({
          merge: mergeData,
          warning: `Saved the merge but failed to clear ${removedRowIds.length} stale merge_comments row_review entr${removedRowIds.length === 1 ? "y" : "ies"} for the unchecked rows: ${clearError.message}. Those rows may still hide their original notes until cleared manually.`,
        });
      }
      clearedRemoved = count ?? removedRowIds.length;
    }

    return Response.json({
      merge: mergeData,
      removed_from_merge: removedRowIds,
      cleared_review_rows: clearedRemoved,
    });
  } catch (err) {
    console.error("POST /api/admin/court-actors/comment-merge error:", err);
    return Response.json({ error: "Save failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await requireAdminEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const primaryRowId = typeof body?.primary_row_id === "string" ? body.primary_row_id.trim() : "";
    if (!UUID_RE.test(primaryRowId)) {
      return Response.json({ error: "primary_row_id must be a uuid." }, { status: 400 });
    }

    const sb = createAdminSupabaseClient();

    // Read merged_row_ids before deletion so we can clear the review rows.
    const { data: existing, error: readError } = await sb
      .from("court_actor_comment_merges")
      .select("merged_row_ids")
      .eq("primary_row_id", primaryRowId)
      .maybeSingle();
    if (readError && !isMissingTable(readError)) {
      console.error("comment-merge DELETE read error:", readError);
      return Response.json({ error: readError.message }, { status: 500 });
    }
    const mergedRowIds: string[] = (existing?.merged_row_ids as string[] | undefined) ?? [];

    const { error: delError } = await sb
      .from("court_actor_comment_merges")
      .delete()
      .eq("primary_row_id", primaryRowId);
    if (delError) {
      console.error("comment-merge DELETE error:", delError);
      return Response.json({ error: delError.message }, { status: 500 });
    }

    // Drop the row_review entries we created. Limit to decision='merge_comments'
    // so we never accidentally clear an admin's separate 'duplicate' or
    // 'count_separately' decision on the same row.
    if (mergedRowIds.length > 0) {
      const { error: revError } = await sb
        .from("court_actor_row_review")
        .delete()
        .in("row_id", mergedRowIds)
        .eq("decision", "merge_comments");
      if (revError) {
        console.error("comment-merge DELETE row_review cleanup error:", revError);
        return Response.json({
          success: true,
          warning: `Removed the merge but failed to clear row_review entries for the merged rows: ${revError.message}.`,
        });
      }
    }

    return Response.json({ success: true, cleared_review_rows: mergedRowIds.length });
  } catch (err) {
    console.error("DELETE /api/admin/court-actors/comment-merge error:", err);
    return Response.json({ error: "Delete failed." }, { status: 500 });
  }
}
