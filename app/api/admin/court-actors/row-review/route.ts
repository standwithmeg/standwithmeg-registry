import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../../lib/require-auth";

/**
 * Admin-only: soft-review a single court_actors row.
 *
 *   POST   { row_id, decision: "duplicate" | "count_separately", note? }
 *          Upserts the review (one decision per row).
 *
 *   DELETE { row_id }
 *          Removes the review (back to "normal" — row counts via the
 *          standard email|location family-key dedupe).
 *
 *   GET                          list all reviews
 *   GET ?row_ids=a,b,c          list reviews for a subset
 *
 * Original court_actors row is NEVER deleted. Reporter testimony is
 * preserved. This is purely a counting/visibility flag.
 */

type ReviewRow = {
  id: string;
  row_id: string;
  decision: "duplicate" | "count_separately";
  note: string | null;
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

export async function GET(request: Request) {
  try {
    if (!(await requireAdminEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const rowIdsParam = searchParams.get("row_ids");
    const rowIds = rowIdsParam
      ? rowIdsParam.split(",").map(s => s.trim()).filter(Boolean)
      : null;

    const sb = createAdminSupabaseClient();
    let query = sb
      .from("court_actor_row_review")
      .select("id, row_id, decision, note, decided_by, decided_at, updated_at")
      .order("decided_at", { ascending: false });
    if (rowIds && rowIds.length > 0) query = query.in("row_id", rowIds);

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error)) {
        return Response.json({ reviews: [], available: false });
      }
      console.error("row-review GET error:", error);
      return Response.json({ reviews: [], error: error.message }, { status: 500 });
    }
    return Response.json({ reviews: (data ?? []) as ReviewRow[], available: true });
  } catch (err) {
    console.error("GET /api/admin/court-actors/row-review error:", err);
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
    const rowId = typeof body?.row_id === "string" ? body.row_id.trim() : "";
    const decision = body?.decision;
    const note = typeof body?.note === "string" ? body.note.trim() : null;

    if (!rowId) {
      return Response.json({ error: "row_id is required." }, { status: 400 });
    }
    if (decision !== "duplicate" && decision !== "count_separately") {
      return Response.json({ error: "decision must be 'duplicate' or 'count_separately'." }, { status: 400 });
    }
    if (note && note.length > 2000) {
      return Response.json({ error: "note must be 2000 characters or fewer." }, { status: 400 });
    }

    const sb = createAdminSupabaseClient();
    const { data, error } = await sb
      .from("court_actor_row_review")
      .upsert(
        {
          row_id: rowId,
          decision,
          note,
          decided_by: adminEmail,
          decided_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "row_id" },
      )
      .select("id, row_id, decision, note, decided_by, decided_at, updated_at")
      .single();

    if (error) {
      const message = isMissingTable(error)
        ? "The court_actor_row_review Supabase migration (022) needs to be run before row decisions can save."
        : error.message;
      console.error("row-review POST error:", error);
      return Response.json({ error: message }, { status: 500 });
    }
    return Response.json({ review: data });
  } catch (err) {
    console.error("POST /api/admin/court-actors/row-review error:", err);
    return Response.json({ error: "Save failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await requireAdminEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const rowId = typeof body?.row_id === "string" ? body.row_id.trim() : "";
    if (!rowId) {
      return Response.json({ error: "row_id is required." }, { status: 400 });
    }
    const sb = createAdminSupabaseClient();
    const { error } = await sb
      .from("court_actor_row_review")
      .delete()
      .eq("row_id", rowId);
    if (error) {
      console.error("row-review DELETE error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/court-actors/row-review error:", err);
    return Response.json({ error: "Delete failed." }, { status: 500 });
  }
}
