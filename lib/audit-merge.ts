/**
 * Shared merge logic for combining two duplicate survey_submissions rows
 * into one. Used by both the admin merge preview UI and the server-side
 * merge endpoint so the preview always matches what the server would do.
 *
 * Smart defaults (updated 2026-05-13 — see Bug #5):
 *   - Every field defaults to the NEWEST submission's value (by created_at),
 *     unless that value is empty — in which case the older non-empty value
 *     is kept so we don't lose data.
 *   - SAFETY EXCEPTIONS (these IGNORE the "newest wins" rule):
 *       - permission_to_share: most-PRIVATE wins (data_only > anonymous >
 *         first_name > public). Prevents a "newer = public" reply from
 *         exposing someone who originally chose anonymous.
 *       - due_process_checklist: UNION of both rows' flags (we never lose
 *         a reported due-process violation).
 *       - created_at: earliest preserved (audit history).
 *   - The admin can override any per-field pick in the UI before commit.
 */

const PERMISSION_RANK: Record<string, number> = {
  data_only: 0,
  anonymous: 1,
  first_name: 2,
  public: 3,
};

const FEE_FIELDS = [
  "attorney_fees",
  "gal_fees",
  "therapy_eval_fees",
  "reunification_fees",
  "other_court_actors_fees",
  "lost_wages",
  "asset_liquidation_loss",
] as const;

export type SurveySubmissionRow = {
  id: string;
  created_at: string | null;
  updated_at?: string | null;
  state_of_occurrence: string | null;
  outside_us_country: string | null;
  case_county: string | null;
  case_status: string | null;
  number_of_kids: number | null;
  system_affected: string | null;
  time_in_system: string | null;
  custody_status: string | null;
  is_pro_se: boolean | null;
  legal_rep_history: string | null;
  allegation_type: string | null;
  allegation_other_detail: string | null;
  allegation_root_cause: string | null;
  due_process_checklist: string[] | null;
  other_allegation_details: string | null;
  conflict_of_interest_awareness: string | null;
  conflict_description: string | null;
  federal_funding_influence: string | null;
  months_lost_parenting_time: number | null;
  lost_milestones_description: string | null;
  attorney_fees: number | null;
  gal_fees: number | null;
  therapy_eval_fees: number | null;
  reunification_fees: number | null;
  other_court_actors_fees: number | null;
  lost_wages: number | null;
  asset_liquidation_loss: number | null;
  total_financial_loss: number | null;
  impact_quote: string | null;
  permission_to_share: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  user_id?: string | null;
  approved: boolean | null;
  ip_hash?: string | null;
};

export type MergeChoice = "winner" | "loser";

export type MergeFieldDiff = {
  field: keyof SurveySubmissionRow;
  label: string;
  winnerValue: unknown;
  loserValue: unknown;
  defaultChoice: MergeChoice;
  mergedValue: unknown;
};

type FieldRule = {
  field: keyof SurveySubmissionRow;
  label: string;
};

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function asNumber(v: unknown): number {
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$,]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function pickEarliest(a: unknown, b: unknown): MergeChoice {
  const aMs = typeof a === "string" ? Date.parse(a) : NaN;
  const bMs = typeof b === "string" ? Date.parse(b) : NaN;
  if (isNaN(aMs) && !isNaN(bMs)) return "loser";
  if (!isNaN(aMs) && isNaN(bMs)) return "winner";
  return bMs < aMs ? "loser" : "winner";
}

function pickMorePrivate(a: unknown, b: unknown): MergeChoice {
  // Lowest PERMISSION_RANK wins (data_only=0 most private, public=3 least).
  // Unknown values rank as "very exposed" (99) so we never default to them.
  const aRank = typeof a === "string" && a in PERMISSION_RANK ? PERMISSION_RANK[a] : 99;
  const bRank = typeof b === "string" && b in PERMISSION_RANK ? PERMISSION_RANK[b] : 99;
  return bRank < aRank ? "loser" : "winner";
}

/**
 * "Newest wins" default: prefer the value from whichever row was submitted
 * most recently (by created_at). If the newer row's value is empty, fall
 * back to the older row's value so we don't silently lose data.
 */
function pickNewerNonEmpty(
  winnerValue: unknown,
  loserValue: unknown,
  winnerNewer: boolean
): MergeChoice {
  const newerValue = winnerNewer ? winnerValue : loserValue;
  const olderValue = winnerNewer ? loserValue : winnerValue;
  if (isEmpty(newerValue) && !isEmpty(olderValue)) {
    return winnerNewer ? "loser" : "winner";
  }
  return winnerNewer ? "winner" : "loser";
}

// FIELD_RULES is now {field, label} only — every field uses the unified
// "newest wins, safety overrides" logic in buildMergeDiff below.
const FIELD_RULES: FieldRule[] = [
  { field: "created_at",                     label: "Submitted at" },
  { field: "case_county",                    label: "County" },
  { field: "case_status",                    label: "Case status" },
  { field: "number_of_kids",                 label: "Children" },
  { field: "system_affected",                label: "System" },
  { field: "time_in_system",                 label: "Time in system" },
  { field: "custody_status",                 label: "Custody" },
  { field: "is_pro_se",                      label: "Pro se" },
  { field: "legal_rep_history",              label: "Legal history" },
  { field: "allegation_type",                label: "Allegation type" },
  { field: "allegation_other_detail",        label: "Allegation detail" },
  { field: "allegation_root_cause",          label: "Root cause" },
  { field: "other_allegation_details",       label: "Other allegations" },
  { field: "conflict_of_interest_awareness", label: "Conflict awareness" },
  { field: "conflict_description",           label: "Conflict description" },
  { field: "federal_funding_influence",      label: "Federal funding" },
  { field: "months_lost_parenting_time",     label: "Months lost" },
  { field: "lost_milestones_description",    label: "Lost milestones" },
  { field: "attorney_fees",                  label: "Attorney fees" },
  { field: "gal_fees",                       label: "GAL fees" },
  { field: "therapy_eval_fees",              label: "Therapy/eval fees" },
  { field: "reunification_fees",             label: "Reunification fees" },
  { field: "other_court_actors_fees",        label: "Other actor fees" },
  { field: "lost_wages",                     label: "Lost wages" },
  { field: "asset_liquidation_loss",         label: "Asset/property loss" },
  { field: "impact_quote",                   label: "Quote" },
  { field: "permission_to_share",            label: "Permission" },
  { field: "first_name",                     label: "First name" },
  { field: "last_name",                      label: "Last name" },
  { field: "approved",                       label: "Approved" },
];

function isWinnerNewer(winner: SurveySubmissionRow, loser: SurveySubmissionRow): boolean {
  const w = winner.created_at ? Date.parse(winner.created_at) : 0;
  const l = loser.created_at ? Date.parse(loser.created_at) : 0;
  // Tie → keep the existing winner (stable, predictable).
  return w >= l;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isEmpty(a) && isEmpty(b)) return true;
  if (typeof a === "number" || typeof b === "number") return asNumber(a) === asNumber(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  return false;
}

/**
 * Compute the per-field diff between winner and loser. Only fields where
 * values actually differ are returned, each with a defaultChoice that the
 * server will use unless the admin overrides.
 */
export function buildMergeDiff(
  winner: SurveySubmissionRow,
  loser: SurveySubmissionRow
): MergeFieldDiff[] {
  const diffs: MergeFieldDiff[] = [];
  const winnerNewer = isWinnerNewer(winner, loser);

  for (const rule of FIELD_RULES) {
    const winnerValue = winner[rule.field];
    const loserValue = loser[rule.field];
    if (valuesEqual(winnerValue, loserValue)) continue;

    let defaultChoice: MergeChoice;
    if (rule.field === "permission_to_share") {
      // SAFETY: more private wins regardless of submission date.
      defaultChoice = pickMorePrivate(winnerValue, loserValue);
    } else if (rule.field === "created_at") {
      // Preserve earliest submission timestamp for audit history.
      defaultChoice = pickEarliest(winnerValue, loserValue);
    } else {
      // Everyone else: newest submission's value wins (unless empty).
      defaultChoice = pickNewerNonEmpty(winnerValue, loserValue, winnerNewer);
    }

    const mergedValue = defaultChoice === "winner" ? winnerValue : loserValue;
    diffs.push({
      field: rule.field,
      label: rule.label,
      winnerValue,
      loserValue,
      defaultChoice,
      mergedValue,
    });
  }

  // Due process checklist is a union, not a winner/loser pick.
  const winnerList = Array.isArray(winner.due_process_checklist) ? winner.due_process_checklist : [];
  const loserList = Array.isArray(loser.due_process_checklist) ? loser.due_process_checklist : [];
  if (winnerList.length || loserList.length) {
    const merged = Array.from(new Set([...winnerList, ...loserList]));
    if (merged.length !== winnerList.length || merged.some((v, i) => v !== winnerList[i])) {
      diffs.push({
        field: "due_process_checklist",
        label: "Due process checklist",
        winnerValue: winnerList,
        loserValue: loserList,
        defaultChoice: "winner",
        mergedValue: merged,
      });
    }
  }

  return diffs;
}

/**
 * Apply the diff (with optional per-field overrides) to produce the final
 * merged field values that should be UPDATEd onto the winner row. Also
 * recomputes total_financial_loss from the merged fee fields.
 */
export function applyMergeDiff(
  winner: SurveySubmissionRow,
  loser: SurveySubmissionRow,
  diffs: MergeFieldDiff[],
  overrides: Partial<Record<keyof SurveySubmissionRow, MergeChoice>> = {}
): Partial<SurveySubmissionRow> {
  const updates: Record<string, unknown> = {};

  for (const diff of diffs) {
    const choice = overrides[diff.field] ?? diff.defaultChoice;
    if (diff.field === "due_process_checklist") {
      updates[diff.field] = diff.mergedValue;
      continue;
    }
    updates[diff.field] = choice === "winner" ? diff.winnerValue : diff.loserValue;
  }

  // Recompute total_financial_loss from the (possibly merged) fee fields.
  const merged = { ...winner, ...updates } as SurveySubmissionRow;
  let total = 0;
  for (const f of FEE_FIELDS) {
    total += asNumber(merged[f]);
  }
  updates.total_financial_loss = total;
  updates.updated_at = new Date().toISOString();

  return updates as Partial<SurveySubmissionRow>;
}
