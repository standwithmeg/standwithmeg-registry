import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../../lib/require-auth";
import {
  applyMergeDiff,
  buildMergeDiff,
  type MergeChoice,
  type SurveySubmissionRow,
} from "../../../../../lib/audit-merge";

const SURVEY_FIELDS = [
  "id",
  "created_at",
  "updated_at",
  "state_of_occurrence",
  "outside_us_country",
  "case_county",
  "case_status",
  "number_of_kids",
  "system_affected",
  "time_in_system",
  "custody_status",
  "is_pro_se",
  "legal_rep_history",
  "allegation_type",
  "allegation_other_detail",
  "allegation_root_cause",
  "due_process_checklist",
  "other_allegation_details",
  "conflict_of_interest_awareness",
  "conflict_description",
  "federal_funding_influence",
  "months_lost_parenting_time",
  "lost_milestones_description",
  "attorney_fees",
  "gal_fees",
  "therapy_eval_fees",
  "reunification_fees",
  "other_court_actors_fees",
  "lost_wages",
  "asset_liquidation_loss",
  "total_financial_loss",
  "impact_quote",
  "permission_to_share",
  "first_name",
  "last_name",
  "email",
  "user_id",
  "approved",
  "ip_hash",
].join(",");

async function requireAdminEmail(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email) ? user.email : null;
}

function isSameFamily(a: SurveySubmissionRow, b: SurveySubmissionRow): boolean {
  const aEmail = (a.email ?? "").trim().toLowerCase();
  const bEmail = (b.email ?? "").trim().toLowerCase();
  if (!aEmail || !bEmail || aEmail !== bEmail) return false;
  const aState = (a.state_of_occurrence ?? "").trim().toUpperCase();
  const bState = (b.state_of_occurrence ?? "").trim().toUpperCase();
  return aState === bState;
}

/**
 * GET /api/admin/reporting-audit/merge?winner=<id>&loser=<id>
 *
 * Returns a preview of the merge: both rows, the per-field diff with
 * smart-default choices, and the final merged values. Used by the admin
 * UI to render the side-by-side preview before the admin confirms.
 *
 * Both rows must share email + state — merging across different families
 * is intentionally not supported.
 */
export async function GET(request: Request) {
  try {
    if (!(await requireAdminEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const winnerId = searchParams.get("winner");
    const loserId = searchParams.get("loser");
    if (!winnerId || !loserId) {
      return Response.json({ error: "winner and loser ids are required." }, { status: 400 });
    }
    if (winnerId === loserId) {
      return Response.json({ error: "winner and loser must be different rows." }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();
    const { data, error } = await adminSupabase
      .from("survey_submissions")
      .select(SURVEY_FIELDS)
      .in("id", [winnerId, loserId]);

    if (error) {
      console.error("merge preview select error:", error);
      return Response.json({ error: "Failed to load rows." }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as SurveySubmissionRow[];
    const winner = rows.find(r => r.id === winnerId);
    const loser = rows.find(r => r.id === loserId);
    if (!winner || !loser) {
      return Response.json({ error: "One or both rows could not be found." }, { status: 404 });
    }
    if (!isSameFamily(winner, loser)) {
      return Response.json({
        error: "Refusing to merge: rows do not share the same email + state.",
      }, { status: 400 });
    }

    const diffs = buildMergeDiff(winner, loser);
    const mergedUpdates = applyMergeDiff(winner, loser, diffs);

    return Response.json({
      winner,
      loser,
      diffs,
      merged_updates: mergedUpdates,
    });
  } catch (err) {
    console.error("GET /api/admin/reporting-audit/merge error:", err);
    return Response.json({ error: "Failed to load merge preview." }, { status: 500 });
  }
}

/**
 * POST /api/admin/reporting-audit/merge
 *
 * Performs the merge:
 *   1. Loads both rows fresh from Supabase (re-derives diff)
 *   2. Applies admin's per-field overrides on top of smart defaults
 *   3. UPDATEs winner row with merged values + recomputed total_financial_loss
 *   4. Reassigns court_actors.submission_id from loser to winner
 *   5. DELETEs loser row
 *   6. Records both decisions in admin_review_decisions for audit
 *
 * Body:
 *   {
 *     winner_id: string,
 *     loser_id: string,
 *     state: string,
 *     overrides?: Record<string, "winner" | "loser">
 *   }
 */
export async function POST(request: Request) {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const winnerId = String(body.winner_id ?? "").trim();
    const loserId = String(body.loser_id ?? "").trim();
    const state = String(body.state ?? "").trim().toUpperCase();
    const overrides = (body.overrides ?? {}) as Record<string, MergeChoice>;

    if (!winnerId || !loserId || winnerId === loserId) {
      return Response.json({ error: "winner_id and loser_id are required and must differ." }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();

    // Re-fetch both rows so the merge always uses current Supabase state,
    // not whatever the client cached.
    const { data, error: selectError } = await adminSupabase
      .from("survey_submissions")
      .select(SURVEY_FIELDS)
      .in("id", [winnerId, loserId]);

    if (selectError) {
      console.error("merge select error:", selectError);
      return Response.json({ error: "Failed to load rows for merge." }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as SurveySubmissionRow[];
    const winner = rows.find(r => r.id === winnerId);
    const loser = rows.find(r => r.id === loserId);
    if (!winner || !loser) {
      return Response.json({ error: "One or both rows could not be found." }, { status: 404 });
    }
    if (!isSameFamily(winner, loser)) {
      return Response.json({
        error: "Refusing to merge: rows do not share the same email + state.",
      }, { status: 400 });
    }

    const diffs = buildMergeDiff(winner, loser);
    const updates = applyMergeDiff(winner, loser, diffs, overrides);
    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "Nothing to merge — rows are identical." }, { status: 400 });
    }

    // 1. Update the winner row with merged values
    const { error: updateError } = await adminSupabase
      .from("survey_submissions")
      .update(updates)
      .eq("id", winnerId);

    if (updateError) {
      console.error("merge update winner error:", updateError);
      return Response.json({ error: "Failed to update winner row." }, { status: 500 });
    }

    // 2. Reassign any court_actors that were attached to the loser. Best-effort
    //    — if this fails, we still want the merge to complete with the warning
    //    so admin can manually fix orphans.
    let actorReassignWarning: string | null = null;
    const { error: actorsError } = await adminSupabase
      .from("court_actors")
      .update({ submission_id: winnerId })
      .eq("submission_id", loserId);

    if (actorsError) {
      console.error("merge reassign court_actors warning:", actorsError);
      actorReassignWarning = `Court actors could not be reassigned: ${actorsError.message}`;
    }

    // 3. Delete the loser row
    const { error: deleteError } = await adminSupabase
      .from("survey_submissions")
      .delete()
      .eq("id", loserId);

    if (deleteError) {
      console.error("merge delete loser error:", deleteError);
      return Response.json({
        error: "Winner was updated but loser could not be deleted. Please retry or remove manually.",
        warning: actorReassignWarning,
      }, { status: 500 });
    }

    // 4. Audit trail. Best-effort — never fail the merge over this.
    try {
      await adminSupabase
        .from("admin_review_decisions")
        .upsert([
          {
            source_table: "survey_submissions",
            source_id: loserId,
            state: state || null,
            decision: "merged",
            decided_by: adminEmail,
            decided_at: new Date().toISOString(),
          },
          {
            source_table: "survey_submissions",
            source_id: winnerId,
            state: state || null,
            decision: "keep",
            decided_by: adminEmail,
            decided_at: new Date().toISOString(),
          },
        ], { onConflict: "source_table,source_id" });
    } catch (auditErr) {
      console.error("merge audit log warning (non-blocking):", auditErr);
    }

    return Response.json({
      success: true,
      winner_id: winnerId,
      deleted_id: loserId,
      updated_fields: Object.keys(updates),
      warning: actorReassignWarning,
    });
  } catch (err) {
    console.error("POST /api/admin/reporting-audit/merge error:", err);
    return Response.json({ error: "Merge failed." }, { status: 500 });
  }
}
