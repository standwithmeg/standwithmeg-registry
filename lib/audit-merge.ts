/**
 * Shared merge logic for combining two duplicate survey_submissions rows
 * into one. Used by both the admin merge preview UI and the server-side
 * merge endpoint so the preview always matches what the server would do.
 *
 * Smart defaults per field type:
 *   - Free-text strings: longer non-empty wins, tie-break to winner
 *   - Numeric fees / int counts: max of the two
 *   - Bool: OR (true wins)
 *   - Permission-to-share enum: most permissive
 *   - Created_at: earliest preserved
 *   - String enums: winner unless empty, then loser
 *   - String[] (due_process_checklist): union, deduped
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
  pick: (a: unknown, b: unknown) => MergeChoice;
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

function pickLongerString(a: unknown, b: unknown): MergeChoice {
  const aStr = typeof a === "string" ? a : "";
  const bStr = typeof b === "string" ? b : "";
  if (isEmpty(aStr) && !isEmpty(bStr)) return "loser";
  if (!isEmpty(aStr) && isEmpty(bStr)) return "winner";
  return bStr.length > aStr.length ? "loser" : "winner";
}

function pickMaxNumber(a: unknown, b: unknown): MergeChoice {
  return asNumber(b) > asNumber(a) ? "loser" : "winner";
}

function pickWinnerUnlessEmpty(a: unknown, b: unknown): MergeChoice {
  if (isEmpty(a) && !isEmpty(b)) return "loser";
  return "winner";
}

function pickPermission(a: unknown, b: unknown): MergeChoice {
  const aRank = typeof a === "string" ? PERMISSION_RANK[a] ?? -1 : -1;
  const bRank = typeof b === "string" ? PERMISSION_RANK[b] ?? -1 : -1;
  return bRank > aRank ? "loser" : "winner";
}

function pickBoolOr(a: unknown, b: unknown): MergeChoice {
  return b === true && a !== true ? "loser" : "winner";
}

function pickEarliest(a: unknown, b: unknown): MergeChoice {
  const aMs = typeof a === "string" ? Date.parse(a) : NaN;
  const bMs = typeof b === "string" ? Date.parse(b) : NaN;
  if (isNaN(aMs) && !isNaN(bMs)) return "loser";
  if (!isNaN(aMs) && isNaN(bMs)) return "winner";
  return bMs < aMs ? "loser" : "winner";
}

const FIELD_RULES: FieldRule[] = [
  { field: "created_at",                     label: "Submitted at",         pick: pickEarliest },
  { field: "case_county",                    label: "County",               pick: pickWinnerUnlessEmpty },
  { field: "case_status",                    label: "Case status",          pick: pickWinnerUnlessEmpty },
  { field: "number_of_kids",                 label: "Children",             pick: pickMaxNumber },
  { field: "system_affected",                label: "System",               pick: pickWinnerUnlessEmpty },
  { field: "time_in_system",                 label: "Time in system",       pick: pickWinnerUnlessEmpty },
  { field: "custody_status",                 label: "Custody",              pick: pickWinnerUnlessEmpty },
  { field: "is_pro_se",                      label: "Pro se",               pick: pickBoolOr },
  { field: "legal_rep_history",              label: "Legal history",        pick: pickWinnerUnlessEmpty },
  { field: "allegation_type",                label: "Allegation type",      pick: pickWinnerUnlessEmpty },
  { field: "allegation_other_detail",        label: "Allegation detail",    pick: pickLongerString },
  { field: "allegation_root_cause",          label: "Root cause",           pick: pickLongerString },
  { field: "other_allegation_details",       label: "Other allegations",    pick: pickLongerString },
  { field: "conflict_of_interest_awareness", label: "Conflict awareness",   pick: pickWinnerUnlessEmpty },
  { field: "conflict_description",           label: "Conflict description", pick: pickLongerString },
  { field: "federal_funding_influence",      label: "Federal funding",      pick: pickWinnerUnlessEmpty },
  { field: "months_lost_parenting_time",     label: "Months lost",          pick: pickMaxNumber },
  { field: "lost_milestones_description",    label: "Lost milestones",      pick: pickLongerString },
  { field: "attorney_fees",                  label: "Attorney fees",        pick: pickMaxNumber },
  { field: "gal_fees",                       label: "GAL fees",             pick: pickMaxNumber },
  { field: "therapy_eval_fees",              label: "Therapy/eval fees",    pick: pickMaxNumber },
  { field: "reunification_fees",             label: "Reunification fees",   pick: pickMaxNumber },
  { field: "other_court_actors_fees",        label: "Other actor fees",     pick: pickMaxNumber },
  { field: "lost_wages",                     label: "Lost wages",           pick: pickMaxNumber },
  { field: "asset_liquidation_loss",         label: "Asset/property loss",  pick: pickMaxNumber },
  { field: "impact_quote",                   label: "Quote",                pick: pickLongerString },
  { field: "permission_to_share",            label: "Permission",           pick: pickPermission },
  { field: "first_name",                     label: "First name",           pick: pickWinnerUnlessEmpty },
  { field: "last_name",                      label: "Last name",            pick: pickWinnerUnlessEmpty },
  { field: "approved",                       label: "Approved",             pick: pickBoolOr },
];

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

  for (const rule of FIELD_RULES) {
    const winnerValue = winner[rule.field];
    const loserValue = loser[rule.field];
    if (valuesEqual(winnerValue, loserValue)) continue;
    const defaultChoice = rule.pick(winnerValue, loserValue);
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
