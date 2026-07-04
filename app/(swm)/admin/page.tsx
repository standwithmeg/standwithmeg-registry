"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorBucketKeyWithLocation, actorLooseNameKey } from "../../../lib/court-actors";
import { COURT_ACTOR_ROLE_OPTIONS, courtActorRoleOptionOrOther, normalizeCourtActorRoleLabel } from "../../../lib/court-actor-roles";
import { PossibleMatchesPanel } from "./_components/PossibleMatchesPanel";
import { SocialPostQueuePanel } from "./_components/SocialPostQueuePanel";
import { PhotoIntakePanel } from "./_components/PhotoIntakePanel";
import { GmailAdminPanel } from "./_components/GmailAdminPanel";
import { AdminCommandCenter, AdminSectionShell } from "./_components/AdminCommandCenter";

const GOLD  = "#C9A227";
const BG    = "#0F1E30";  // deep dark navy for page background

// Fires a workflow_dispatch on GitHub. The workflow regenerates one location
// PDF plus that location's public court actor share pages (or all 30+
// locations when state is blank), commits to main, and Vercel redeploys. UI polls
// GitHub after dispatch so admins can see whether it queued, started,
// completed, or failed.
type RegenerateStatus = "idle" | "pending" | "queued" | "running" | "done" | "error";
type RegenerateResult = {
  message?: string;
  workflow_url?: string;
  run_id?: number;
  run_url?: string;
  run_status?: string;
  run_conclusion?: string | null;
};

const REGEN_POLL_INTERVAL_MS = 10_000;
const REGEN_POLL_ATTEMPTS = 60;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function dispatchRegenerate(state: string): Promise<RegenerateResult> {
  const res = await fetch("/api/admin/regenerate-state-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, force: true }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return {
    message: json.message || "Regeneration queued.",
    workflow_url: json.workflow_url,
    run_id: json.run_id,
    run_url: json.run_url,
    run_status: json.run_status,
    run_conclusion: json.run_conclusion,
  };
}

async function fetchRegenerateStatus(runId: number): Promise<RegenerateResult> {
  const res = await fetch(`/api/admin/regenerate-state-pdf?run_id=${encodeURIComponent(String(runId))}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return {
    workflow_url: json.workflow_url,
    run_id: json.run_id,
    run_url: json.run_url,
    run_status: json.run_status,
    run_conclusion: json.run_conclusion,
  };
}

function statusFromRun(result: RegenerateResult): RegenerateStatus {
  if (result.run_status === "completed") {
    return result.run_conclusion === "success" ? "done" : "error";
  }
  if (result.run_status === "in_progress") return "running";
  if (result.run_status) return "queued";
  return "queued";
}

function regenerateMessage(result: RegenerateResult, state: string) {
  const target = state
    ? `${state}.pdf + ${state} actor share pages`
    : "all 30+ location PDFs + actor share pages";
  if (result.run_status === "completed") {
    return result.run_conclusion === "success"
      ? `GitHub Actions finished regenerating ${target}. Vercel should redeploy after the commit.`
      : `GitHub Actions ended with "${result.run_conclusion || "failed"}" for ${target}. Open the run for details.`;
  }
  if (result.run_status === "in_progress") {
    return `GitHub Actions is running for ${target}.`;
  }
  if (result.run_status) {
    return `GitHub Actions is ${result.run_status} for ${target}.`;
  }
  return result.message || `Regeneration queued for ${target}.`;
}

async function pollRegenerateRun(
  runId: number,
  state: string,
  onUpdate: (result: RegenerateResult, status: RegenerateStatus, message: string) => void
) {
  for (let attempt = 0; attempt < REGEN_POLL_ATTEMPTS; attempt += 1) {
    await sleep(REGEN_POLL_INTERVAL_MS);
    const result = await fetchRegenerateStatus(runId);
    const status = statusFromRun(result);
    onUpdate(result, status, regenerateMessage(result, state));
    if (status === "done" || status === "error") return;
  }
}

function RegenerateStateButton({ state }: { state: string }) {
  const [status, setStatus] = useState<RegenerateStatus>("idle");
  const [msg, setMsg] = useState("");
  const [workflowUrl, setWorkflowUrl] = useState<string | null>(null);
  async function click(e: React.MouseEvent) {
    e.stopPropagation();
    if (status === "pending") return;
    setStatus("pending");
    setMsg("");
    try {
      const result = await dispatchRegenerate(state);
      const nextStatus = statusFromRun(result);
      setStatus(nextStatus);
      setMsg(regenerateMessage(result, state));
      setWorkflowUrl(result.run_url ?? result.workflow_url ?? null);
      if (result.run_id && nextStatus !== "done" && nextStatus !== "error") {
        void pollRegenerateRun(result.run_id, state, (pollResult, pollStatus, pollMsg) => {
          setStatus(pollStatus);
          setMsg(pollMsg);
          setWorkflowUrl(pollResult.run_url ?? pollResult.workflow_url ?? result.run_url ?? result.workflow_url ?? null);
          if (pollStatus === "done" || pollStatus === "error") {
            setTimeout(() => setStatus("idle"), 10 * 60 * 1000);
          }
        }).catch(err => {
          setStatus("error");
          setMsg(err instanceof Error ? err.message : "Failed to check workflow status.");
          setTimeout(() => setStatus("idle"), 8000);
        });
      } else {
        setTimeout(() => setStatus("idle"), 10 * 60 * 1000);
      }
    } catch (err) {
      setStatus("error");
      setMsg(err instanceof Error ? err.message : "Failed");
      setTimeout(() => setStatus("idle"), 6000);
    }
  }
  const label = status === "pending"
    ? "..."
    : status === "queued"
    ? "Queued"
    : status === "running"
    ? "Running"
    : status === "done"
    ? "Done ✓"
    : status === "error"
    ? "failed"
    : "Regen PDF + slides";
  const color = status === "done" ? "#22c55e" : status === "error" ? "#ef4444" : GOLD;
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={click}
        disabled={status === "pending" || status === "queued" || status === "running"}
        title={msg || (workflowUrl ? `Check ${workflowUrl}` : `Regenerate ${state}.pdf and actor share pages from live Supabase data`)}
        className="text-xs px-2 py-1 rounded-md font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: "rgba(201,162,39,0.15)", color, border: `1px solid ${color}40` }}
      >
        {label}
      </button>
      {workflowUrl && status !== "idle" && (
        <a
          href={workflowUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-[10px] underline underline-offset-2"
          style={{ color: "rgba(245,245,245,0.55)" }}
        >
          Actions
        </a>
      )}
    </span>
  );
}

function RegenerateAllButton() {
  const [status, setStatus] = useState<RegenerateStatus>("idle");
  const [msg, setMsg] = useState("");
  const [workflowUrl, setWorkflowUrl] = useState<string | null>(null);
  async function click() {
    if (status === "pending") return;
    if (!window.confirm("Regenerate PDFs and actor share pages for every location with 30+ submissions? Takes ~5-10 min.")) return;
    setStatus("pending");
    try {
      const result = await dispatchRegenerate("");
      const nextStatus = statusFromRun(result);
      setStatus(nextStatus);
      setMsg(regenerateMessage(result, ""));
      setWorkflowUrl(result.run_url ?? result.workflow_url ?? null);
      if (result.run_id && nextStatus !== "done" && nextStatus !== "error") {
        void pollRegenerateRun(result.run_id, "", (pollResult, pollStatus, pollMsg) => {
          setStatus(pollStatus);
          setMsg(pollMsg);
          setWorkflowUrl(pollResult.run_url ?? pollResult.workflow_url ?? result.run_url ?? result.workflow_url ?? null);
          if (pollStatus === "done" || pollStatus === "error") {
            setTimeout(() => setStatus("idle"), 10 * 60 * 1000);
          }
        }).catch(err => {
          setStatus("error");
          setMsg(err instanceof Error ? err.message : "Failed to check workflow status.");
          setTimeout(() => setStatus("idle"), 8000);
        });
      } else {
        setTimeout(() => setStatus("idle"), 10 * 60 * 1000);
      }
    } catch (err) {
      setStatus("error");
      setMsg(err instanceof Error ? err.message : "Failed");
      setTimeout(() => setStatus("idle"), 8000);
    }
  }
  const label = status === "pending"
    ? "Queuing..."
    : status === "queued"
    ? "Queued in Actions"
    : status === "running"
    ? "Running in Actions"
    : status === "done"
    ? "Done ✓"
    : status === "error"
    ? "Failed"
    : "Regenerate PDFs + actor slides";
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={click}
        disabled={status === "pending" || status === "queued" || status === "running"}
        title={msg || (workflowUrl ? `Check ${workflowUrl}` : "Queue a workflow run that regenerates every 30+ location PDF and court actor share page")}
        className="text-xs px-3 py-2 rounded-lg font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: `1px solid rgba(201,162,39,0.4)` }}
      >
        {label}
      </button>
      {workflowUrl && status !== "idle" && (
        <a
          href={workflowUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs underline underline-offset-2"
          style={{ color: "rgba(245,245,245,0.6)" }}
        >
          Open run
        </a>
      )}
    </span>
  );
}

type StateRow = {
  state: string;
  is_us: boolean;
  total_submissions: number;
  approved_count: number;
  avg_financial_loss: number | null;
  total_financial_loss: number | null;
  avg_months_lost: number | null;
  total_loss_count: number;
  pro_se_count: number;
  last_submission_at: string;
};

type RecentRow = {
  id: string;
  created_at: string;
  state_of_occurrence: string | null;
  outside_us_country: string | null;
  case_county: string | null;
  case_status: string | null;
  system_affected: string | null;
  custody_status: string | null;
  total_financial_loss: number | null;
  approved: boolean;
  permission_to_share: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  impact_quote: string | null;
  number_of_kids: number | null;
  time_in_system: string | null;
  is_pro_se: boolean | string | null;
  legal_rep_history: string | null;
  allegation_type: string | null;
  allegation_other_detail: string | null;
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
};

type Stats = {
  total: number;
  by_state: StateRow[];
  recent: RecentRow[];
  financials: { total_loss: number; avg_loss: number; count_with_financials: number };
};

type AuditStatus = "ok" | "not_eligible" | "missing_pdf" | "count_mismatch" | "stale_pdf";

type ReportingAuditRow = {
  state: string;
  is_us: boolean;
  dashboard_families: number;
  deduped_view_families: number | null;
  delta_dashboard_vs_deduped: number | null;
  report_eligible: boolean;
  pdf_available: boolean;
  pdf_index_families: number | null;
  pdf_count_delta: number | null;
  reporting_status: AuditStatus;
  shareable_quotes: number;
  public_court_actors: number;
  total_reported_loss: number | null;
  avg_reported_loss: number | null;
  avg_months_lost: number | null;
  no_contact_count: number;
  pro_se_count: number;
  latest_submission_at: string | null;
  pdf_url: string | null;
  pdf_size_kb: number | null;
};

type ReportingAuditSummary = {
  total_rows: number;
  eligible_states: number;
  pdfs_available: number;
  mismatches: number;
  missing_pdfs: number;
  stale_pdfs: number;
  generated_at: string;
};

type AuditReviewRow = {
  id: string;
  source_table: "survey_submissions" | "legacy_submissions";
  data_source: string | null;
  created_at: string | null;
  imported_at: string | null;
  state: string;
  email: string | null;
  is_placeholder_email: boolean;
  first_name: string | null;
  last_name: string | null;
  case_county: string | null;
  case_status: string | null;
  number_of_kids: number | null;
  system_affected: string | null;
  allegation_type: string | null;
  time_in_system: string | null;
  custody_status: string | null;
  is_pro_se: string | boolean | null;
  legal_rep_history: string | null;
  months_lost_parenting_time: number | null;
  total_financial_loss: number | string | null;
  attorney_fees: number | null;
  gal_fees: number | null;
  therapy_eval_fees: number | null;
  reunification_fees: number | null;
  other_court_actors_fees: number | null;
  lost_wages: number | null;
  asset_liquidation_loss: number | null;
  impact_quote: string | null;
  permission_to_share: string | null;
  approved: boolean | null;
  family_key: string;
  dedupe_winner: boolean;
  review_decision: "keep" | "delete" | "count_separately" | "superseded" | null;
  reviewed_at: string | null;
};

type AuditReviewGroup = {
  family_key: string;
  email: string | null;
  rows: AuditReviewRow[];
};

type AuditReviewData = {
  state: string;
  summary: {
    raw_rows: number;
    deduped_families: number;
    duplicate_groups: number;
    hidden_by_dedupe: number;
    placeholder_email_groups?: number;
    financial_fingerprint_groups?: number;
  };
  duplicate_groups: AuditReviewGroup[];
  placeholder_email_groups?: AuditReviewGroup[];
  financial_fingerprint_groups?: AuditReviewGroup[];
  rows: AuditReviewRow[];
};

type QuoteRow = {
  id: string;
  first_name: string | null;
  permission_to_share: string;
  impact_quote: string | null;
  created_at: string;
  case_county: string | null;
};

type SurveySubmissionDetailCourtActor = {
  id: string;
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  notes: string | null;
  source: string | null;
  created_at: string;
};

type SurveySubmissionDetailData = {
  submission: RecentRow;
  court_actors: SurveySubmissionDetailCourtActor[];
};

function fmt$(n: number | null) {
  if (n == null || n === 0) return "—";
  return "$" + n.toLocaleString();
}

function fmtNum(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function auditStatusMeta(status: AuditStatus) {
  switch (status) {
    case "ok":
      return { label: "OK", color: "rgb(134,239,172)", bg: "rgba(74,222,128,0.14)", border: "rgba(74,222,128,0.28)" };
    case "missing_pdf":
      return { label: "Missing PDF", color: "rgb(252,165,165)", bg: "rgba(185,28,28,0.18)", border: "rgba(185,28,28,0.38)" };
    case "count_mismatch":
      return { label: "Mismatch", color: "rgb(253,224,71)", bg: "rgba(234,179,8,0.16)", border: "rgba(234,179,8,0.35)" };
    case "stale_pdf":
      return { label: "Stale PDF", color: "rgb(251,146,60)", bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.32)" };
    default:
      return { label: "Not eligible", color: "rgba(245,245,245,0.45)", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)" };
  }
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function latestInState(iso: string) {
  const date = new Date(iso);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function exactTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayName(row: RecentRow) {
  if (row.permission_to_share === "anonymous" || !row.first_name) return "Anonymous";
  if (row.permission_to_share === "first_name") return row.first_name[0] + ".";
  return row.first_name;
}

function publicSubmissionDisplayName(submission: Pick<RecentRow, "permission_to_share" | "first_name">) {
  const permission = (submission.permission_to_share ?? "").trim();
  if (permission === "anonymous" || !submission.first_name) return "Anonymous";
  if (permission === "first_name") return `${submission.first_name[0]}.`;
  return submission.first_name;
}

function permissionToShareBadge(permission: string | null) {
  const perm = (permission ?? "").trim();
  switch (perm) {
    case "public":
      return { label: "public", color: "rgb(134,239,172)", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.28)" };
    case "first_name":
      return { label: "first name", color: "rgb(147,197,253)", bg: "rgba(59,130,246,0.14)", border: "rgba(59,130,246,0.28)" };
    case "anonymous":
      return { label: "anonymous", color: GOLD, bg: "rgba(201,162,39,0.14)", border: "rgba(201,162,39,0.28)" };
    case "data_only":
      return { label: "data only", color: "rgb(248,113,113)", bg: "rgba(185,28,28,0.15)", border: "rgba(185,28,28,0.3)" };
    default:
      return { label: perm || "unknown", color: "rgba(245,245,245,0.55)", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)" };
  }
}

function normalizeActorRole(role: string) {
  return normalizeCourtActorRoleLabel(role).trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeActorSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}



function shortDate(iso: string | null) {
  if (!iso) return "No date";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function auditReviewName(row: AuditReviewRow) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || "No name";
}

function auditReviewSource(row: AuditReviewRow) {
  return row.source_table === "survey_submissions" ? "Current survey" : row.data_source || "Legacy import";
}

function auditRowKey(row: AuditReviewRow) {
  return `${row.source_table}:${row.id}`;
}

function auditGroupCountedFamilies(group: AuditReviewGroup) {
  const separateRows = group.rows.filter(row => row.review_decision === "count_separately").length;
  const hasNormalDedupeRow = group.rows.some(row =>
    row.review_decision !== "count_separately"
    && row.review_decision !== "delete"
    && row.review_decision !== "superseded"
  );
  return separateRows + (hasNormalDedupeRow ? 1 : 0);
}

function auditGroupReviewed(group: AuditReviewGroup) {
  // A superseded/delete decision removes that row from public/reporting counts,
  // so the group no longer needs review once only one countable row remains.
  const activeRows = group.rows.filter(row => row.review_decision !== "delete" && row.review_decision !== "superseded");
  if (activeRows.length <= 1) return true;
  return group.rows.every(row => row.review_decision !== null);
}

function auditReviewBoolean(value: string | boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value == null || value === "") return "—";
  return String(value);
}

function auditReviewValue(value: string | number | boolean | null) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function auditReviewMoney(value: number | string | null) {
  const amount = Number(value);
  return Number.isFinite(amount) ? fmt$(amount) : "—";
}

function auditReviewDecisionLabel(row: AuditReviewRow) {
  if (row.review_decision === "keep") return `Same family${row.reviewed_at ? ` on ${shortDate(row.reviewed_at)}` : ""}`;
  if (row.review_decision === "count_separately") return `Different case${row.reviewed_at ? ` on ${shortDate(row.reviewed_at)}` : ""}`;
  if (row.review_decision === "superseded") return `Superseded${row.reviewed_at ? ` on ${shortDate(row.reviewed_at)}` : ""}`;
  if (row.review_decision === "delete") return `Deleted/hidden${row.reviewed_at ? ` on ${shortDate(row.reviewed_at)}` : ""}`;
  return "Not reviewed";
}

function AuditReviewDetails({ row }: { row: AuditReviewRow }) {
  const fields: Array<[string, string]> = [
    ["Source", auditReviewSource(row)],
    ["Source table", row.source_table],
    ["Source ID", row.id],
    ["Created", shortDate(row.created_at)],
    ["Imported", shortDate(row.imported_at)],
    ["Email", auditReviewValue(row.email)],
    ["State", row.state],
    ["County", auditReviewValue(row.case_county)],
    ["Case status", auditReviewValue(row.case_status)],
    ["Children", auditReviewValue(row.number_of_kids)],
    ["System affected", auditReviewValue(row.system_affected)],
    ["Time in system", auditReviewValue(row.time_in_system)],
    ["Custody status", auditReviewValue(row.custody_status)],
    ["Pro se", auditReviewBoolean(row.is_pro_se)],
    ["Legal history", auditReviewValue(row.legal_rep_history)],
    ["Months lost", auditReviewValue(row.months_lost_parenting_time)],
    ["Total loss", auditReviewMoney(row.total_financial_loss)],
    ["Permission", auditReviewValue(row.permission_to_share)],
    ["Approved", row.approved === null ? "—" : row.approved ? "Yes" : "No"],
    ["Dedupe family key", row.family_key],
    ["Count status", row.dedupe_winner ? "Counted by current rule" : "Hidden by current dedupe rule"],
    ["Admin review", auditReviewDecisionLabel(row)],
  ];

  return (
    <details className="mt-3 rounded-lg overflow-hidden"
      style={{ backgroundColor: "rgba(0,0,0,0.14)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <summary className="cursor-pointer px-3 py-2 text-[11px] font-bold uppercase tracking-wide"
        style={{ color: GOLD }}>
        View full survey fields
      </summary>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px"
        style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
        {fields.map(([label, value]) => (
          <div key={`${row.source_table}-${row.id}-${label}`} className="px-3 py-2"
            style={{ backgroundColor: "rgba(15,30,48,0.94)" }}>
            <div className="text-[10px] uppercase tracking-wide font-bold"
              style={{ color: "rgba(245,245,245,0.34)" }}>
              {label}
            </div>
            <div className="mt-0.5 text-xs break-words"
              style={{ color: "rgba(245,245,245,0.74)" }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      {row.impact_quote && (
        <div className="px-3 py-3"
          style={{ backgroundColor: "rgba(15,30,48,0.94)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="text-[10px] uppercase tracking-wide font-bold"
            style={{ color: "rgba(245,245,245,0.34)" }}>
            Full quote
          </div>
          <blockquote className="mt-1 text-xs italic"
            style={{ color: "rgba(245,245,245,0.72)" }}>
            &ldquo;{row.impact_quote}&rdquo;
          </blockquote>
        </div>
      )}
    </details>
  );
}

type NudgeTarget = {
  actor_id?: string;
  email: string;
  name: string;
  subject: string;
  body: string;
  html: string;
};

type NudgeFamilySource = {
  id: string;
  name: string;
  role: string;
  submission_id: string;
  reporter_email: string | null;
  reporter_name: string | null;
  notes: string | null;
  state_code?: string | null;
  location_key?: string | null;
};

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function nudgeBodyToHtml(body: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const escaped = escapeHtml(part)
        .replace(
          /https:\/\/my\.standwithmeg\.com\/survey/g,
          '<a href="https://my.standwithmeg.com/survey" style="color:#B91C1C;font-weight:700;">https://my.standwithmeg.com/survey</a>'
        )
        .replace(
          /https:\/\/my\.standwithmeg\.com\/court-actor-update\?submission=[A-Za-z0-9%._~=-]+(?:&amp;actor=[A-Za-z0-9%._~=-]+)?/g,
          match => `<a href="${match}" style="color:#B91C1C;font-weight:700;">${match}</a>`
        )
        .replace(/\n/g, "<br>");
      return `<p>${escaped}</p>`;
    })
    .join("");

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:600px;">${paragraphs}</div>`;
}

const SOCIAL_POST_TOAST_MESSAGES: Record<string, string> = {
  "already-approved": "That post was already approved.",
  approved: "Post approved and moved to Approved to post.",
  "approved-and-posted": "Post approved and published to Blotato.",
  "approved-but-blotato-not-configured": "Post approved, but Blotato is not configured for auto-publish.",
  "approved-but-publish-failed": "Post approved, but Blotato publish did not complete.",
};

export default function AdminPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [stats, setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [socialToast, setSocialToast] = useState<string | null>(null);
  const courtActorsSectionRef = useRef<HTMLDivElement | null>(null);
  const courtActorDeepLinkHandledRef = useRef(false);

  const patternKey = useCallback((agg: AdminActorAgg) => {
    if (agg.actor_bucket_key) return agg.actor_bucket_key;
    return actorBucketKeyWithLocation(agg.name, agg.role, agg.location_key ?? agg.state_code);
  }, []);

  const [sortField, setSortField] = useState<keyof StateRow>("total_submissions");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc");
  const [approving, setApproving] = useState<string | null>(null);

  // Detail modal — view all fields for a single submission
  const [detailRow, setDetailRow] = useState<RecentRow | null>(null);
  const [surveyDetail, setSurveyDetail] = useState<{
    open: boolean;
    loading: boolean;
    data: SurveySubmissionDetailData | null;
    error: string | null;
  }>({
    open: false,
    loading: false,
    data: null,
    error: null,
  });

  // Court actors panel — all actors + aggregates
  type AdminActor = {
    id: string;
    role: string;
    name: string;
    court_or_county: string | null;
    state_code: string | null;
    location_key: string | null;
    effective_actor_bucket_key?: string | null;
    notes: string | null;
    source: string;
    created_at: string;
    submission_id: string;
    nudge_sent_at: string | null;
    nudge_sent_by: string | null;
    nudge_sent_to: string | null;
    nudge_last_subject: string | null;
    reporter_email: string | null;
    reporter_name: string | null;
    reporter_permission: string | null;
    reporter_approved: boolean | null;
    counts_publicly?: boolean | null;
    review_decision?: string | null;
    merge_primary_for?: string[] | null;
    merged_into?: string | null;
    merged_comment?: string | null;
  };
  type AdminActorAgg = {
    role: string;
    name: string;
    state_code: string | null;
    location_key: string | null;
    court_or_county: string | null;
    count: number;
    row_ids?: string[] | null;
    actor_bucket_key?: string | null;
    deploy_slug?: string | null;
    deploy_state_abbr?: string | null;
    deployable?: boolean;
    deployed?: boolean;
    deployment_pending?: boolean;
    share_url?: string | null;
    photo_url?: string | null;
    photo_size_kb?: number | null;
    photo_suspect?: boolean;
    photo_suspect_reason?: string | null;
  };
  const [adminActors, setAdminActors] = useState<AdminActor[]>([]);
  const [adminActorAggs, setAdminActorAggs] = useState<AdminActorAgg[]>([]);
  type ActorCommentMergeForm = { mergedRowIds: string[]; mergedComment: string };
  const [actorCommentMergeOpen, setActorCommentMergeOpen] = useState<string | null>(null);
  const [actorCommentMergeForms, setActorCommentMergeForms] = useState<Record<string, ActorCommentMergeForm>>({});
  const [actorCommentMergeBusy, setActorCommentMergeBusy] = useState<string | null>(null);

  // Court-actor search/filter (applies to Patterns + All Reports views).
  // Source defaults to "form_direct" so the admin sees counted rows first;
  // toggle to "all" to include AI/regex extractions awaiting promotion.
  const [actorSearch, setActorSearch] = useState("");
  const [actorLocationFilter, setActorLocationFilter] = useState("");
  const [actorRoleFilter, setActorRoleFilter] = useState("");
  type ActorSourceFilter = "all" | "form_direct" | "extracted_ai" | "extracted_regex";
  const [actorSourceFilter, setActorSourceFilter] = useState<ActorSourceFilter>("all");
  type ActorSortMode = "default" | "group_near_dupes";
  const [actorSortMode, setActorSortMode] = useState<ActorSortMode>("default");
  type ActorEditDraft = { name: string; role: string; court_or_county: string };
  const emptyActorEditDraft: ActorEditDraft = { name: "", role: "", court_or_county: "" };
  const [editingActorId, setEditingActorId] = useState<string | null>(null);
  const [actorEditDraft, setActorEditDraft] = useState<ActorEditDraft>(emptyActorEditDraft);
  const [savingActorEdit, setSavingActorEdit] = useState<string | null>(null);
  const [editingPatternKey, setEditingPatternKey] = useState<string | null>(null);
  const [patternEditDraft, setPatternEditDraft] = useState<ActorEditDraft>(emptyActorEditDraft);
  const [savingPatternEdit, setSavingPatternEdit] = useState<string | null>(null);
  const [showOnlyUndeployedPublic, setShowOnlyUndeployedPublic] = useState(false);
  const [showOnlySuspectPhotos, setShowOnlySuspectPhotos] = useState(false);
  const [actorFinderQuery, setActorFinderQuery] = useState("");
  const [actorFinderOpen, setActorFinderOpen] = useState(false);
  const [selectedActorKey, setSelectedActorKey] = useState<string | null>(null);
  type ActorPossibleClusterSample = {
    row_id: string;
    name?: string | null;
    role?: string | null;
    reporter_email?: string | null;
    submission_id?: string | null;
  };
  type ActorPossibleClusterVariant = {
    display_name: string;
    name_key: string;
    roles?: string[];
    counties?: string[];
    samples?: ActorPossibleClusterSample[];
  };
  type ActorPossibleCluster = {
    cluster_key: string;
    location_key: string | null;
    variants: ActorPossibleClusterVariant[];
    highest_confidence?: number;
    total_family_count?: number;
  };
  const [possibleMatchClusters, setPossibleMatchClusters] = useState<ActorPossibleCluster[]>([]);
  const [possibleMatchLoading, setPossibleMatchLoading] = useState(false);
  const [possibleMatchError, setPossibleMatchError] = useState<string | null>(null);
  const [possibleMatchSearchSeed, setPossibleMatchSearchSeed] = useState({ query: "", location: "" });
  type DeployActorModalState = {
    slug: string;
    state_abbr: string;
    display_name: string;
    photo_file: File | null;
    status: "idle" | "deploying" | "success" | "error";
    message: string | null;
  };
  const [deployActorModal, setDeployActorModal] = useState<DeployActorModalState | null>(null);
  type ReplacePhotoModalState = {
    slug: string;
    state_abbr: string;
    display_name: string;
    photo_file: File | null;
    status: "idle" | "uploading" | "success" | "error";
    message: string | null;
  };
  const [replacePhotoModal, setReplacePhotoModal] = useState<ReplacePhotoModalState | null>(null);
  const [recentlyDeployedActorKeys, setRecentlyDeployedActorKeys] = useState<Set<string>>(() => new Set());
  const [repairingActorKey, setRepairingActorKey] = useState<string | null>(null);
  const [pushingSocialBucket, setPushingSocialBucket] = useState<string | null>(null);

  // ── Photo-request workflow tile ──────────────────────────────────
  type PhotoRequestRecent = {
    id: string;
    canonical_name: string;
    location_key: string;
    reporter_email: string;
    status: "sent" | "skipped" | "failed" | "pending";
    email_subject: string | null;
    sent_at: string | null;
    error_message: string | null;
    created_at: string;
  };
  type PhotoRequestSummary = {
    totals: {
      would_send: number;
      already_sent: number;
      previously_failed: number;
      sent_last_7d: number;
      failed_last_7d: number;
      last_sent_at: string | null;
    };
    recent: PhotoRequestRecent[];
  };
  const [photoRequests, setPhotoRequests] = useState<PhotoRequestSummary | null>(null);
  const [photoRequestsExpanded, setPhotoRequestsExpanded] = useState(false);
  type ActorView = "by_state" | "patterns" | "possible_matches" | "all" | "actor_detail";
  const [actorView, setActorView] = useState<ActorView>("by_state");
  const [expandedState, setExpandedState] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<ReportingAuditRow[]>([]);
  const [auditSummary, setAuditSummary] = useState<ReportingAuditSummary | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditReview, setAuditReview] = useState<AuditReviewData | null>(null);
  const [auditReviewContext, setAuditReviewContext] = useState<ReportingAuditRow | null>(null);
  const [auditReviewLoading, setAuditReviewLoading] = useState(false);
  const [auditReviewError, setAuditReviewError] = useState<string | null>(null);
  const [auditReviewFinishing, setAuditReviewFinishing] = useState(false);
  const [deletingAuditRow, setDeletingAuditRow] = useState<string | null>(null);
  const [keepingAuditRow, setKeepingAuditRow] = useState<string | null>(null);
  const [countingSeparatelyAuditRow, setCountingSeparatelyAuditRow] = useState<string | null>(null);
  const [supersedingAuditGroup, setSupersedingAuditGroup] = useState<string | null>(null);
  const [restoringAuditRow, setRestoringAuditRow] = useState<string | null>(null);
  const [showReviewedAuditGroups, setShowReviewedAuditGroups] = useState(false);

  // Quote modal
  const [quoteModal, setQuoteModal] = useState<{ state: string; is_us: boolean; total: number } | null>(null);
  const [modalQuotes, setModalQuotes]   = useState<QuoteRow[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalQuoteError, setModalQuoteError] = useState<string | null>(null);

  async function openSubmissionDetail(submissionId: string) {
    setSurveyDetail({ open: true, loading: true, data: null, error: null });
    try {
      const res = await fetch(`/api/admin/survey-submission/${submissionId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Failed to load survey submission.");
      }
      setSurveyDetail({
        open: true,
        loading: false,
        data: json as SurveySubmissionDetailData,
        error: null,
      });
    } catch (err) {
      setSurveyDetail({
        open: true,
        loading: false,
        data: null,
        error: err instanceof Error ? err.message : "Network error.",
      });
    }
  }

  function closeSurveyDetail() {
    setSurveyDetail({ open: false, loading: false, data: null, error: null });
  }

  async function openQuoteModal(row: StateRow) {
    if (row.approved_count === 0) return;
    setQuoteModal({ state: row.state, is_us: row.is_us, total: row.total_submissions });
    setModalQuotes([]);
    setModalQuoteError(null);
    setModalLoading(true);
    try {
      const res = await fetch(
        `/api/admin/state-quotes?state=${encodeURIComponent(row.state)}&is_us=${row.is_us}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A failed fetch must not masquerade as "no quotes found".
        setModalQuoteError((data as { error?: string }).error ?? "Could not load quotes. Try again.");
      } else {
        setModalQuotes((data as { quotes?: QuoteRow[] }).quotes ?? []);
      }
    } catch (err) {
      setModalQuoteError(err instanceof Error ? err.message : "Network error loading quotes.");
    } finally {
      setModalLoading(false);
    }
  }

  function closeModal() { setQuoteModal(null); setModalQuotes([]); setModalQuoteError(null); }

  const applyActorData = useCallback((data: { actors?: AdminActor[]; aggregates?: AdminActorAgg[] }) => {
    setAdminActors(data.actors ?? []);
    setAdminActorAggs(data.aggregates ?? []);
  }, []);

  const refreshActors = useCallback(async () => {
    const actorsRes = await fetch("/api/admin/court-actors");
    const actorsData = await actorsRes.json().catch(() => ({ actors: [], aggregates: [] }));
    if (!actorsRes.ok) {
      throw new Error(actorsData.error || "Failed to reload court actors.");
    }
    applyActorData(actorsData);
  }, [applyActorData]);

  useEffect(() => {
    const toastKey = searchParams.get("toast");
    const toastError = searchParams.get("error");
    if (!toastKey && !toastError) return;

    const message = toastError
      || (toastKey ? SOCIAL_POST_TOAST_MESSAGES[toastKey] : null)
      || (toastKey ? `Social post action: ${toastKey.replace(/-/g, " ")}` : null);
    if (message) setSocialToast(message);

    router.replace("/admin", { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    const actorQuery = searchParams.get("court_actor_q");
    const bucket = searchParams.get("court_bucket");
    const stateFilter = searchParams.get("court_state");
    const openPhoto = searchParams.get("open_photo") === "1";
    if (!actorQuery && !bucket) return;
    if (courtActorDeepLinkHandledRef.current) return;
    if (adminActorAggs.length === 0) return;

    let match = bucket
      ? adminActorAggs.find(agg => patternKey(agg).toLowerCase() === bucket.toLowerCase())
      : null;
    if (!match && actorQuery) {
      const normalized = actorQuery.trim().toLowerCase();
      match = adminActorAggs.find(agg =>
        agg.name.trim().toLowerCase() === normalized
        && (!stateFilter || (agg.location_key ?? agg.state_code ?? "").toUpperCase() === stateFilter.toUpperCase()),
      );
    }
    if (!match && actorQuery) {
      const needle = actorQuery.trim().toLowerCase();
      match = adminActorAggs.find(agg => agg.name.trim().toLowerCase().includes(needle));
    }

    courtActorDeepLinkHandledRef.current = true;
    if (actorQuery) setActorSearch(actorQuery);
    if (stateFilter) setActorLocationFilter(stateFilter);
    setActorView("actor_detail");
    if (match) {
      setSelectedActorKey(patternKey(match));
      setActorFinderQuery(match.name);
    }

    requestAnimationFrame(() => {
      courtActorsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (openPhoto && match) {
        const state = match.deploy_state_abbr ?? match.location_key ?? match.state_code ?? "";
        const slug = match.deploy_slug ?? "";
        if (state && slug) {
          setReplacePhotoModal({
            slug,
            state_abbr: state,
            display_name: match.name,
            photo_file: null,
            status: "idle",
            message: null,
          });
        }
      }
    });

    router.replace("/admin", { scroll: false });
  }, [searchParams, adminActorAggs, router, patternKey]);

  function rowsForPattern(agg: AdminActorAgg, rows: AdminActor[] = adminActors) {
    if (agg.row_ids?.length) {
      const rowIds = new Set(agg.row_ids);
      return rows.filter(row => rowIds.has(row.id) && (row.source ?? "form_direct") === "form_direct");
    }
    const key = patternKey(agg);
    return rows.filter(row =>
      (row.source ?? "form_direct") === "form_direct"
      && (row.effective_actor_bucket_key ?? actorBucketKeyWithLocation(row.name, row.role, row.location_key ?? row.state_code)) === key
    );
  }

  function rowsForActorDetail(agg: AdminActorAgg, rows: AdminActor[] = adminActors) {
    if (agg.row_ids?.length) {
      const rowIds = new Set(agg.row_ids);
      return rows.filter(row => rowIds.has(row.id) && (row.source ?? "form_direct") === "form_direct");
    }
    const selectedNameKey = actorLooseNameKey(agg.name);
    const selectedLocation = agg.location_key ?? agg.state_code ?? null;
    const exactKey = patternKey(agg);
    const seen = new Set<string>();
    const matched: AdminActor[] = [];
    for (const row of rows) {
      if ((row.source ?? "form_direct") !== "form_direct") continue;
      const rowLocation = row.location_key ?? row.state_code ?? null;
      const exactMatch = (row.effective_actor_bucket_key ?? actorBucketKeyWithLocation(row.name, row.role, rowLocation)) === exactKey;
      const looseNameMatch = actorLooseNameKey(row.name) === selectedNameKey && rowLocation === selectedLocation;
      if ((exactMatch || looseNameMatch) && !seen.has(row.id)) {
        seen.add(row.id);
        matched.push(row);
      }
    }
    return matched;
  }

  function resetActorFilters() {
    setActorSearch("");
    setActorFinderQuery("");
    setActorFinderOpen(false);
    setActorLocationFilter("");
    setActorRoleFilter("");
    setActorSourceFilter("all");
    setActorSortMode("default");
    setPossibleMatchSearchSeed({ query: "", location: "" });
    setShowOnlyUndeployedPublic(false);
    setShowOnlySuspectPhotos(false);
  }

  function selectActorDetail(agg: AdminActorAgg) {
    setSelectedActorKey(patternKey(agg));
    setActorFinderQuery(agg.name);
    setActorFinderOpen(false);
    setActorView("actor_detail");
    setExpandedState(null);
  }

  function openPossibleMatchesForActor(agg: AdminActorAgg) {
    if (selectedActorPossibleClusters.length === 0) {
      window.alert("No close-spelling merge cluster exists for this actor. Use the row-level Merge comments action below if duplicate testimony needs to be combined.");
      return;
    }
    setPossibleMatchSearchSeed({
      query: agg.name,
      location: agg.location_key ?? agg.state_code ?? "",
    });
    setActorFinderOpen(false);
    setActorView("possible_matches");
    setExpandedState(null);
    requestAnimationFrame(() => {
      courtActorsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function buildActorCommentMergeText(primary: AdminActor, mergedRows: AdminActor[]) {
    return [primary, ...mergedRows]
      .map(row => (row.merged_comment || row.notes || "").trim())
      .filter(Boolean)
      .join("\n\n");
  }

  function ensureActorCommentMergeForm(primary: AdminActor, rows: AdminActor[]): ActorCommentMergeForm {
    const existing = actorCommentMergeForms[primary.id];
    if (existing) return existing;
    if (primary.merge_primary_for && primary.merge_primary_for.length > 0 && primary.merged_comment) {
      return {
        mergedRowIds: [...primary.merge_primary_for],
        mergedComment: primary.merged_comment,
      };
    }
    const sameReporterRows = rows.filter(row =>
      row.id !== primary.id
      && !row.merged_into
      && primary.reporter_email
      && row.reporter_email
      && row.reporter_email.toLowerCase() === primary.reporter_email.toLowerCase()
    );
    return {
      mergedRowIds: sameReporterRows.map(row => row.id),
      mergedComment: buildActorCommentMergeText(primary, sameReporterRows),
    };
  }

  function openActorCommentMerge(primary: AdminActor, rows: AdminActor[]) {
    if (actorCommentMergeOpen === primary.id) {
      setActorCommentMergeOpen(null);
      return;
    }
    const seed = ensureActorCommentMergeForm(primary, rows);
    setActorCommentMergeForms(prev => prev[primary.id] ? prev : { ...prev, [primary.id]: seed });
    setActorCommentMergeOpen(primary.id);
  }

  function updateActorCommentMergeForm(primaryId: string, patch: Partial<ActorCommentMergeForm>) {
    setActorCommentMergeForms(prev => {
      const base = prev[primaryId] ?? { mergedRowIds: [], mergedComment: "" };
      return { ...prev, [primaryId]: { ...base, ...patch } };
    });
  }

  function toggleActorCommentMergeRow(primary: AdminActor, rows: AdminActor[], rowId: string) {
    const form = ensureActorCommentMergeForm(primary, rows);
    const nextIds = form.mergedRowIds.includes(rowId)
      ? form.mergedRowIds.filter(id => id !== rowId)
      : [...form.mergedRowIds, rowId];
    const previousAutoText = buildActorCommentMergeText(
      primary,
      rows.filter(row => form.mergedRowIds.includes(row.id))
    );
    const nextRows = rows.filter(row => nextIds.includes(row.id));
    updateActorCommentMergeForm(primary.id, {
      mergedRowIds: nextIds,
      mergedComment: form.mergedComment === previousAutoText
        ? buildActorCommentMergeText(primary, nextRows)
        : form.mergedComment,
    });
  }

  async function saveActorCommentMerge(primary: AdminActor) {
    const form = actorCommentMergeForms[primary.id];
    if (!form || form.mergedRowIds.length === 0) {
      window.alert("Pick at least one other row to merge into this primary.");
      return;
    }
    if (!form.mergedComment.trim()) {
      window.alert("Merged comment cannot be empty.");
      return;
    }
    setActorCommentMergeBusy(primary.id);
    try {
      const res = await fetch("/api/admin/court-actors/comment-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_row_id: primary.id,
          merged_row_ids: form.mergedRowIds,
          merged_comment: form.mergedComment.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error || "Merge save failed.");
        return;
      }
      if (json.warning) window.alert(json.warning);
      setActorCommentMergeOpen(null);
      setActorCommentMergeForms(prev => {
        const next = { ...prev };
        delete next[primary.id];
        return next;
      });
      await refreshActors();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Network error.");
    } finally {
      setActorCommentMergeBusy(null);
    }
  }

  async function undoActorCommentMerge(primary: AdminActor) {
    if (!window.confirm("Remove this comment merge? The merged rows will re-enter normal display rules. Original testimony is never deleted.")) return;
    setActorCommentMergeBusy(primary.id);
    try {
      const res = await fetch("/api/admin/court-actors/comment-merge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primary_row_id: primary.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error || "Undo failed.");
        return;
      }
      if (json.warning) window.alert(json.warning);
      await refreshActors();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Network error.");
    } finally {
      setActorCommentMergeBusy(null);
    }
  }

  function actorShareUrl(agg: AdminActorAgg) {
    return agg.share_url ?? null;
  }

  function actorDeployKey(agg: AdminActorAgg) {
    const state = agg.deploy_state_abbr ?? agg.location_key ?? agg.state_code ?? "";
    const slug = agg.deploy_slug ?? "";
    return state && slug ? `${state.toLowerCase()}/${slug}` : "";
  }

  async function pushActorToSocialQueue(agg: AdminActorAgg) {
    const bucketKey = patternKey(agg).toLowerCase();
    setPushingSocialBucket(bucketKey);
    try {
      const res = await fetch("/api/admin/social-post-queue/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skip_email: true,
          force_requeue: true,
          actor_bucket_key: bucketKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const staged = Array.isArray(data.staged) ? data.staged.length : 0;
      const skipped = Array.isArray(data.skipped) && data.skipped[0]
        ? String((data.skipped[0] as { reason?: string }).reason ?? "")
        : undefined;
      if (staged > 0) {
        setSocialToast(`${agg.name} added to Blotato queue — open Blotato Queue → Pending review.`);
        document.getElementById("admin-social-queue")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.alert(skipped ? `Could not queue ${agg.name}: ${skipped}` : `Nothing queued for ${agg.name}. Make sure the share page and slides are live first.`);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not push to social queue.");
    } finally {
      setPushingSocialBucket(null);
    }
  }

  async function repairActorShare(agg: AdminActorAgg) {
    const state = agg.deploy_state_abbr ?? agg.location_key ?? agg.state_code ?? "";
    const slug = agg.deploy_slug ?? "";
    const key = actorDeployKey(agg);
    if (!state || !slug || !key) {
      alert("This actor does not have a deployed US state/slug.");
      return;
    }
    if (!window.confirm(`Repair ${agg.name}'s PDF/share-slide metadata and force-regenerate ${state.toUpperCase()}?`)) return;

    setRepairingActorKey(key);
    try {
      const res = await fetch("/api/admin/court-actors/repair-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          state_abbr: state,
          display_name: agg.name,
          role: agg.role,
          court_or_county: agg.court_or_county,
          actor_bucket_key: agg.actor_bucket_key,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      window.alert(data.message || "Repair queued.");
      await refreshActors().catch(() => undefined);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Repair failed.");
    } finally {
      setRepairingActorKey(null);
    }
  }

  function openReplacePhotoModal(agg: AdminActorAgg) {
    const state = agg.deploy_state_abbr ?? agg.location_key ?? agg.state_code ?? "";
    const slug = agg.deploy_slug ?? "";
    if (!state || !slug) {
      alert("This actor does not have a deployed US state/slug.");
      return;
    }
    setReplacePhotoModal({
      slug,
      state_abbr: state,
      display_name: agg.name,
      photo_file: null,
      status: "idle",
      message: null,
    });
  }

  async function replacePhotoFromModal() {
    if (!replacePhotoModal || replacePhotoModal.status === "uploading") return;
    if (!replacePhotoModal.photo_file) {
      setReplacePhotoModal(prev => prev ? { ...prev, status: "error", message: "Choose a PNG or JPEG photo first." } : prev);
      return;
    }
    setReplacePhotoModal(prev => prev ? { ...prev, status: "uploading", message: null } : prev);
    try {
      const form = new FormData();
      form.append("slug", replacePhotoModal.slug);
      form.append("state_abbr", replacePhotoModal.state_abbr);
      form.append("photo", replacePhotoModal.photo_file);
      const res = await fetch("/api/admin/court-actors/replace-photo", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setReplacePhotoModal(prev => prev ? {
        ...prev,
        status: "success",
        message: data.message || "Photo replaced. Regeneration queued.",
      } : prev);
      await refreshActors().catch(() => undefined);
    } catch (err) {
      setReplacePhotoModal(prev => prev ? {
        ...prev,
        status: "error",
        message: err instanceof Error ? err.message : "Photo replacement failed.",
      } : prev);
    }
  }

  function slideHiddenReason(actor: AdminActor): string | null {
    if ((actor.reporter_permission ?? "").toLowerCase() === "data_only") {
      return "Hidden from public slide (data_only permission)";
    }
    if (actor.reporter_approved !== true) {
      return "Hidden from public slide (submission not approved)";
    }
    const quoteText = (actor.merged_comment || actor.notes || "").trim();
    if (!quoteText) {
      return "Hidden from public slide (no quote text)";
    }
    return null;
  }

  function actorEditFieldsFromDraft(draft: ActorEditDraft) {
    const name = draft.name.trim().replace(/\s+/g, " ");
    const role = normalizeCourtActorRoleLabel(draft.role);
    const court = draft.court_or_county.trim().replace(/\s+/g, " ");
    if (!name || !role) {
      return { error: "Name and role are required." } as const;
    }
    return { fields: { name, role, court_or_county: court || null } } as const;
  }

  function applyActorEdits(ids: string[], fields: { name?: string; role?: string; court_or_county?: string | null }) {
    const idSet = new Set(ids);
    setAdminActors(prev => prev.map(actor => idSet.has(actor.id) ? { ...actor, ...fields } : actor));
    // Re-fetch aggregates from the server so manifest asset info (photo_url,
    // share_url, deployed flags) is not lost by a client-side rebuild.
    refreshActors().catch(() => undefined);
  }

  function startActorEdit(actor: AdminActor) {
    setEditingActorId(actor.id);
    setActorEditDraft({
      name: actor.name,
      role: courtActorRoleOptionOrOther(actor.role),
      court_or_county: actor.court_or_county ?? "",
    });
  }

  function startPatternEdit(agg: AdminActorAgg) {
    setEditingPatternKey(patternKey(agg));
    setPatternEditDraft({
      name: agg.name,
      role: courtActorRoleOptionOrOther(agg.role),
      court_or_county: agg.court_or_county ?? "",
    });
  }

  async function saveActorEdit(id: string) {
    const payload = actorEditFieldsFromDraft(actorEditDraft);
    if ("error" in payload) {
      alert(payload.error);
      return;
    }
    setSavingActorEdit(id);
    try {
      const res = await fetch("/api/admin/court-actors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "edit", fields: payload.fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert("Edit failed: " + (data.error ?? res.statusText));
        return;
      }
      applyActorEdits([id], data.actor ?? payload.fields);
      setEditingActorId(null);
    } catch (err) {
      alert("Edit failed: " + (err instanceof Error ? err.message : "Network error."));
    } finally {
      setSavingActorEdit(null);
    }
  }

  async function savePatternEdit(agg: AdminActorAgg) {
    const payload = actorEditFieldsFromDraft(patternEditDraft);
    if ("error" in payload) {
      alert(payload.error);
      return;
    }
    const rows = rowsForPattern(agg);
    const ids = rows.map(row => row.id);
    if (ids.length === 0) {
      alert("No rows found for this pattern.");
      return;
    }
    if (ids.length > 200) {
      alert("This pattern has more than 200 rows. Narrow the filter before editing.");
      return;
    }
    setSavingPatternEdit(patternKey(agg));
    try {
      const res = await fetch("/api/admin/court-actors/bucket-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, fields: payload.fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert("Pattern edit failed: " + (data.error ?? res.statusText));
        return;
      }
      applyActorEdits(ids, payload.fields);
      setEditingPatternKey(null);
    } catch (err) {
      alert("Pattern edit failed: " + (err instanceof Error ? err.message : "Network error."));
    } finally {
      setSavingPatternEdit(null);
    }
  }

  function openDeployActorModal(agg: AdminActorAgg) {
    const state = agg.deploy_state_abbr ?? agg.location_key ?? agg.state_code ?? "";
    const slug = agg.deploy_slug ?? "";
    if (!state || !slug) {
      alert("This actor does not have a share-page-ready US state/slug.");
      return;
    }
    setDeployActorModal({
      slug,
      state_abbr: state,
      display_name: agg.name,
      photo_file: null,
      status: "idle",
      message: null,
    });
  }

  async function deployActorFromModal() {
    if (!deployActorModal || deployActorModal.status === "deploying") return;
    setDeployActorModal(prev => prev ? { ...prev, status: "deploying", message: null } : prev);
    try {
      const form = new FormData();
      form.append("slug", deployActorModal.slug);
      form.append("state_abbr", deployActorModal.state_abbr);
      form.append("display_name", deployActorModal.display_name);
      if (deployActorModal.photo_file) {
        form.append("photo", deployActorModal.photo_file);
      }
      const res = await fetch("/api/admin/court-actors/deploy", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setAdminActorAggs(prev => prev.map(agg => (
        agg.deploy_slug === deployActorModal.slug && agg.deploy_state_abbr === deployActorModal.state_abbr
          ? { ...agg, deployed: false, deployment_pending: true, share_url: null }
          : agg
      )));
      const deployedKey = `${deployActorModal.state_abbr.toLowerCase()}/${deployActorModal.slug}`;
      setRecentlyDeployedActorKeys(prev => {
        const next = new Set(prev);
        next.add(deployedKey);
        return next;
      });
      setDeployActorModal(prev => prev ? {
        ...prev,
        status: "success",
        message: data.message || "Share page created — regenerate to render slides.",
      } : prev);
      await refreshActors().catch(() => undefined);
    } catch (err) {
      setDeployActorModal(prev => prev ? {
        ...prev,
        status: "error",
        message: err instanceof Error ? err.message : "Deploy failed.",
      } : prev);
    }
  }

  const applyAuditData = useCallback((data: { rows?: ReportingAuditRow[]; summary?: ReportingAuditSummary | null }) => {
    setAuditRows(data.rows ?? []);
    setAuditSummary(data.summary ?? null);
    setAuditError(null);
  }, []);

  const refreshStatsAndAudit = useCallback(async () => {
    const [statsRes, auditRes] = await Promise.all([
      fetch("/api/admin/survey-stats"),
      fetch("/api/admin/reporting-audit"),
    ]);
    const statsData = await statsRes.json().catch(() => ({}));
    if (statsRes.ok) setStats(statsData);
    const auditData = await auditRes.json().catch(() => ({ rows: [], summary: null }));
    if (auditRes.ok) {
      applyAuditData(auditData);
    } else {
      setAuditRows([]);
      setAuditSummary(null);
      setAuditError(auditData.error || "Failed to load reporting audit.");
    }
  }, [applyAuditData]);

  async function loadAuditReview(state: string) {
    setAuditReviewLoading(true);
    setAuditReviewError(null);
    try {
      const res = await fetch(`/api/admin/reporting-audit/review?state=${encodeURIComponent(state)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load review data.");
      setAuditReview(data);
    } catch (err) {
      setAuditReviewError(err instanceof Error ? err.message : "Failed to load review data.");
    } finally {
      setAuditReviewLoading(false);
    }
  }

  function openAuditReview(row: ReportingAuditRow) {
    setAuditReview(null);
    setAuditReviewContext(row);
    setShowReviewedAuditGroups(false);
    void loadAuditReview(row.state);
  }

  async function finishAuditReview() {
    // Each individual Same family / Different case / Delete decision
    // already PATCHes the database immediately, so this button is not
    // what saves the work — it just gives an explicit "I'm done with
    // this state" action that re-pulls the audit table to confirm the
    // parent rows reflect the decisions, then closes the modal.
    setAuditReviewFinishing(true);
    try {
      await refreshStatsAndAudit();
    } catch (err) {
      console.error("finishAuditReview refresh failed:", err);
      window.alert("Your review decisions are saved, but the stats refresh failed — reload the page to confirm the audit table is current.");
    } finally {
      setAuditReviewFinishing(false);
      setAuditReview(null);
      setAuditReviewContext(null);
      setAuditReviewError(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Kick off all four endpoints in parallel. Each section updates
    // its own slice of state as soon as its endpoint returns, so the
    // dashboard renders the moment the fastest one is back — not
    // 10 s later when /court-actors finishes its alias/aggregate work.
    const statsPromise = fetch("/api/admin/survey-stats")
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Failed to load stats.");
          return;
        }
        setStats(data);
      })
      .catch(() => setError("Network error."));

    const actorsPromise = fetch("/api/admin/court-actors")
      .then(async res => {
        const data = await res.json().catch(() => ({ actors: [], aggregates: [] }));
        if (res.ok) applyActorData(data);
      })
      .catch(() => { /* swallow — actor list stays empty, no global blocker */ });

    const auditPromise = fetch("/api/admin/reporting-audit")
      .then(async res => {
        const data = await res.json().catch(() => ({ rows: [], summary: null }));
        if (res.ok) {
          applyAuditData(data);
        } else {
          setAuditRows([]);
          setAuditSummary(null);
          setAuditError(data.error || "Failed to load reporting audit.");
        }
      })
      .catch(() => { /* swallow — audit row failure shouldn't block dashboard */ });

    const photoReqPromise = fetch("/api/admin/court-actor-photo-requests")
      .then(async res => {
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (data?.totals) {
          setPhotoRequests({
            totals: data.totals,
            recent: Array.isArray(data.recent) ? data.recent : [],
          });
        }
      })
      .catch(() => { /* swallow */ });

    // Dismiss the global Loading dashboard… spinner as soon as stats
    // is back (drives the top tiles). Actors/audit/photos keep
    // hydrating in the background; their own sections show whatever
    // data has arrived.
    await statsPromise;
    setLoading(false);

    // Track the rest so an unhandled rejection doesn't surface later.
    void Promise.allSettled([actorsPromise, auditPromise, photoReqPromise]);
  }, [applyActorData, applyAuditData]);

  useEffect(() => { load(); }, [load]);

  // ── Filter + sort applied to Patterns + All Reports views ──────────
  // Cached so the predicate body stays in one place. Search is case-
  // insensitive, matches across name, role, location, county, source,
  // notes, and (admin-only) reporter info.
  const actorSearchQuery = normalizeActorSearchText(actorSearch);
  const actorSearchQueryCompact = actorSearchQuery.replace(/\s+/g, "");

  function actorMatchesQuery(blob: string): boolean {
    if (!actorSearchQuery) return true;
    const normalizedBlob = normalizeActorSearchText(blob);
    return normalizedBlob.includes(actorSearchQuery)
      || normalizedBlob.replace(/\s+/g, "").includes(actorSearchQueryCompact);
  }

  const allActorLocations = useMemo(() => {
    const set = new Set<string>();
    for (const a of adminActors) {
      const loc = a.location_key ?? a.state_code;
      if (loc) set.add(loc);
    }
    for (const agg of adminActorAggs) {
      const loc = agg.location_key ?? agg.state_code;
      if (loc) set.add(loc);
    }
    return Array.from(set).sort();
  }, [adminActors, adminActorAggs]);

  const allActorRoles = useMemo(() => {
    return [...COURT_ACTOR_ROLE_OPTIONS];
  }, []);

  const adminActorSearchBlobs = useMemo(() => {
    const exact = new Map<string, string[]>();
    const loose = new Map<string, string[]>();
    for (const row of adminActors) {
      if ((row.source ?? "form_direct") !== "form_direct") continue;
      const rowLocation = row.location_key ?? row.state_code ?? "";
      const rowLooseNameKey = actorLooseNameKey(row.name);
      const blob = [
        row.name,
        rowLooseNameKey,
        row.effective_actor_bucket_key ?? "",
        row.role,
        row.location_key ?? "",
        row.state_code ?? "",
        row.court_or_county ?? "",
        row.source,
        row.notes ?? "",
        row.reporter_email ?? "",
        row.reporter_name ?? "",
      ].join(" ");
      const exactKey = row.effective_actor_bucket_key ?? actorBucketKeyWithLocation(row.name, row.role, rowLocation);
      if (!exact.has(exactKey)) exact.set(exactKey, []);
      exact.get(exactKey)!.push(blob);
      const looseKey = `${rowLocation}|${rowLooseNameKey}`;
      if (!loose.has(looseKey)) loose.set(looseKey, []);
      loose.get(looseKey)!.push(blob);
    }
    return { exact, loose };
  }, [adminActors]);

  const filteredAdminActorAggs = useMemo(() => {
    const filtered = adminActorAggs.filter(agg => {
      const deployKey = agg.deploy_state_abbr && agg.deploy_slug
        ? `${agg.deploy_state_abbr.toLowerCase()}/${agg.deploy_slug}`
        : "";
      const recentlyDeployed = Boolean(deployKey && recentlyDeployedActorKeys.has(deployKey));
      if (
        showOnlyUndeployedPublic
        && !(agg.count >= COURT_ACTOR_PUBLIC_THRESHOLD && agg.deployable && !agg.deployed && !agg.deployment_pending && !recentlyDeployed)
      ) {
        return false;
      }
      if (showOnlySuspectPhotos && !(agg.deployed && agg.photo_suspect)) return false;
      if (actorLocationFilter && (agg.location_key ?? agg.state_code) !== actorLocationFilter) return false;
      if (actorRoleFilter) {
        const filterKey = normalizeActorRole(actorRoleFilter);
        if (!normalizeActorRole(agg.role).includes(filterKey)) return false;
      }
      const aggLocation = agg.location_key ?? agg.state_code ?? "";
      const rowBlob = actorSearchQuery
        ? [
          ...(adminActorSearchBlobs.exact.get(patternKey(agg)) ?? []),
          ...(adminActorSearchBlobs.loose.get(`${aggLocation}|${actorLooseNameKey(agg.name)}`) ?? []),
        ].join(" ")
        : "";
      const blob = `${agg.name} ${agg.role} ${agg.location_key ?? ""} ${agg.state_code ?? ""} ${agg.court_or_county ?? ""} ${rowBlob}`;
      return actorMatchesQuery(blob);
    });
    if (actorSortMode === "group_near_dupes") {
      return filtered.slice().sort((a, b) => {
        const locA = a.location_key ?? a.state_code ?? "";
        const locB = b.location_key ?? b.state_code ?? "";
        if (locA !== locB) return locA.localeCompare(locB);
        const keyA = actorLooseNameKey(a.name);
        const keyB = actorLooseNameKey(b.name);
        if (keyA !== keyB) return keyA.localeCompare(keyB);
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });
    }
    return filtered;
  // actorMatchesQuery closes over actorSearchQuery, so depend on the query string.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminActorAggs, adminActorSearchBlobs, actorSearchQuery, actorLocationFilter, actorRoleFilter, actorSortMode, showOnlyUndeployedPublic, showOnlySuspectPhotos, recentlyDeployedActorKeys]);

  const undeployedPublicPatterns = useMemo(() => (
    adminActorAggs.filter(agg => {
      const deployKey = agg.deploy_state_abbr && agg.deploy_slug
        ? `${agg.deploy_state_abbr.toLowerCase()}/${agg.deploy_slug}`
        : "";
      return agg.count >= COURT_ACTOR_PUBLIC_THRESHOLD
        && agg.deployable
        && !agg.deployed
        && !agg.deployment_pending
        && !(deployKey && recentlyDeployedActorKeys.has(deployKey));
    })
  ), [adminActorAggs, recentlyDeployedActorKeys]);

  const suspectPhotoPatterns = useMemo(() => (
    adminActorAggs.filter(agg => agg.deployed && agg.photo_suspect)
  ), [adminActorAggs]);

  const actorFinderSuggestions = useMemo(() => {
    const q = normalizeActorSearchText(actorFinderQuery);
    const qCompact = q.replace(/\s+/g, "");
    if (q.length < 2) return [];
    return adminActorAggs
      .filter(agg => {
        const blob = normalizeActorSearchText(`${agg.name} ${agg.role} ${agg.location_key ?? ""} ${agg.state_code ?? ""} ${agg.court_or_county ?? ""}`);
        return blob.includes(q) || blob.replace(/\s+/g, "").includes(qCompact);
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [adminActorAggs, actorFinderQuery]);

  const selectedActorAgg = useMemo(() => {
    if (!selectedActorKey) return null;
    return adminActorAggs.find(agg => patternKey(agg) === selectedActorKey) ?? null;
  // patternKey is deterministic and only uses aggregate fields.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminActorAggs, selectedActorKey]);

  const selectedActorRows = useMemo(() => (
    selectedActorAgg ? rowsForActorDetail(selectedActorAgg) : []
  // rowsForActorDetail closes over adminActors.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [selectedActorAgg, adminActors]);

  useEffect(() => {
    if (actorView !== "actor_detail" || !selectedActorAgg) return;
    let cancelled = false;
    const params = new URLSearchParams();
    const location = selectedActorAgg.location_key ?? selectedActorAgg.state_code ?? "";
    if (location) params.set("location", location);
    params.set("q", selectedActorAgg.name);
    setPossibleMatchLoading(true);
    setPossibleMatchError(null);
    fetch(`/api/admin/court-actors/possible-matches?${params.toString()}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load possible matches.");
        if (!cancelled) setPossibleMatchClusters(Array.isArray(data.clusters) ? data.clusters : []);
      })
      .catch(err => {
        if (!cancelled) {
          setPossibleMatchClusters([]);
          setPossibleMatchError(err instanceof Error ? err.message : "Failed to load possible matches.");
        }
      })
      .finally(() => {
        if (!cancelled) setPossibleMatchLoading(false);
      });
    return () => { cancelled = true; };
  }, [actorView, selectedActorAgg]);

  const selectedActorPossibleClusters = useMemo(() => {
    if (!selectedActorAgg) return [];
    const rowIds = new Set(selectedActorRows.map(row => row.id));
    const selectedLocation = selectedActorAgg.location_key ?? selectedActorAgg.state_code ?? null;
    const selectedNameKey = actorLooseNameKey(selectedActorAgg.name);
    return possibleMatchClusters.filter(cluster => {
      if ((cluster.location_key ?? null) !== selectedLocation) return false;
      return cluster.variants.some(variant =>
        variant.name_key === selectedNameKey
        || actorLooseNameKey(variant.display_name) === selectedNameKey
        || (variant.samples ?? []).some(sample => sample.row_id && rowIds.has(sample.row_id))
      );
    });
  }, [possibleMatchClusters, selectedActorAgg, selectedActorRows]);

  const filteredAdminActors = useMemo(() => {
    const filtered = adminActors.filter(a => {
      if (actorSourceFilter !== "all" && a.source !== actorSourceFilter) return false;
      if (actorLocationFilter && (a.location_key ?? a.state_code) !== actorLocationFilter) return false;
      if (actorRoleFilter) {
        const filterKey = normalizeActorRole(actorRoleFilter);
        if (!normalizeActorRole(a.role).includes(filterKey)) return false;
      }
      const blob = `${a.name} ${actorLooseNameKey(a.name)} ${a.effective_actor_bucket_key ?? ""} ${a.role} ${a.location_key ?? ""} ${a.state_code ?? ""} ${a.court_or_county ?? ""} ${a.source} ${a.notes ?? ""} ${a.reporter_email ?? ""} ${a.reporter_name ?? ""}`;
      return actorMatchesQuery(blob);
    });
    if (actorSortMode === "group_near_dupes") {
      return filtered.slice().sort((a, b) => {
        const locA = a.location_key ?? a.state_code ?? "";
        const locB = b.location_key ?? b.state_code ?? "";
        if (locA !== locB) return locA.localeCompare(locB);
        const keyA = actorLooseNameKey(a.name);
        const keyB = actorLooseNameKey(b.name);
        if (keyA !== keyB) return keyA.localeCompare(keyB);
        return a.name.localeCompare(b.name);
      });
    }
    return filtered;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminActors, actorSearchQuery, actorLocationFilter, actorRoleFilter, actorSourceFilter, actorSortMode]);

  async function toggleApprove(id: string, current: boolean) {
    setApproving(id);
    try {
      const res = await fetch("/api/admin/survey-stats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, approved: !current }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(`Could not update approval: ${(data as { error?: string }).error ?? res.statusText}`);
        return;
      }
      // The detail modal renders from its own snapshot — sync it immediately
      // so the button doesn't show the stale state (a second click would
      // silently revert the approval the admin just made).
      setDetailRow(prev => (prev && prev.id === id ? { ...prev, approved: !current } : prev));
      // Full refresh so state table approved_count and all stats stay accurate
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? `Could not update approval: ${err.message}` : "Could not update approval.");
    } finally {
      setApproving(null);
    }
  }

  async function deleteAuditReviewRow(row: AuditReviewRow) {
    const label = `${row.source_table === "survey_submissions" ? "current survey" : "legacy/import"} row for ${row.email || "no email"} in ${row.state}`;
    if (!window.confirm(`Hide this ${label} as a Delete decision? The row stays in Supabase and can be restored from Show reviewed. If this is a real separate court matter, choose Cancel and mark Different case.`)) {
      return;
    }

    setDeletingAuditRow(row.id);
    try {
      const res = await fetch("/api/admin/reporting-audit/review", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, source_table: row.source_table, state: row.state }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed.");
      updateAuditReviewRowDecision(row, "delete", new Date().toISOString());
      await loadAuditReview(row.state);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingAuditRow(null);
    }
  }

  function updateAuditReviewRowDecision(
    row: AuditReviewRow,
    decision: AuditReviewRow["review_decision"],
    reviewedAt: string | null,
  ) {
    const key = auditRowKey(row);
    const patchRow = (candidate: AuditReviewRow): AuditReviewRow => (
      auditRowKey(candidate) === key
        ? { ...candidate, review_decision: decision, reviewed_at: reviewedAt, dedupe_winner: decision === "count_separately" ? true : candidate.dedupe_winner }
        : candidate
    );
    setAuditReview(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map(patchRow),
        duplicate_groups: prev.duplicate_groups.map(group => ({
          ...group,
          rows: group.rows.map(patchRow),
        })),
        financial_fingerprint_groups: prev.financial_fingerprint_groups?.map(group => ({
          ...group,
          rows: group.rows.map(patchRow),
        })),
        placeholder_email_groups: prev.placeholder_email_groups?.map(group => ({
          ...group,
          rows: group.rows.map(patchRow),
        })),
      };
    });
  }

  async function keepAuditReviewRow(row: AuditReviewRow) {
    const key = auditRowKey(row);
    setKeepingAuditRow(key);
    const reviewedAt = new Date().toISOString();
    try {
      const res = await fetch("/api/admin/reporting-audit/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, source_table: row.source_table, state: row.state, decision: "keep" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Keep failed.");
      updateAuditReviewRowDecision(row, "keep", reviewedAt);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Keep failed.");
    } finally {
      setKeepingAuditRow(null);
    }
  }

  async function countAuditReviewRowSeparately(row: AuditReviewRow) {
    const label = `${row.source_table === "survey_submissions" ? "current survey" : "legacy/import"} row for ${row.email || "no email"} in ${row.state}`;
    if (!window.confirm(`Mark this ${label} as a Different case (real separate court matter — could be the same family with another case, or an unrelated family)? This will change dashboard, audit spreadsheet, and next PDF counts.`)) {
      return;
    }

    const key = auditRowKey(row);
    setCountingSeparatelyAuditRow(key);
    const reviewedAt = new Date().toISOString();
    try {
      const res = await fetch("/api/admin/reporting-audit/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, source_table: row.source_table, state: row.state, decision: "count_separately" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Different case decision failed to save.");
      updateAuditReviewRowDecision(row, "count_separately", reviewedAt);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Different case decision failed to save.");
    } finally {
      setCountingSeparatelyAuditRow(null);
    }
  }

  async function supersedeAuditReviewGroup(group: AuditReviewGroup) {
    const surveyRows = group.rows
      .filter(row => row.source_table === "survey_submissions")
      .sort((a, b) => {
        const aMs = a.created_at ? Date.parse(a.created_at) : 0;
        const bMs = b.created_at ? Date.parse(b.created_at) : 0;
        return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
      });
    const newest = surveyRows[0];
    const supersededRows = surveyRows.slice(1).filter(row => row.review_decision !== "superseded");
    if (!newest || supersededRows.length === 0) return;

    const label = group.email || "this same-email group";
    if (!window.confirm(`Mark ${supersededRows.length} older survey row${supersededRows.length === 1 ? "" : "s"} for ${label} as Superseded? The newest submission from ${shortDate(newest.created_at)} stays live. Older rows and court-actor rows stay in Supabase and can be restored from Show reviewed.`)) {
      return;
    }

    setSupersedingAuditGroup(group.family_key);
    try {
      await Promise.all(supersededRows.map(async row => {
        const res = await fetch("/api/admin/reporting-audit/review", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id, source_table: row.source_table, state: row.state, decision: "superseded" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Superseded decision failed to save.");
      }));
      if (auditReview?.state) await loadAuditReview(auditReview.state);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Superseded decision failed to save.");
    } finally {
      setSupersedingAuditGroup(null);
    }
  }

  async function restoreAuditReviewRow(row: AuditReviewRow) {
    const key = auditRowKey(row);
    setRestoringAuditRow(key);
    try {
      const res = await fetch("/api/admin/reporting-audit/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, source_table: row.source_table, state: row.state, decision: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Restore failed.");
      updateAuditReviewRowDecision(row, null, null);
      await loadAuditReview(row.state);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoringAuditRow(null);
    }
  }

  // Merge two duplicate survey rows into one. Backed by the smart-default
  // logic in lib/audit-merge.ts; admin can override any per-field pick
  // before committing.
  type MergeFieldDiff = {
    field: string;
    label: string;
    winnerValue: unknown;
    loserValue: unknown;
    defaultChoice: "winner" | "loser";
    mergedValue: unknown;
  };
  type MergeRow = Record<string, unknown> & { id: string };
  type MergePreview = {
    state: string;
    winner: MergeRow;
    loser: MergeRow;
    diffs: MergeFieldDiff[];
    choices: Record<string, "winner" | "loser">;
  };
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSaving, setMergeSaving] = useState(false);

  async function openMergePreview(state: string, winnerId: string, loserId: string) {
    setMergeLoading(true);
    setMergeError(null);
    try {
      const params = new URLSearchParams({ winner: winnerId, loser: loserId });
      const res = await fetch(`/api/admin/reporting-audit/merge?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMergeError(data.error || "Could not load merge preview.");
        return;
      }
      const diffs: MergeFieldDiff[] = Array.isArray(data.diffs) ? data.diffs : [];
      const choices: Record<string, "winner" | "loser"> = {};
      for (const d of diffs) choices[d.field] = d.defaultChoice;
      setMergePreview({
        state,
        winner: data.winner as MergeRow,
        loser: data.loser as MergeRow,
        diffs,
        choices,
      });
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setMergeLoading(false);
    }
  }

  async function commitMerge() {
    if (!mergePreview) return;
    setMergeSaving(true);
    setMergeError(null);
    try {
      const res = await fetch("/api/admin/reporting-audit/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          winner_id: mergePreview.winner.id,
          loser_id: mergePreview.loser.id,
          state: mergePreview.state,
          overrides: mergePreview.choices,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMergeError(data.error || "Merge failed.");
        return;
      }
      setMergePreview(null);
      await Promise.all([loadAuditReview(mergePreview.state), refreshStatsAndAudit()]);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setMergeSaving(false);
    }
  }

  // Promote an extracted actor row to form_direct (counts toward public
  // threshold). Demote reverses it. Delete removes bogus rows.
  const [actorActing, setActorActing] = useState<string | null>(null);
  async function patchActor(id: string, action: "promote" | "demote" | "delete") {
    if (action === "delete" && !confirm("Remove this actor row permanently? This can't be undone.")) return;
    setActorActing(id);

    // Snapshot for rollback if the request fails — keeps the optimistic
    // update safe even when the server rejects (auth expired, network
    // hiccup, etc.).
    const previousActors = adminActors;

    // Apply the change locally first so the row visibly updates the
    // moment the admin clicks. No /api/admin/court-actors refetch, so
    // no 10 s wait and no scroll jump back to the top.
    if (action === "delete") {
      setAdminActors(prev => prev.filter(a => a.id !== id));
    } else {
      const newSource = action === "promote" ? "form_direct" : "extracted_regex";
      setAdminActors(prev => prev.map(a => a.id === id ? { ...a, source: newSource } : a));
    }

    try {
      const res = await fetch("/api/admin/court-actors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAdminActors(previousActors);
        alert("Action failed: " + (data.error ?? res.statusText));
        return;
      }
      // Aggregates (Patterns view counts) are derived server-side with
      // alias resolution we can't faithfully reproduce client-side. Catch
      // them up with a non-blocking background refetch — the optimistic row
      // update above already gave instant feedback, and the endpoint is now
      // fast (cached asset checks + parallel pagination).
      void refreshActors().catch(() => undefined);
    } catch (err) {
      setAdminActors(previousActors);
      alert("Action failed: " + (err instanceof Error ? err.message : "Network error."));
    } finally {
      setActorActing(null);
    }
  }

  async function updateSubmissionPermission(submissionId: string, value: string) {
    const previousActors = adminActors;
    // Optimistic update: every actor row sharing this submission_id gets the new permission immediately.
    setAdminActors(prev => prev.map(a => a.submission_id === submissionId ? { ...a, reporter_permission: value } : a));
    try {
      const res = await fetch(`/api/admin/survey-submission/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission_to_share: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAdminActors(previousActors);
        alert("Permission change failed: " + (data.error ?? res.statusText));
      }
    } catch (err) {
      setAdminActors(previousActors);
      alert("Permission change failed: " + (err instanceof Error ? err.message : "Network error."));
    }
  }

  async function deleteSurveySubmission(submissionId: string) {
    if (!confirm("This deletes the ENTIRE survey submission and all its actor rows. Cannot be undone.")) return;
    const previousActors = adminActors;
    // Optimistic update: drop every row tied to this submission.
    setAdminActors(prev => prev.filter(a => a.submission_id !== submissionId));
    try {
      const res = await fetch(`/api/admin/survey-submission/${submissionId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAdminActors(previousActors);
        alert("Delete failed: " + (data.error ?? res.statusText));
      }
    } catch (err) {
      setAdminActors(previousActors);
      alert("Delete failed: " + (err instanceof Error ? err.message : "Network error."));
    }
  }

  // "Nudge" modal state — shows a pre-written email the admin can copy
  // and paste into Gmail, Outlook, or whatever mail tool they use. We
  // avoid mailto: because it's flaky (requires a default mail client set
  // up and Chrome sometimes blocks it silently).
  const [nudgeTarget, setNudgeTarget] = useState<NudgeTarget | null>(null);
  const [nudgeCopied, setNudgeCopied] = useState<"none" | "email" | "subject" | "body" | "all">("none");
  const [nudgeSending, setNudgeSending] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [nudgeSendError, setNudgeSendError] = useState<string | null>(null);

  async function sendNudgeNow() {
    if (!nudgeTarget) return;
    setNudgeSending("sending");
    setNudgeSendError(null);
    try {
      const res = await fetch("/api/admin/send-nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: nudgeTarget.email,
          subject: nudgeTarget.subject,
          body: nudgeTarget.body,
          html: nudgeBodyToHtml(nudgeTarget.body),
          actor_id: nudgeTarget.actor_id,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNudgeSending("error");
        setNudgeSendError(json.error || "Send failed.");
        return;
      }
      setNudgeSending("sent");
      await refreshActors();
    } catch (e) {
      setNudgeSending("error");
      setNudgeSendError(e instanceof Error ? e.message : "Network error.");
    }
  }

  function nudgeFamily(a: NudgeFamilySource) {
    if (!a.reporter_email) { alert("No email on file for this reporter."); return; }
    const greeting = a.reporter_name ? `Hi ${a.reporter_name.split(" ")[0]},` : "Hi,";
    const subject = "Stand With Meg — quick court actor follow-up";
    const actorName = a.name.trim();
    const normalizedName = actorName.toLowerCase();
    const hasNamedActor = Boolean(actorName) && !["unknown", "unnamed", "n/a", "na", "none", "?"].includes(normalizedName);
    const role = a.role.trim();
    const roleIsOther = !role || role.toLowerCase() === "other";
    const hasNotes = Boolean(a.notes?.trim()) && a.notes!.trim().length >= 12;
    const location = a.state_code ? ` in ${a.state_code}` : a.location_key ? ` in ${a.location_key}` : "";
    const actorLine = hasNamedActor
      ? roleIsOther
        ? `${actorName}${location}, but the role was marked "Other"`
        : `${actorName} (${role})${location}`
      : roleIsOther
        ? `an unnamed court actor${location}`
        : `an unnamed court actor listed as ${role}${location}`;
    const missingItems = [
      !hasNamedActor ? "the actor's name" : null,
      roleIsOther ? "the actor's correct role or title" : null,
      !hasNotes ? "one sentence about what that actor did or failed to do" : null,
    ].filter(Boolean);
    const followUpReason = missingItems.length > 0
      ? `I am following up because this court actor entry is missing ${missingItems.join(", ")}.`
      : "I am following up because we want the Court Actors section to be as accurate and useful as possible.";
    const updateUrl = `https://my.standwithmeg.com/court-actor-update?submission=${encodeURIComponent(a.submission_id)}&actor=${encodeURIComponent(a.id)}`;
    const body = [
      greeting,
      "",
      `Thank you again for sharing your story with Stand With Meg. When we read through your submission, we saw a court actor entry for ${actorLine}. ${followUpReason}`,
      "",
      "Could you use this short Court Actor update form to add the missing details? It only asks for the email from your original survey and the court actor information. You do not need to redo the full survey.",
      "",
      "If you are adding a sentence about what happened, please keep it short and generic, with no personal identifying details. Examples: \"The judge denied my motion without a hearing,\" \"The GAL ignored evidence I submitted,\" or \"There was no due process before my children were removed.\" If the actor did something helpful or fair, you can include that too.",
      "",
      "Your name and email will never be published as the person who reported a court actor. Public court actor patterns only show aggregate family counts and pattern information, not who said what.",
      "",
      `We only publish a court actor's name publicly once ${COURT_ACTOR_PUBLIC_THRESHOLD} different families have independently named that same person, so accurate names, roles, counties, and short pattern notes help us find real patterns without exposing families.`,
      "",
      "Court Actor update link:",
      updateUrl,
      "",
      "Thank you for helping make the data stronger and safer for public reporting.",
      "",
      "Meg",
      "Stand With Meg · standwithmeg.com",
    ].join("\n");

    setNudgeCopied("none");
    setNudgeTarget({ actor_id: a.id, email: a.reporter_email, name: a.reporter_name || "", subject, body, html: nudgeBodyToHtml(body) });
    setNudgeSending("idle");
    setNudgeSendError(null);
  }

  function updateNudgeField(field: "email" | "subject" | "body", value: string) {
    setNudgeTarget(prev => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      return field === "body" ? { ...next, html: nudgeBodyToHtml(value) } : next;
    });
    setNudgeCopied("none");
    setNudgeSending("idle");
    setNudgeSendError(null);
  }

  async function copyToClip(text: string, which: "email" | "subject" | "body" | "all") {
    try {
      await navigator.clipboard.writeText(text);
      setNudgeCopied(which);
      setTimeout(() => setNudgeCopied("none"), 2500);
    } catch {
      // Fallback for older browsers / locked-down contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setNudgeCopied(which);
      setTimeout(() => setNudgeCopied("none"), 2500);
    }
  }

  function sortedStates() {
    if (!stats) return [];
    return [...stats.by_state].sort((a, b) => {
      const av = a[sortField] ?? 0, bv = b[sortField] ?? 0;
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "desc" ? -cmp : cmp;
    });
  }

  function SortHeader({
    field,
    label,
    className = "",
    title,
  }: {
    field: keyof StateRow;
    label: string;
    className?: string;
    title?: string;
  }) {
    const active = sortField === field;
    return (
      <th
        className={`px-2 py-3 text-left text-[10px] font-bold uppercase tracking-wide cursor-pointer select-none transition-colors ${className}`}
        style={{ color: active ? GOLD : "rgba(245,245,245,0.45)" }}
        title={title ?? label}
        onClick={() => {
          if (active) setSortDir(d => d === "asc" ? "desc" : "asc");
          else { setSortField(field); setSortDir("desc"); }
        }}
      >
        {label} {active ? (sortDir === "desc" ? "↓" : "↑") : ""}
      </th>
    );
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BG }}>
        <div className="text-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3"
            style={{ borderColor: `${GOLD} transparent ${GOLD} ${GOLD}` }} />
          <p className="text-sm" style={{ color: "rgba(245,245,245,0.4)" }}>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  // ── Error / access denied ──
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: BG }}>
        <div className="w-full max-w-sm rounded-2xl p-8 text-center"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(185,28,28,0.4)" }}>
          <div className="w-12 h-12 bg-red-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="font-black text-white text-lg mb-2">Access Denied</div>
          <div className="text-sm mb-6" style={{ color: "rgba(245,245,245,0.5)" }}>{error}</div>
          <a href="/swm-login"
            className="block w-full py-3 rounded-xl font-bold text-sm text-white bg-red-700 hover:bg-red-600 transition-colors">
            Sign In →
          </a>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG }}>

      {/* swm-banner — national movement image as subtle fixed background texture */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "url('/swm/swm-banner.webp')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: 0.06,
        zIndex: 0,
      }} />

      {/* Gold top bar */}
      <div className="relative z-10 h-1" style={{ backgroundColor: GOLD }} />

      {socialToast && (
        <div className="relative z-20 max-w-7xl mx-auto px-6 pt-4">
          <div
            className="rounded-xl px-4 py-3 text-sm flex items-start justify-between gap-3"
            style={{ backgroundColor: "rgba(201,162,39,0.12)", border: "1px solid rgba(201,162,39,0.35)", color: "#fef3c7" }}
          >
            <span>{socialToast}</span>
            <button
              type="button"
              onClick={() => setSocialToast(null)}
              className="shrink-0 text-xs font-bold uppercase tracking-wide"
              style={{ color: GOLD }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header
        className="relative z-10 px-6 py-6 border-b overflow-hidden"
        style={{
          borderColor: "rgba(201,162,39,0.25)",
          background: "linear-gradient(135deg, rgba(15,30,48,0.98) 0%, rgba(9,22,37,0.92) 45%, rgba(30,58,95,0.35) 100%)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}
      >
        {/* Meg portrait — right-side fade, very restrained */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "url('/swm/meg-portrait.png')",
            backgroundSize: "auto 160%",
            backgroundPosition: "right -60px center",
            backgroundRepeat: "no-repeat",
            opacity: 0.12,
          }}
        />
        <div className="max-w-7xl mx-auto flex justify-between items-center relative z-10">
          <div className="flex items-center gap-4">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(145deg, #b91c1c 0%, #7f1d1d 100%)",
                boxShadow: "0 8px 24px rgba(185,28,28,0.35)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <div className="text-white font-black text-lg tracking-wide leading-none">STAND WITH MEG</div>
              <div className="text-xs font-bold uppercase tracking-widest mt-0.5" style={{ color: GOLD }}>
                Survey Data Command Center
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <a href="/report?admin_preview=1" target="_blank" rel="noopener noreferrer"
              className="text-sm px-4 py-2 rounded-lg font-semibold transition-colors"
              style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(245,245,245,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}>
              Public Dashboard ↗
            </a>
            <a href="/survey" target="_blank" rel="noopener noreferrer"
              className="text-sm px-4 py-2 rounded-lg font-semibold transition-colors"
              style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(245,245,245,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}>
              Survey Form ↗
            </a>
            <button onClick={load}
              className="text-sm px-4 py-2 rounded-lg font-semibold transition-colors"
              style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: `1px solid rgba(201,162,39,0.3)` }}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      <AdminCommandCenter />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8 space-y-8">
        <AdminSectionShell id="admin-gmail">
          <GmailAdminPanel compact />
        </AdminSectionShell>
        <AdminSectionShell id="admin-photo-intake">
          <PhotoIntakePanel />
        </AdminSectionShell>
        <AdminSectionShell id="admin-social-queue">
          <SocialPostQueuePanel />
        </AdminSectionShell>

        {/* ── Court Actors (Admin) ── */}
        <div id="admin-court-actors" ref={courtActorsSectionRef} className="rounded-2xl overflow-hidden scroll-mt-24"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="px-6 py-4 flex items-start justify-between gap-4 flex-wrap border-b"
            style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(30,58,95,0.4)" }}>
            <div>
              <h2 className="font-black text-white text-base tracking-wide">Court Actors</h2>
              <p className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
                {adminActorAggs.length} name groups across {adminActors.length} actor mentions · Public threshold: {COURT_ACTOR_PUBLIC_THRESHOLD} families
              </p>
              <p className="text-xs mt-1 max-w-3xl" style={{ color: "rgba(245,245,245,0.45)" }}>
                Promote means you verified an auto-extracted name and marked it counted. Once a counted name reaches the public threshold, it appears on the public dashboard automatically. Names are grouped conservatively by normalized spelling; close misspellings still need manual review before launch.
              </p>
            </div>
            <div className="flex-1 min-w-[280px] max-w-2xl">
              <div className="relative mb-3">
                <input
                  type="text"
                  value={actorFinderQuery}
                  onChange={e => {
                    setActorFinderQuery(e.target.value);
                    setActorFinderOpen(true);
                  }}
                  onFocus={() => setActorFinderOpen(true)}
                  placeholder="Find any court actor by name..."
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.28)",
                    border: `1px solid rgba(201,162,39,0.32)`,
                    color: "white",
                    outline: "none",
                  }}
                />
                {actorFinderOpen && actorFinderQuery.trim().length >= 2 && (
                  <div className="absolute right-0 left-0 mt-1 rounded-lg overflow-hidden z-20 shadow-xl"
                    style={{ backgroundColor: "rgb(15,23,42)", border: "1px solid rgba(201,162,39,0.28)" }}>
                    {actorFinderSuggestions.length === 0 ? (
                      <div className="px-4 py-3 text-xs" style={{ color: "rgba(245,245,245,0.45)" }}>
                        No actor buckets match that name.
                      </div>
                    ) : (
                      actorFinderSuggestions.map((agg, i) => (
                        <button
                          key={patternKey(agg)}
                          type="button"
                          onClick={() => selectActorDetail(agg)}
                          className="w-full px-4 py-2.5 text-left transition-colors hover:bg-white/5"
                          style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-bold text-white">{agg.name}</span>
                            <span className="text-xs font-bold" style={{ color: GOLD }}>{agg.location_key ?? agg.state_code ?? "No state"}</span>
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: "rgba(245,245,245,0.45)" }}>
                            {agg.role}{agg.court_or_county ? ` · ${agg.court_or_county}` : ""} · {agg.count} {agg.count === 1 ? "family" : "families"}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={resetActorFilters}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(245,245,245,0.65)", border: "1px solid rgba(255,255,255,0.13)" }}>
                  Reset all filters
                </button>
                {/* Segmented view selector */}
                <div className="flex items-center rounded-lg overflow-hidden"
                  style={{ border: `1px solid rgba(201,162,39,0.3)`, backgroundColor: "rgba(255,255,255,0.04)" }}>
                  {([
                    ["by_state", "By Location"],
                    ["patterns", "Patterns"],
                    ["possible_matches", "Possible Matches"],
                    ["all", "All Reports"],
                  ] as [Exclude<ActorView, "actor_detail">, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => {
                      if (val === "possible_matches") setPossibleMatchSearchSeed({ query: "", location: "" });
                      setActorView(val);
                      setExpandedState(null);
                    }}
                      className="text-xs px-3 py-1.5 font-bold whitespace-nowrap transition-colors"
                      style={{
                        backgroundColor: actorView === val ? "rgba(201,162,39,0.18)" : "transparent",
                        color: actorView === val ? GOLD : "rgba(245,245,245,0.55)",
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Filter bar — applies to Patterns and All Reports views.
              Search is case-insensitive across name, role, location, county,
              source, notes, and reporter (admin-only). */}
          {(actorView === "patterns" || actorView === "all") && (
            <div className="px-6 py-3 grid grid-cols-1 md:grid-cols-12 gap-3 border-b"
              style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(0,0,0,0.18)" }}>
              <div className="md:col-span-4">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1"
                  style={{ color: "rgba(245,245,245,0.45)" }}>Search</label>
                <input
                  type="text"
                  value={actorSearch}
                  onChange={e => setActorSearch(e.target.value)}
                  placeholder="Name, spelling variant, court, role, reporter…"
                  className="w-full px-3 py-1.5 rounded-md text-xs"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "white",
                  }} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1"
                  style={{ color: "rgba(245,245,245,0.45)" }}>Location</label>
                <select
                  value={actorLocationFilter}
                  onChange={e => setActorLocationFilter(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-md text-xs"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "rgba(245,245,245,0.85)",
                  }}>
                  <option value="">All</option>
                  {allActorLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1"
                  style={{ color: "rgba(245,245,245,0.45)" }}>Role</label>
                <select
                  value={actorRoleFilter}
                  onChange={e => setActorRoleFilter(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-md text-xs"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "rgba(245,245,245,0.85)",
                  }}>
                  <option value="">All</option>
                  {allActorRoles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {actorView === "all" && (
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1"
                    style={{ color: "rgba(245,245,245,0.45)" }}>Source</label>
                  <select
                    value={actorSourceFilter}
                    onChange={e => setActorSourceFilter(e.target.value as ActorSourceFilter)}
                    className="w-full px-2 py-1.5 rounded-md text-xs"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "rgba(245,245,245,0.85)",
                    }}>
                    <option value="all">All sources</option>
                    <option value="form_direct">form_direct (counted)</option>
                    <option value="extracted_ai">extracted_ai</option>
                    <option value="extracted_regex">extracted_regex</option>
                  </select>
                </div>
              )}
              <div className={`flex items-end gap-2 ${actorView === "all" ? "md:col-span-12" : "md:col-span-3"}`}>
                <button
                  type="button"
                  onClick={() => setActorSortMode(actorSortMode === "default" ? "group_near_dupes" : "default")}
                  className="text-xs px-3 py-1.5 rounded-md font-bold whitespace-nowrap transition-colors"
                  title="Sort by location, then by normalized name. Same/near-same names appear adjacent so duplicates are easy to spot."
                  style={{
                    backgroundColor: actorSortMode === "group_near_dupes" ? "rgba(201,162,39,0.18)" : "rgba(255,255,255,0.05)",
                    color: actorSortMode === "group_near_dupes" ? GOLD : "rgba(245,245,245,0.7)",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}>
                  {actorSortMode === "group_near_dupes" ? "✓ Group near-duplicates" : "Group near-duplicates"}
                </button>
                {(actorSearch || actorLocationFilter || actorRoleFilter || actorSourceFilter !== "all" || actorSortMode !== "default" || showOnlyUndeployedPublic || showOnlySuspectPhotos) && (
                  <button
                    type="button"
                    onClick={resetActorFilters}
                    className="text-xs px-2 py-1.5 rounded-md transition-colors"
                    style={{ color: "rgba(245,245,245,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── By Location ── */}
          {actorView === "by_state" && (() => {
            // Build { locationKey: { total: number, actors: AdminActor[] } } from flat list
            const byLocation = new Map<string, AdminActor[]>();
            for (const a of adminActors) {
              const loc = a.location_key ?? a.state_code ?? "No location listed";
              if (!byLocation.has(loc)) byLocation.set(loc, []);
              byLocation.get(loc)!.push(a);
            }
            const rows = Array.from(byLocation.entries())
              .map(([location, list]) => ({ location, list }))
              .sort((a, b) => {
                if (a.location === "No location listed") return 1;
                if (b.location === "No location listed") return -1;
                return b.list.length - a.list.length;
              });

            if (rows.length === 0) {
              return (
                <div className="px-6 py-10 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                  No court actors have been reported yet.
                </div>
              );
            }

            return (
              <div>
                {rows.map((row, i) => {
                  const isExpanded = expandedState === row.location;
                  // Group expanded location's actors by county
                  const byCounty = new Map<string, AdminActor[]>();
                  if (isExpanded) {
                    for (const a of row.list) {
                      const c = a.court_or_county || "(no county listed)";
                      if (!byCounty.has(c)) byCounty.set(c, []);
                      byCounty.get(c)!.push(a);
                    }
                  }
                  const countyGroups = Array.from(byCounty.entries()).sort((a, b) => b[1].length - a[1].length);

                  return (
                    <div key={row.location} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                      {/* Location row — click to expand */}
                      <button
                        onClick={() => setExpandedState(isExpanded ? null : row.location)}
                        className="w-full px-6 py-3 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors text-left">
                        <div className="flex items-center gap-3">
                          <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            style={{ color: "rgba(245,245,245,0.4)" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="font-black text-base" style={{ color: GOLD }}>{row.location}</span>
                        </div>
                        <span className="text-sm font-bold px-3 py-1 rounded-md"
                          style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD }}>
                          {row.list.length} {row.list.length === 1 ? "actor" : "actors"}
                        </span>
                      </button>

                      {/* County drilldown */}
                      {isExpanded && (
                        <div className="pb-3" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
                          {countyGroups.map(([county, actors], ci) => (
                            <div key={county} className="px-6 pt-3" style={{ borderTop: ci > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.5)" }}>
                                  {county}
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.5)" }}>
                                  {actors.length}
                                </span>
                              </div>
                              {actors.map((a) => {
                                const isExtracted = a.source !== "form_direct";
                                const isActing = actorActing === a.id;
                                const wasNudged = Boolean(a.nudge_sent_at);
                                const nudgeTitle = wasNudged
                                  ? `Last nudged ${new Date(a.nudge_sent_at!).toLocaleString()}${a.nudge_sent_to ? ` to ${a.nudge_sent_to}` : ""}. Click to send another follow-up.`
                                  : "Email this family and ask them to use the Court Actor update form";
                                return (
                                  <div key={a.id} className="flex items-start justify-between gap-3 py-2 pl-3 border-l-2"
                                    style={{ borderColor: "rgba(201,162,39,0.25)" }}>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-sm text-white">{a.name}</span>
                                        <span className="text-xs px-1.5 py-0.5 rounded"
                                          style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(245,245,245,0.65)" }}>
                                          {a.role}
                                        </span>
                                        {isExtracted && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                            style={{
                                              backgroundColor: "rgba(59,130,246,0.15)",
                                              color: "rgb(147,197,253)",
                                              border: "1px solid rgba(59,130,246,0.25)",
                                            }}>
                                            {a.source === "extracted_ai" ? "AI" : "Auto"}
                                          </span>
                                        )}
                                        {!isExtracted && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                            style={{
                                              backgroundColor: "rgba(74,222,128,0.15)",
                                              color: "rgb(134,239,172)",
                                              border: "1px solid rgba(74,222,128,0.3)",
                                            }}>
                                            Counted
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
                                        Reported by {a.reporter_name || "—"} ({a.reporter_email || "no email"}) · {timeAgo(a.created_at)}
                                        {a.nudge_sent_at && (
                                          <span style={{ color: "rgb(134,239,172)" }}> · Nudged {timeAgo(a.nudge_sent_at)}</span>
                                        )}
                                      </div>
                                      {a.notes && (
                                        <div className="text-xs italic mt-1.5 px-2.5 py-1.5 rounded"
                                          style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(245,245,245,0.6)" }}>
                                          {a.notes}
                                        </div>
                                      )}
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {isExtracted && (
                                        <button onClick={() => patchActor(a.id, "promote")} disabled={isActing}
                                          title={`Confirm this is a real named actor. It can count toward the public ${COURT_ACTOR_PUBLIC_THRESHOLD}-family threshold.`}
                                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors disabled:opacity-40"
                                          style={{ backgroundColor: "rgba(74,222,128,0.15)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.3)" }}>
                                          {isActing ? "…" : "Mark Counted"}
                                        </button>
                                      )}
                                      {!isExtracted && (
                                        <button onClick={() => patchActor(a.id, "demote")} disabled={isActing}
                                          title="Undo promotion — revert to extracted (won't count publicly)"
                                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors disabled:opacity-40"
                                          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.5)", border: "1px solid rgba(255,255,255,0.12)" }}>
                                          {isActing ? "…" : "Uncount"}
                                        </button>
                                      )}
                                      {a.reporter_email && (
                                        <button onClick={() => nudgeFamily(a)}
                                          title={nudgeTitle}
                                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors"
                                          style={wasNudged
                                            ? { backgroundColor: "rgba(74,222,128,0.12)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.28)" }
                                            : { backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: "1px solid rgba(201,162,39,0.3)" }}>
                                          {wasNudged ? "✓ Nudged" : "✉ Nudge"}
                                        </button>
                                      )}
                                      <button onClick={() => patchActor(a.id, "delete")} disabled={isActing}
                                        title="Delete this actor row permanently"
                                        className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors disabled:opacity-40"
                                        style={{ backgroundColor: "rgba(185,28,28,0.12)", color: "rgb(252,165,165)", border: "1px solid rgba(185,28,28,0.3)" }}>
                                        {isActing ? "…" : "× Del"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void openSubmissionDetail(a.submission_id)}
                                        title="Open this family's full survey response"
                                        className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors"
                                        style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "rgb(147,197,253)", border: "1px solid rgba(59,130,246,0.3)" }}>
                                        👁 View
                                      </button>
                                      <select
                                        value={a.reporter_permission ?? "public"}
                                        onChange={e => void updateSubmissionPermission(a.submission_id, e.target.value)}
                                        title="Change this submission's permission_to_share (affects every actor row from this submission)"
                                        className="text-[10px] px-1.5 py-1 rounded font-bold uppercase tracking-wide transition-colors"
                                        style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.85)", border: "1px solid rgba(255,255,255,0.18)" }}>
                                        <option value="public">public</option>
                                        <option value="anonymous">anonymous</option>
                                        <option value="first_name">first_name</option>
                                        <option value="data_only">data_only</option>
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => void deleteSurveySubmission(a.submission_id)}
                                        title="Delete the ENTIRE survey submission and every actor row from it"
                                        className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors"
                                        style={{ backgroundColor: "rgba(248,113,113,0.16)", color: "rgb(252,165,165)", border: "1px solid rgba(248,113,113,0.35)" }}>
                                        Del Survey
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {actorView === "actor_detail" && (() => {
            if (!selectedActorAgg) {
              return (
                <div className="px-6 py-10 text-center text-sm" style={{ color: "rgba(245,245,245,0.35)" }}>
                  Search for an actor above, then select a bucket to open the unified detail view.
                </div>
              );
            }

            const rows = selectedActorRows;
            const location = selectedActorAgg.location_key ?? selectedActorAgg.state_code ?? null;
            const deployKey = selectedActorAgg.deploy_state_abbr && selectedActorAgg.deploy_slug
              ? `${selectedActorAgg.deploy_state_abbr.toLowerCase()}/${selectedActorAgg.deploy_slug}`
              : "";
            const isPending = Boolean(selectedActorAgg.deployment_pending || (deployKey && recentlyDeployedActorKeys.has(deployKey)));
            const isDeployed = Boolean(selectedActorAgg.deployed);
            const canDeploy = selectedActorAgg.count >= COURT_ACTOR_PUBLIC_THRESHOLD && Boolean(selectedActorAgg.deployable) && !isDeployed && !isPending;
            const canRepairShare = Boolean(selectedActorAgg.deploy_state_abbr && selectedActorAgg.deploy_slug);
            const isRepairingShare = Boolean(deployKey && repairingActorKey === deployKey);
            const socialBucketKey = patternKey(selectedActorAgg).toLowerCase();
            const isPushingSocial = pushingSocialBucket === socialBucketKey;
            const shareUrl = actorShareUrl(selectedActorAgg);
            const roleVariants = Array.from(new Set(rows.map(row => row.role).filter(Boolean))).sort((a, b) => a.localeCompare(b));
            const nameVariants = Array.from(new Set(rows.map(row => row.name).filter(Boolean))).sort((a, b) => a.localeCompare(b));
            const countyVariants = Array.from(new Set(rows.map(row => row.court_or_county).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
            const permissionCounts = rows.reduce((map, row) => {
              const key = row.reporter_permission || "unknown";
              map.set(key, (map.get(key) ?? 0) + 1);
              return map;
            }, new Map<string, number>());
            const recentActorRow = rows.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
            const isEditing = editingPatternKey === patternKey(selectedActorAgg);

            return (
              <div className="px-6 py-5">
                <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setActorView("patterns")}
                    className="text-xs font-bold uppercase tracking-wide"
                    style={{ color: "rgba(245,245,245,0.5)" }}>
                    ← Back to Patterns
                  </button>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => startPatternEdit(selectedActorAgg)}
                      className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                      style={{ backgroundColor: "rgba(201,162,39,0.12)", color: GOLD, border: "1px solid rgba(201,162,39,0.28)" }}>
                      Edit Pattern
                    </button>
                    {canRepairShare && (
                      <button
                        type="button"
                        onClick={() => void repairActorShare(selectedActorAgg)}
                        disabled={isRepairingShare}
                        className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide disabled:opacity-45"
                        style={{ backgroundColor: "rgba(56,189,248,0.14)", color: "rgb(125,211,252)", border: "1px solid rgba(56,189,248,0.32)" }}>
                        {isRepairingShare ? "Fixing…" : "Fix PDF + slides"}
                      </button>
                    )}
                    {canDeploy && (
                      <button
                        type="button"
                        onClick={() => openDeployActorModal(selectedActorAgg)}
                        className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                        style={{ backgroundColor: "rgba(234,179,8,0.18)", color: "rgb(253,224,71)", border: "1px solid rgba(234,179,8,0.35)" }}>
                        Create share page →
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void pushActorToSocialQueue(selectedActorAgg)}
                      disabled={isPushingSocial || !isDeployed}
                      title={isDeployed ? "Rebuild slides and add to Blotato Pending review" : "Deploy share page first"}
                      className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide disabled:opacity-45"
                      style={{ backgroundColor: "rgba(201,162,39,0.18)", color: GOLD, border: "1px solid rgba(201,162,39,0.38)" }}>
                      {isPushingSocial ? "Queuing…" : "Push to Blotato queue"}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl p-4 mb-4"
                  style={{ backgroundColor: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.09)" }}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h3 className="text-xl font-black text-white">{selectedActorAgg.name}</h3>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.72)" }}>
                          {selectedActorAgg.role}
                        </span>
                        {location && <span className="text-xs font-bold" style={{ color: GOLD }}>{location}</span>}
                        {selectedActorAgg.court_or_county && (
                          <span className="text-xs" style={{ color: "rgba(245,245,245,0.45)" }}>· {selectedActorAgg.court_or_county}</span>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <div>
                          <div className="font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.42)" }}>Roles seen</div>
                          <div className="mt-1" style={{ color: "rgba(245,245,245,0.76)" }}>{roleVariants.join(" / ") || selectedActorAgg.role}</div>
                        </div>
                        <div>
                          <div className="font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.42)" }}>Name variants</div>
                          <div className="mt-1" style={{ color: "rgba(245,245,245,0.76)" }}>{nameVariants.join(" / ") || selectedActorAgg.name}</div>
                        </div>
                        <div>
                          <div className="font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.42)" }}>County</div>
                          <div className="mt-1" style={{ color: "rgba(245,245,245,0.76)" }}>{countyVariants.join(" / ") || selectedActorAgg.court_or_county || "—"}</div>
                        </div>
                      </div>
                    </div>
                    <div className="min-w-[220px] rounded-lg p-3"
                      style={{ backgroundColor: isDeployed ? "rgba(74,222,128,0.10)" : "rgba(234,179,8,0.10)", border: `1px solid ${isDeployed ? "rgba(74,222,128,0.26)" : "rgba(234,179,8,0.28)"}` }}>
                      <div className="text-[10px] font-black uppercase tracking-wide"
                        style={{ color: isDeployed ? "rgb(134,239,172)" : "rgb(253,224,71)" }}>
                        {isDeployed ? "SHARE PAGE READY" : isPending ? "REGEN QUEUED" : "NO SHARE PAGE YET"}
                      </div>
                      {isDeployed && shareUrl ? (
                        <a href={shareUrl} target="_blank" rel="noopener noreferrer"
                          className="mt-1 block text-xs font-bold underline"
                          style={{ color: "rgb(134,239,172)" }}>
                          Open share page
                        </a>
                      ) : (
                        <div className="mt-1 text-xs" style={{ color: "rgba(245,245,245,0.55)" }}>
                          {isPending ? "Photo is committed. The public link appears after the regen workflow and Vercel deployment finish." : canDeploy ? "Visible on /report; share page still needs to be created." : "No share page action available yet."}
                        </div>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end rounded-lg p-3"
                      style={{ backgroundColor: "rgba(0,0,0,0.20)", border: "1px solid rgba(255,255,255,0.09)" }}>
                      <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.45)" }}>
                        Display name
                        <input value={patternEditDraft.name}
                          onChange={e => setPatternEditDraft(prev => ({ ...prev, name: e.target.value }))}
                          className="mt-1 w-full rounded px-2 py-1.5 text-xs"
                          style={{ backgroundColor: "rgba(0,0,0,0.35)", color: "white", border: "1px solid rgba(255,255,255,0.14)" }} />
                      </label>
                      <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.45)" }}>
                        Role
                        <select value={patternEditDraft.role}
                          onChange={e => setPatternEditDraft(prev => ({ ...prev, role: e.target.value }))}
                          className="mt-1 w-full rounded px-2 py-1.5 text-xs"
                          style={{ backgroundColor: "rgba(0,0,0,0.35)", color: "white", border: "1px solid rgba(255,255,255,0.14)" }}>
                          {COURT_ACTOR_ROLE_OPTIONS.map(role => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.45)" }}>
                        County
                        <input value={patternEditDraft.court_or_county}
                          onChange={e => setPatternEditDraft(prev => ({ ...prev, court_or_county: e.target.value }))}
                          className="mt-1 w-full rounded px-2 py-1.5 text-xs"
                          style={{ backgroundColor: "rgba(0,0,0,0.35)", color: "white", border: "1px solid rgba(255,255,255,0.14)" }} />
                      </label>
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={savingPatternEdit === patternKey(selectedActorAgg)}
                          onClick={() => void savePatternEdit(selectedActorAgg)}
                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide disabled:opacity-50"
                          style={{ backgroundColor: "rgba(34,197,94,0.16)", color: "rgb(134,239,172)", border: "1px solid rgba(34,197,94,0.3)" }}>
                          {savingPatternEdit === patternKey(selectedActorAgg) ? "Saving…" : "Save"}
                        </button>
                        <button type="button" onClick={() => setEditingPatternKey(null)}
                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl p-4 mb-4"
                  style={{ backgroundColor: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.62)" }}>
                        Photo
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "rgba(245,245,245,0.38)" }}>
                        Current committed image_1080.png used by this actor&apos;s share page.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openReplacePhotoModal(selectedActorAgg)}
                      disabled={!selectedActorAgg.deploy_state_abbr || !selectedActorAgg.deploy_slug}
                      className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide disabled:opacity-40"
                      style={{ backgroundColor: "rgba(201,162,39,0.12)", color: GOLD, border: "1px solid rgba(201,162,39,0.28)" }}>
                      Replace photo
                    </button>
                  </div>
                  <div className="mt-3 flex items-start gap-4 flex-wrap">
                    {selectedActorAgg.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${selectedActorAgg.photo_url}?v=${selectedActorAgg.photo_size_kb ?? "photo"}`}
                        alt={`${selectedActorAgg.name} current actor photo`}
                        className="rounded-lg object-cover"
                        style={{ height: 200, width: 113, border: "1px solid rgba(255,255,255,0.12)", backgroundColor: "rgba(0,0,0,0.25)" }}
                      />
                    ) : (
                      <div className="rounded-lg flex items-center justify-center text-xs"
                        style={{ height: 200, width: 113, border: "1px solid rgba(255,255,255,0.12)", backgroundColor: "rgba(0,0,0,0.25)", color: "rgba(245,245,245,0.35)" }}>
                        No photo
                      </div>
                    )}
                    <div className="min-w-[220px] flex-1">
                      <div className="text-xs" style={{ color: "rgba(245,245,245,0.7)" }}>
                        File size: {selectedActorAgg.photo_size_kb ? `${selectedActorAgg.photo_size_kb.toLocaleString()} KB` : "unknown"}
                      </div>
                      {selectedActorAgg.photo_url && (
                        <a href={selectedActorAgg.photo_url} target="_blank" rel="noopener noreferrer"
                          className="mt-1 inline-block text-[11px] underline"
                          style={{ color: "rgba(245,245,245,0.45)" }}>
                          Open original image
                        </a>
                      )}
                      {selectedActorAgg.photo_suspect && (
                        <div className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold"
                          style={{ backgroundColor: "rgba(234,179,8,0.13)", color: "rgb(253,224,71)", border: "1px solid rgba(234,179,8,0.28)" }}>
                          {selectedActorAgg.photo_suspect_reason || "May not be a portrait — file size suggests a webpage screenshot"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.42)" }}>Family count</div>
                    <div className="text-2xl font-black text-white">{selectedActorAgg.count}</div>
                  </div>
                  <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.42)" }}>Court actor rows</div>
                    <div className="text-2xl font-black text-white">{rows.length}</div>
                  </div>
                  <div className="rounded-lg p-3 lg:col-span-2" style={{ backgroundColor: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "rgba(245,245,245,0.42)" }}>Permission breakdown</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {Array.from(permissionCounts.entries()).map(([permission, count]) => {
                        const badge = permissionToShareBadge(permission);
                        return (
                          <span key={permission} className="text-[10px] px-2 py-1 rounded font-mono uppercase"
                            style={{ color: badge.color, backgroundColor: badge.bg, border: `1px solid ${badge.border}` }}>
                            {badge.label}: {count}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {recentActorRow && (
                  <div className="rounded-lg p-3 mb-4 flex items-center justify-between gap-3 flex-wrap"
                    style={{ backgroundColor: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.20)" }}>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "rgb(147,197,253)" }}>Recent activity</div>
                      <div className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.7)" }}>
                        Most recent submission naming this actor: {timeAgo(recentActorRow.created_at)} by {recentActorRow.reporter_name || recentActorRow.reporter_email || "unknown reporter"}.
                      </div>
                    </div>
                    <button type="button" onClick={() => void openSubmissionDetail(recentActorRow.submission_id)}
                      className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                      style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "rgb(147,197,253)", border: "1px solid rgba(59,130,246,0.3)" }}>
                      View Survey
                    </button>
                  </div>
                )}

                <div className="rounded-xl overflow-hidden mb-4"
                  style={{ backgroundColor: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="text-xs font-black uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.62)" }}>
                      Every court_actor row for this actor
                    </div>
                  </div>
                  {rows.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm" style={{ color: "rgba(245,245,245,0.35)" }}>
                      No individual rows matched this actor bucket.
                    </div>
                  ) : (
                    rows.map((row, i) => {
                      const badge = permissionToShareBadge(row.reporter_permission);
                      const hiddenReason = slideHiddenReason(row);
                      const quoteText = (row.merged_comment || row.notes || "").trim();
                      const isPrimaryMerge = Array.isArray(row.merge_primary_for) && row.merge_primary_for.length > 0;
                      const isMergedIntoOther = Boolean(row.merged_into);
                      const mergeIsOpen = actorCommentMergeOpen === row.id;
                      const mergeForm = mergeIsOpen
                        ? ensureActorCommentMergeForm(row, rows)
                        : { mergedRowIds: [], mergedComment: "" };
                      const mergeBusy = actorCommentMergeBusy === row.id;
                      return (
                        <div key={row.id} className="px-4 py-3" style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-white">{row.name}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(245,245,245,0.65)" }}>
                                  {row.role}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded font-mono uppercase"
                                  style={{ color: badge.color, backgroundColor: badge.bg, border: `1px solid ${badge.border}` }}>
                                  {badge.label}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase"
                                  style={{
                                    backgroundColor: row.reporter_approved ? "rgba(74,222,128,0.12)" : "rgba(185,28,28,0.12)",
                                    color: row.reporter_approved ? "rgb(134,239,172)" : "rgb(252,165,165)",
                                    border: `1px solid ${row.reporter_approved ? "rgba(74,222,128,0.28)" : "rgba(185,28,28,0.28)"}`,
                                  }}>
                                  {row.reporter_approved ? "Approved" : "Not approved"}
                                </span>
                                {isMergedIntoOther && (
                                  <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase"
                                    title={`This row's testimony is merged into ${row.merged_into}`}
                                    style={{ backgroundColor: "rgba(56,189,248,0.14)", color: "rgb(125,211,252)", border: "1px solid rgba(56,189,248,0.28)" }}>
                                    Merged
                                  </span>
                                )}
                                {isPrimaryMerge && (
                                  <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase"
                                    title={`Primary row with ${row.merge_primary_for!.length} merged row(s)`}
                                    style={{ backgroundColor: "rgba(56,189,248,0.20)", color: "rgb(186,230,253)", border: "1px solid rgba(56,189,248,0.35)" }}>
                                    Primary +{row.merge_primary_for!.length}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] mt-1" style={{ color: "rgba(245,245,245,0.42)" }}>
                                Reporter: {row.reporter_name || "—"} ({row.reporter_email || "no email"}) · {timeAgo(row.created_at)}
                              </div>
                              {quoteText ? (
                                <div className="mt-2 text-xs italic px-3 py-2 rounded-md"
                                  style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(245,245,245,0.65)", borderLeft: `2px solid rgba(201,162,39,0.4)` }}>
                                  {quoteText}
                                </div>
                              ) : (
                                <div className="mt-2 text-xs italic" style={{ color: "rgba(245,245,245,0.35)" }}>
                                  No quote text.
                                </div>
                              )}
                              {hiddenReason && (
                                <div className="mt-1.5 text-[11px] italic" style={{ color: "rgba(245,245,245,0.35)" }}>
                                  {hiddenReason}
                                </div>
                              )}
                            </div>
                            <button type="button" onClick={() => void openSubmissionDetail(row.submission_id)}
                              className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                              style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "rgb(147,197,253)", border: "1px solid rgba(59,130,246,0.3)" }}>
                              View Survey
                            </button>
                            <button type="button"
                              disabled={rows.length < 2 || isMergedIntoOther || mergeBusy}
                              onClick={() => openActorCommentMerge(row, rows)}
                              title={rows.length < 2 ? "This actor only has one row." : isMergedIntoOther ? "This row is already merged into another primary." : "Merge duplicate testimony rows into this primary without deleting original notes."}
                              className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide disabled:opacity-45"
                              style={{ backgroundColor: "rgba(56,189,248,0.13)", color: "rgb(125,211,252)", border: "1px solid rgba(56,189,248,0.3)" }}>
                              {mergeBusy ? "Saving…" : isPrimaryMerge ? "Edit merge" : "Merge comments"}
                            </button>
                            {isPrimaryMerge && (
                              <button type="button"
                                disabled={mergeBusy}
                                onClick={() => void undoActorCommentMerge(row)}
                                className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide disabled:opacity-45"
                                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.65)", border: "1px solid rgba(255,255,255,0.12)" }}>
                                Undo merge
                              </button>
                            )}
                          </div>
                          {mergeIsOpen && (
                            <div className="mt-3 rounded-lg px-3 py-3"
                              style={{ backgroundColor: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.25)" }}>
                              <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "rgb(125,211,252)" }}>
                                Merge duplicate comments into this primary row
                              </div>
                              <div className="mt-1 text-[11px]" style={{ color: "rgba(245,245,245,0.55)" }}>
                                Use this only for duplicate reports/testimony that should display as one combined public comment. Original notes stay preserved in Supabase.
                              </div>
                              <div className="mt-2 space-y-1.5">
                                {rows.filter(other => other.id !== row.id).map(other => {
                                  const checked = mergeForm.mergedRowIds.includes(other.id);
                                  const unavailable = Boolean(other.merged_into) && other.merged_into !== row.id;
                                  return (
                                    <label key={other.id}
                                      className="flex items-start gap-2 rounded px-2 py-1.5 text-[11px]"
                                      style={{ backgroundColor: checked ? "rgba(56,189,248,0.10)" : "rgba(0,0,0,0.12)", color: "rgba(245,245,245,0.7)" }}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={unavailable}
                                        onChange={() => toggleActorCommentMergeRow(row, rows, other.id)}
                                        className="mt-0.5"
                                      />
                                      <span className="min-w-0">
                                        <strong>{other.reporter_name || "No reporter name"}</strong> ({other.reporter_email || "no email"}) · {timeAgo(other.created_at)}
                                        {unavailable && <span style={{ color: "rgba(245,245,245,0.38)" }}> · already merged into another primary</span>}
                                        <span className="block mt-0.5 italic line-clamp-2" style={{ color: "rgba(245,245,245,0.52)" }}>
                                          {(other.notes || "").trim() || "No quote text."}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                              <label className="block mt-3 text-[10px] font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.52)" }}>
                                Public merged comment
                                <textarea
                                  value={mergeForm.mergedComment}
                                  onChange={e => updateActorCommentMergeForm(row.id, { mergedComment: e.target.value })}
                                  rows={5}
                                  className="mt-1 w-full rounded-md px-3 py-2 text-xs"
                                  style={{ backgroundColor: "rgba(0,0,0,0.26)", color: "rgba(245,245,245,0.88)", border: "1px solid rgba(255,255,255,0.12)" }}
                                />
                              </label>
                              <div className="mt-3 flex items-center gap-2 flex-wrap">
                                <button type="button"
                                  disabled={mergeBusy}
                                  onClick={() => void saveActorCommentMerge(row)}
                                  className="text-[10px] px-3 py-1 rounded font-bold uppercase tracking-wide disabled:opacity-45"
                                  style={{ backgroundColor: "rgba(56,189,248,0.16)", color: "rgb(125,211,252)", border: "1px solid rgba(56,189,248,0.35)" }}>
                                  {mergeBusy ? "Saving…" : "Save merge"}
                                </button>
                                <button type="button"
                                  disabled={mergeBusy}
                                  onClick={() => setActorCommentMergeOpen(null)}
                                  className="text-[10px] px-3 py-1 rounded font-bold uppercase tracking-wide disabled:opacity-45"
                                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.65)", border: "1px solid rgba(255,255,255,0.12)" }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="rounded-xl p-4"
                  style={{ backgroundColor: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.62)" }}>
                        Possible-match clusters
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "rgba(245,245,245,0.38)" }}>
                        Use this only when close spellings exist for this actor. Duplicate comments can be merged from the row list above.
                      </div>
                    </div>
                    <button type="button"
                      onClick={() => openPossibleMatchesForActor(selectedActorAgg)}
                      disabled={possibleMatchLoading || selectedActorPossibleClusters.length === 0}
                      className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                      style={{ backgroundColor: "rgba(201,162,39,0.12)", color: GOLD, border: "1px solid rgba(201,162,39,0.28)" }}>
                      {selectedActorPossibleClusters.length > 0 ? "Open spelling merge" : "No spelling merge"}
                    </button>
                  </div>
                  {possibleMatchLoading ? (
                    <div className="text-xs" style={{ color: "rgba(245,245,245,0.45)" }}>Loading possible matches…</div>
                  ) : possibleMatchError ? (
                    <div className="text-xs" style={{ color: "rgb(252,165,165)" }}>{possibleMatchError}</div>
                  ) : selectedActorPossibleClusters.length === 0 ? (
                    <div className="text-xs" style={{ color: "rgba(245,245,245,0.38)" }}>
                      No close-spelling clusters include this actor. If you need to combine duplicate testimony, use Merge comments on a row above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedActorPossibleClusters.map(cluster => (
                        <div key={cluster.cluster_key} className="rounded-lg p-3"
                          style={{ backgroundColor: "rgba(0,0,0,0.18)", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <div className="text-xs font-bold text-white">
                            {cluster.variants.map(v => v.display_name).join(" ↔ ")}
                          </div>
                          <div className="text-[11px] mt-1" style={{ color: "rgba(245,245,245,0.42)" }}>
                            {cluster.location_key ?? "No location"} · {cluster.total_family_count ?? 0} families in suggested cluster
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {actorView === "patterns" && (
            <div>
              <div className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap"
                style={{
                  borderBottom: "1px solid rgba(234,179,8,0.22)",
                  backgroundColor: suspectPhotoPatterns.length > 0 ? "rgba(234,179,8,0.08)" : "rgba(255,255,255,0.02)",
                }}>
                <div>
                  <div className="text-xs font-black uppercase tracking-wide"
                    style={{ color: suspectPhotoPatterns.length > 0 ? "rgb(253,224,71)" : "rgba(245,245,245,0.38)" }}>
                    {suspectPhotoPatterns.length} deployed actors have photos that may be webpage screenshots.
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "rgba(245,245,245,0.42)" }}>
                    Review each actor detail before replacing anything. No photos are changed automatically.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowOnlySuspectPhotos(v => !v);
                    setShowOnlyUndeployedPublic(false);
                  }}
                  className="text-xs px-3 py-1.5 rounded-md font-bold transition-colors"
                  style={{
                    backgroundColor: showOnlySuspectPhotos ? "rgba(234,179,8,0.20)" : "rgba(255,255,255,0.05)",
                    color: showOnlySuspectPhotos ? "rgb(253,224,71)" : "rgba(245,245,245,0.65)",
                    border: "1px solid rgba(234,179,8,0.28)",
                  }}>
                  {showOnlySuspectPhotos ? "Showing suspect photos" : "Review"}
                </button>
              </div>
              <div className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap"
                style={{
                  borderBottom: "1px solid rgba(234,179,8,0.22)",
                  backgroundColor: undeployedPublicPatterns.length > 0 ? "rgba(234,179,8,0.10)" : "rgba(255,255,255,0.025)",
                }}>
                <div>
                  <div className="text-xs font-black uppercase tracking-wide"
                    style={{ color: undeployedPublicPatterns.length > 0 ? "rgb(253,224,71)" : "rgba(245,245,245,0.42)" }}>
                    {undeployedPublicPatterns.length} public report actors need share pages.
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "rgba(245,245,245,0.42)" }}>
                    They already qualify for /report. This only means their social share page and slide files are not committed yet.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowOnlyUndeployedPublic(v => !v);
                    setShowOnlySuspectPhotos(false);
                  }}
                  className="text-xs px-3 py-1.5 rounded-md font-bold transition-colors"
                  style={{
                    backgroundColor: showOnlyUndeployedPublic ? "rgba(234,179,8,0.20)" : "rgba(255,255,255,0.05)",
                    color: showOnlyUndeployedPublic ? "rgb(253,224,71)" : "rgba(245,245,245,0.65)",
                    border: "1px solid rgba(234,179,8,0.28)",
                  }}>
                  {showOnlyUndeployedPublic ? "Showing only these" : "Show only these"}
                </button>
              </div>
              <div className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", backgroundColor: "rgba(0,0,0,0.12)" }}>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.55)" }}>
                    Shareable pattern export
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "rgba(245,245,245,0.38)" }}>
                    Includes every counted actor pattern. The PDF shows how many more families are needed to reach the {COURT_ACTOR_PUBLIC_THRESHOLD}-family public threshold.
                  </div>
                </div>
                <a
                  href="/api/admin/court-actors/patterns-pdf?threshold=1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-2 rounded-lg font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: `1px solid rgba(201,162,39,0.4)` }}
                >
                  Download PDF
                </a>
              </div>
              {filteredAdminActorAggs.length === 0 && (
                <div className="px-6 py-10 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                  <div>
                    {adminActorAggs.length === 0
                      ? "No court actors have been reported yet."
                      : showOnlyUndeployedPublic && actorLocationFilter
                        ? "No actors match both filters. Try clearing the Location filter."
                        : "No actor patterns match the current filters."}
                  </div>
                  {adminActorAggs.length > 0 && (
                    <button
                      type="button"
                      onClick={resetActorFilters}
                      className="mt-3 text-xs px-3 py-1.5 rounded-md font-bold transition-colors"
                      style={{ backgroundColor: "rgba(201,162,39,0.12)", color: GOLD, border: "1px solid rgba(201,162,39,0.28)" }}>
                      Clear filters
                    </button>
                  )}
                </div>
              )}
              {filteredAdminActorAggs.slice(0, 200).map((agg, i) => {
                const isPublic = agg.count >= COURT_ACTOR_PUBLIC_THRESHOLD;
                const editKey = patternKey(agg);
                const isEditing = editingPatternKey === editKey;
                const matchingRows = rowsForPattern(agg);
                const deployKey = agg.deploy_state_abbr && agg.deploy_slug
                  ? `${agg.deploy_state_abbr.toLowerCase()}/${agg.deploy_slug}`
                  : "";
                const justDeployed = Boolean(deployKey && recentlyDeployedActorKeys.has(deployKey));
                const needsDeploy = isPublic && Boolean(agg.deployable) && !agg.deployed && !agg.deployment_pending && !justDeployed;
                const drillDown = () => {
                  setActorSearch(agg.name);
                  setActorLocationFilter(agg.location_key ?? agg.state_code ?? "");
                  setActorView("all");
                };
                return (
                  <div
                    key={editKey}
                    className="px-6 py-3"
                    style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-white">{agg.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.7)" }}>
                            {agg.role}
                          </span>
                          {agg.location_key && (
                            <span className="text-xs" style={{ color: GOLD }}>{agg.location_key}</span>
                          )}
                          {agg.court_or_county && (
                            <span className="text-xs" style={{ color: "rgba(245,245,245,0.4)" }}>· {agg.court_or_county}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${isPublic ? "text-red-300" : ""}`}
                          style={{
                            backgroundColor: isPublic ? "rgba(185,28,28,0.22)" : "rgba(255,255,255,0.08)",
                            color: isPublic ? undefined : "rgba(245,245,245,0.6)"
                          }}>
                          {agg.count} {agg.count === 1 ? "report" : "reports"}
                        </span>
                        {isPublic && (
                          <span className="text-[10px] font-bold uppercase tracking-wide"
                            style={{ color: GOLD }}>Public</span>
                        )}
                        {agg.photo_suspect && (
                          <span className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                            style={{
                              backgroundColor: "rgba(234,179,8,0.13)",
                              color: "rgb(253,224,71)",
                              border: "1px solid rgba(234,179,8,0.28)",
                            }}>
                            Photo audit
                          </span>
                        )}
                        {needsDeploy && (
                          <button
                            type="button"
                            onClick={() => openDeployActorModal(agg)}
                            className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors"
                            style={{
                              backgroundColor: "rgba(234,179,8,0.18)",
                              color: "rgb(253,224,71)",
                              border: "1px solid rgba(234,179,8,0.35)",
                            }}>
                            Create share page →
                          </button>
                        )}
                        {justDeployed && (
                          <span className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                            style={{
                              backgroundColor: "rgba(74,222,128,0.13)",
                              color: "rgb(134,239,172)",
                              border: "1px solid rgba(74,222,128,0.28)",
                            }}>
                            ✓ Share page created — regenerate to render
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => startPatternEdit(agg)}
                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors"
                          style={{ backgroundColor: "rgba(201,162,39,0.12)", color: GOLD, border: "1px solid rgba(201,162,39,0.28)" }}>
                          Edit pattern
                        </button>
                        <button
                          type="button"
                          onClick={() => selectActorDetail(agg)}
                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors"
                          style={{ backgroundColor: "rgba(59,130,246,0.12)", color: "rgb(147,197,253)", border: "1px solid rgba(59,130,246,0.25)" }}>
                          Actor detail
                        </button>
                        <button
                          type="button"
                          onClick={drillDown}
                          title={`Show every report for ${agg.name} (with View / Permission / Delete actions)`}
                          className="text-[10px] font-bold uppercase tracking-wide"
                          style={{ color: "rgba(245,245,245,0.4)" }}>
                          View reports →
                        </button>
                      </div>
                    </div>
                    {isEditing && (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end rounded-lg p-3"
                        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
                        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.45)" }}>
                          Name
                          <input
                            value={patternEditDraft.name}
                            onChange={e => setPatternEditDraft(prev => ({ ...prev, name: e.target.value }))}
                            className="mt-1 w-full rounded px-2 py-1.5 text-xs"
                            style={{ backgroundColor: "rgba(0,0,0,0.35)", color: "white", border: "1px solid rgba(255,255,255,0.14)" }}
                          />
                        </label>
                        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.45)" }}>
                          Role
                          <select
                            value={patternEditDraft.role}
                            onChange={e => setPatternEditDraft(prev => ({ ...prev, role: e.target.value }))}
                            className="mt-1 w-full rounded px-2 py-1.5 text-xs"
                            style={{ backgroundColor: "rgba(0,0,0,0.35)", color: "white", border: "1px solid rgba(255,255,255,0.14)" }}
                          >
                            {COURT_ACTOR_ROLE_OPTIONS.map(role => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </label>
                        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.45)" }}>
                          Court
                          <input
                            value={patternEditDraft.court_or_county}
                            onChange={e => setPatternEditDraft(prev => ({ ...prev, court_or_county: e.target.value }))}
                            className="mt-1 w-full rounded px-2 py-1.5 text-xs"
                            style={{ backgroundColor: "rgba(0,0,0,0.35)", color: "white", border: "1px solid rgba(255,255,255,0.14)" }}
                          />
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px]" style={{ color: "rgba(245,245,245,0.4)" }}>
                            Applies to {matchingRows.length} row{matchingRows.length === 1 ? "" : "s"}
                          </span>
                          <button
                            type="button"
                            disabled={savingPatternEdit === editKey}
                            onClick={() => void savePatternEdit(agg)}
                            className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide disabled:opacity-50"
                            style={{ backgroundColor: "rgba(34,197,94,0.16)", color: "rgb(134,239,172)", border: "1px solid rgba(34,197,94,0.3)" }}>
                            {savingPatternEdit === editKey ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPatternKey(null)}
                            className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                      )}
                  </div>
                );
              })}
            </div>
          )}

          {actorView === "possible_matches" && (
            <PossibleMatchesPanel
              onOpenSubmission={openSubmissionDetail}
              onNudgeFamily={nudgeFamily}
              initialSearchQuery={possibleMatchSearchSeed.query}
              initialLocationFilter={possibleMatchSearchSeed.location}
            />
          )}

          {actorView === "all" && (
            <div>
              {filteredAdminActors.length === 0 && (
                <div className="px-6 py-10 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                  {adminActors.length === 0
                    ? "No court actor reports yet."
                    : "No reports match these filters."}
                </div>
              )}
              {filteredAdminActors.slice(0, 500).map((a, i) => (
                <div key={a.id} className="px-6 py-3"
                  style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-semibold text-sm text-white">{a.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.7)" }}>
                        {a.role}
                      </span>
                      {a.source !== "form_direct" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                          title={a.source === "extracted_ai" ? "Extracted by AI from free-text" : "Extracted by regex from free-text"}
                          style={{
                            backgroundColor: "rgba(59,130,246,0.15)",
                            color: "rgb(147,197,253)",
                            border: "1px solid rgba(59,130,246,0.25)",
                          }}>
                          {a.source === "extracted_ai" ? "AI" : "Auto"}
                        </span>
                      )}
                      {(a.location_key ?? a.state_code) && <span className="text-xs" style={{ color: GOLD }}>{a.location_key ?? a.state_code}</span>}
                      {a.court_or_county && <span className="text-xs" style={{ color: "rgba(245,245,245,0.4)" }}>· {a.court_or_county}</span>}
                    </div>
                    <span className="text-[11px]" style={{ color: "rgba(245,245,245,0.35)" }}>
                      {timeAgo(a.created_at)}
                    </span>
                  </div>
                  <div className="text-[11px]" style={{ color: "rgba(245,245,245,0.4)" }}>
                    Reported by {a.reporter_name || "—"} ({a.reporter_email || "no email"})
                    {a.nudge_sent_at && (
                      <span style={{ color: "rgb(134,239,172)" }}> · Nudged {timeAgo(a.nudge_sent_at)}</span>
                    )}
                  </div>
                  {a.notes && (
                    <div className="mt-1.5 text-xs italic px-3 py-2 rounded-md"
                      style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(245,245,245,0.6)", borderLeft: `2px solid rgba(201,162,39,0.4)` }}>
                      {a.notes}
                    </div>
                  )}
                  {editingActorId === a.id && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end rounded-lg p-3"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
                      <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.45)" }}>
                        Name
                        <input
                          value={actorEditDraft.name}
                          onChange={e => setActorEditDraft(prev => ({ ...prev, name: e.target.value }))}
                          className="mt-1 w-full rounded px-2 py-1.5 text-xs"
                          style={{ backgroundColor: "rgba(0,0,0,0.35)", color: "white", border: "1px solid rgba(255,255,255,0.14)" }}
                        />
                      </label>
                      <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.45)" }}>
                        Role
                        <select
                          value={actorEditDraft.role}
                          onChange={e => setActorEditDraft(prev => ({ ...prev, role: e.target.value }))}
                          className="mt-1 w-full rounded px-2 py-1.5 text-xs"
                          style={{ backgroundColor: "rgba(0,0,0,0.35)", color: "white", border: "1px solid rgba(255,255,255,0.14)" }}
                        >
                          {COURT_ACTOR_ROLE_OPTIONS.map(role => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.45)" }}>
                        Court
                        <input
                          value={actorEditDraft.court_or_county}
                          onChange={e => setActorEditDraft(prev => ({ ...prev, court_or_county: e.target.value }))}
                          className="mt-1 w-full rounded px-2 py-1.5 text-xs"
                          style={{ backgroundColor: "rgba(0,0,0,0.35)", color: "white", border: "1px solid rgba(255,255,255,0.14)" }}
                        />
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          disabled={savingActorEdit === a.id}
                          onClick={() => void saveActorEdit(a.id)}
                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide disabled:opacity-50"
                          style={{ backgroundColor: "rgba(34,197,94,0.16)", color: "rgb(134,239,172)", border: "1px solid rgba(34,197,94,0.3)" }}>
                          {savingActorEdit === a.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingActorId(null)}
                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => startActorEdit(a)}
                      title="Edit this actor row's name, role, or court"
                      className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors"
                      style={{ backgroundColor: "rgba(201,162,39,0.12)", color: GOLD, border: "1px solid rgba(201,162,39,0.28)" }}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void openSubmissionDetail(a.submission_id)}
                      title="Open this family's full survey response"
                      className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors"
                      style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "rgb(147,197,253)", border: "1px solid rgba(59,130,246,0.3)" }}>
                      👁 View Survey
                    </button>
                    <select
                      value={a.reporter_permission ?? "public"}
                      onChange={e => void updateSubmissionPermission(a.submission_id, e.target.value)}
                      title="Change this submission's permission_to_share (affects every actor row from this submission)"
                      className="text-[10px] px-1.5 py-1 rounded font-bold uppercase tracking-wide transition-colors"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.85)", border: "1px solid rgba(255,255,255,0.18)" }}>
                      <option value="public">public</option>
                      <option value="anonymous">anonymous</option>
                      <option value="first_name">first_name</option>
                      <option value="data_only">data_only</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void deleteSurveySubmission(a.submission_id)}
                      title="Delete the ENTIRE survey submission and every actor row from it"
                      className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors"
                      style={{ backgroundColor: "rgba(248,113,113,0.16)", color: "rgb(252,165,165)", border: "1px solid rgba(248,113,113,0.35)" }}>
                      Delete Survey
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>


        {/* ── Stat Cards ── */}
        <AdminSectionShell id="admin-stats">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          {/* Total Submissions — gold number */}
          <div className="rounded-2xl p-6 relative overflow-hidden"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid rgba(201,162,39,0.35)` }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(201,162,39,0.7)" }}>
              Total Submissions
            </div>
            <div className="text-4xl font-black leading-none" style={{ color: GOLD }}>
              {stats.total.toLocaleString()}
            </div>
            <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>families documented</div>
          </div>

          {/* States / Countries — white numbers, side-by-side */}
          <div className="rounded-2xl p-6"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(245,245,245,0.45)" }}>
              Global Reach
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-4xl font-black text-white leading-none">
                  {stats.by_state.filter(r => r.is_us).length}
                </div>
                <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>
                  US states
                </div>
              </div>
              <div>
                <div className="text-4xl font-black text-white leading-none">
                  {stats.by_state.filter(r => !r.is_us).length}
                </div>
                <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>
                  {stats.by_state.filter(r => !r.is_us).length === 1 ? "country" : "countries"} worldwide
                </div>
              </div>
            </div>
          </div>

          {/* Total Loss — crimson */}
          <div className="rounded-2xl p-6 relative overflow-hidden"
            style={{ backgroundColor: "rgba(185,28,28,0.12)", border: "1px solid rgba(185,28,28,0.35)" }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-2 text-red-400">
              Total Reported Financial Loss
            </div>
            <div className="text-2xl md:text-4xl font-black text-red-400 leading-none break-all">
              {fmt$(stats.financials.total_loss)}
            </div>
            <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>dollars reported by families</div>
          </div>

          {/* Avg Loss — gold */}
          <div className="rounded-2xl p-6"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid rgba(201,162,39,0.25)` }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(201,162,39,0.7)" }}>
              Avg Reported Loss / Family
            </div>
            <div className="text-2xl md:text-4xl font-black leading-none break-all" style={{ color: GOLD }}>
              {fmt$(stats.financials.avg_loss)}
            </div>
            <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>
              {stats.financials.count_with_financials.toLocaleString()} families reported financial loss
            </div>
          </div>

        </div>
        </AdminSectionShell>

        {/* ── State Breakdown Table ── */}
        <AdminSectionShell id="admin-submissions-location">
        <div className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>

          <div className="px-6 py-4 flex justify-between items-center border-b"
            style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(30,58,95,0.4)" }}>
            <div>
              <h2 className="font-black text-white text-base tracking-wide">Submissions by Location</h2>
              <p className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
                Click column headers to sort. {stats.by_state.filter(r => r.is_us).length} US states · {stats.by_state.filter(r => !r.is_us).length} international countries · Latest in location shows the most recent submission from that location.
              </p>
            </div>
            <RegenerateAllButton />
          </div>

          <div className="overflow-hidden">
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr style={{ backgroundColor: "rgba(30,58,95,0.6)", borderBottom: `1px solid rgba(201,162,39,0.2)` }}>
                  <SortHeader field="state" label="State" className="w-[12%]" />
                  <th className="w-[11%] px-2 py-3 text-left text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: "rgba(245,245,245,0.45)" }}>PDF</th>
                  <SortHeader field="total_submissions" label="Total" className="w-[8%]" />
                  <SortHeader field="approved_count" label="Quotes" className="w-[8%]" title="Approved public quotes" />
                  <SortHeader field="avg_financial_loss" label="Avg $" className="w-[11%]" title="Average reported loss" />
                  <SortHeader field="total_financial_loss" label="Total $" className="w-[13%]" title="Total reported loss" />
                  <SortHeader field="avg_months_lost" label="Mos." className="w-[9%]" title="Average months lost" />
                  <SortHeader field="total_loss_count" label="No Contact" className="w-[10%]" />
                  <SortHeader field="pro_se_count" label="Pro Se" className="w-[8%]" />
                  <SortHeader field="last_submission_at" label="Latest" className="w-[10%]" title="Latest in State" />
                </tr>
              </thead>
              <tbody>
                {sortedStates().map((row, i) => (
                  <tr key={`${row.is_us ? "us" : "intl"}-${row.state}`}
                    className="transition-colors"
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(201,162,39,0.06)")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)")}
                  >
                    <td className="px-2 py-3 font-black text-xs break-words" style={{ color: GOLD }}>{row.state}</td>
                    <td className="px-2 py-3 text-xs">
                      {row.total_submissions >= 30 ? (
                        <RegenerateStateButton state={row.state} />
                      ) : (
                        <span style={{ color: "rgba(245,245,245,0.15)" }}>—</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-xs font-bold text-white">{row.total_submissions}</td>
                    <td className="px-2 py-3 text-xs">
                      {row.approved_count > 0 ? (
                        <button
                          onClick={() => openQuoteModal(row)}
                          className="font-bold text-green-400 underline decoration-dotted underline-offset-2 hover:text-green-300 transition-colors"
                          title={`View ${row.approved_count} approved quote${row.approved_count === 1 ? "" : "s"} for ${row.state}`}
                        >
                          {row.approved_count}
                        </button>
                      ) : (
                        <span style={{ color: "rgba(245,245,245,0.25)" }}>0</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-xs break-words" style={{ color: "rgba(245,245,245,0.6)" }}>{fmt$(row.avg_financial_loss)}</td>
                    <td className="px-2 py-3 text-xs font-semibold text-red-400 break-words">{fmt$(row.total_financial_loss)}</td>
                    <td className="px-2 py-3 text-xs" style={{ color: "rgba(245,245,245,0.6)" }}>{row.avg_months_lost ?? "—"}</td>
                    <td className="px-2 py-3 text-xs" style={{ color: "rgba(245,245,245,0.6)" }}>{row.total_loss_count}</td>
                    <td className="px-2 py-3 text-xs" style={{ color: "rgba(245,245,245,0.6)" }}>{row.pro_se_count}</td>
                    <td
                      className="px-2 py-3 text-xs font-semibold tabular-nums"
                      style={{ color: "rgba(245,245,245,0.4)" }}
                      title={exactTimestamp(row.last_submission_at)}
                    >
                      {latestInState(row.last_submission_at)}
                    </td>
                  </tr>
                ))}
                {sortedStates().length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                      No submissions yet. Share /survey to start collecting data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </AdminSectionShell>

        {/* ── Reporting Audit Spreadsheet ── */}
        <AdminSectionShell id="admin-reporting-audit">
        <div className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="px-6 py-4 flex justify-between items-start gap-4 flex-wrap border-b"
            style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(30,58,95,0.4)" }}>
            <div>
              <h2 className="font-black text-white text-base tracking-wide">Reporting Audit Spreadsheet</h2>
              <p className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
                Public dashboard totals, PDF index counts, quote counts, and public court-actor counts. A flag means one state needs PDF/reporting review.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {auditSummary && (
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
                  <span className="px-2 py-1 rounded" style={{ backgroundColor: "rgba(74,222,128,0.12)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.25)" }}>
                    {auditSummary.eligible_states} eligible
                  </span>
                  <span className="px-2 py-1 rounded" style={{ backgroundColor: "rgba(201,162,39,0.12)", color: GOLD, border: "1px solid rgba(201,162,39,0.25)" }}>
                    {auditSummary.pdfs_available} PDFs
                  </span>
                  {(auditSummary.mismatches + auditSummary.missing_pdfs + auditSummary.stale_pdfs) > 0 && (
                    <span className="px-2 py-1 rounded" style={{ backgroundColor: "rgba(185,28,28,0.18)", color: "rgb(252,165,165)", border: "1px solid rgba(185,28,28,0.35)" }}>
                      {auditSummary.mismatches + auditSummary.missing_pdfs + auditSummary.stale_pdfs} flags
                    </span>
                  )}
                </div>
              )}
              <a
                href="/api/admin/reporting-audit?format=csv"
                className="text-xs px-3 py-2 rounded-lg font-bold transition-opacity hover:opacity-80"
                style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: `1px solid rgba(201,162,39,0.4)` }}
              >
                Download CSV for Google Sheets
              </a>
            </div>
          </div>

          {auditError ? (
            <div className="px-6 py-8 text-sm" style={{ color: "rgb(252,165,165)" }}>
              {auditError}
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full table-fixed text-xs">
                <thead>
                  <tr style={{ backgroundColor: "rgba(30,58,95,0.6)", borderBottom: `1px solid rgba(201,162,39,0.2)` }}>
                    {[
                      ["Status", "Reporting status", "w-[10%]"],
                      ["State", "State or country", "w-[7%]"],
                      ["PDF", "Open public PDF", "w-[8%]"],
                      ["Live", "Dashboard families", "w-[6%]"],
                      ["PDF #", "PDF index family count", "w-[6%]"],
                      ["Δ", "PDF count minus dashboard count", "w-[5%]"],
                      ["Quotes", "Shareable quotes", "w-[6%]"],
                      ["Actors", "Public court actors", "w-[6%]"],
                      ["Total $", "Total reported loss", "w-[12%]"],
                      ["Mean $", "Average reported loss", "w-[10%]"],
                      ["Mos.", "Average months lost", "w-[6%]"],
                      ["No", "No-contact count", "w-[6%]"],
                      ["Pro", "Pro se count", "w-[5%]"],
                      ["Latest", "Latest submission", "w-[7%]"],
                    ].map(([label, title, width]) => (
                      <th key={label} title={title} className={`px-2 py-3 text-left text-[10px] font-bold uppercase tracking-wide ${width}`}
                        style={{ color: "rgba(245,245,245,0.45)" }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row, i) => {
                    const status = auditStatusMeta(row.reporting_status);
                    const delta = row.pdf_count_delta;
                    const canReview = row.dashboard_families > 0;
                    return (
                      <tr key={`${row.is_us ? "us" : "intl"}-${row.state}`}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                        }}>
                        <td className="px-2 py-3">
                          {canReview ? (
                            <button
                              type="button"
                              onClick={() => openAuditReview(row)}
                              className="text-[10px] px-1.5 py-1 rounded font-bold uppercase tracking-wide hover:opacity-80 transition-opacity"
                              title={
                                row.reporting_status === "ok"
                                  ? `Open source-row review for ${row.state}`
                                  : `Review ${row.state}: live ${row.dashboard_families}, PDF ${row.pdf_index_families ?? "missing"}`
                              }
                              style={{ color: status.color, backgroundColor: status.bg, border: `1px solid ${status.border}` }}
                            >
                              {status.label}
                            </button>
                          ) : (
                            <span className="text-[10px] px-1.5 py-1 rounded font-bold uppercase tracking-wide"
                              style={{ color: status.color, backgroundColor: status.bg, border: `1px solid ${status.border}` }}>
                              {status.label}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3 font-black text-xs break-words" style={{ color: GOLD }}>{row.state}</td>
                        <td className="px-2 py-3 text-xs">
                          {row.pdf_url ? (
                            <a href={row.pdf_url} target="_blank" rel="noopener noreferrer"
                              className="font-bold underline underline-offset-2"
                              style={{ color: GOLD }}>
                              Open
                            </a>
                          ) : (
                            <span style={{ color: "rgba(245,245,245,0.2)" }}>—</span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-xs font-bold text-white">{fmtNum(row.dashboard_families)}</td>
                        <td className="px-2 py-3 text-xs" style={{ color: row.pdf_available ? "rgba(245,245,245,0.72)" : "rgba(245,245,245,0.25)" }}>
                          {fmtNum(row.pdf_index_families)}
                        </td>
                        <td className="px-2 py-3 text-xs font-semibold" title="PDF count minus dashboard count" style={{ color: delta === 0 ? "rgba(245,245,245,0.45)" : "rgb(253,224,71)" }}>
                          {delta == null ? "—" : delta > 0 ? `+${delta}` : delta}
                        </td>
                        <td className="px-2 py-3 text-xs text-green-400 font-semibold">{fmtNum(row.shareable_quotes)}</td>
                        <td className="px-2 py-3 text-xs font-semibold" style={{ color: GOLD }}>{fmtNum(row.public_court_actors)}</td>
                        <td className="px-2 py-3 text-xs font-semibold text-red-400 break-words">{fmt$(row.total_reported_loss)}</td>
                        <td className="px-2 py-3 text-xs break-words" style={{ color: "rgba(245,245,245,0.6)" }}>{fmt$(row.avg_reported_loss)}</td>
                        <td className="px-2 py-3 text-xs" style={{ color: "rgba(245,245,245,0.6)" }}>{row.avg_months_lost ?? "—"}</td>
                        <td className="px-2 py-3 text-xs" style={{ color: "rgba(245,245,245,0.6)" }}>{fmtNum(row.no_contact_count)}</td>
                        <td className="px-2 py-3 text-xs" style={{ color: "rgba(245,245,245,0.6)" }}>{fmtNum(row.pro_se_count)}</td>
                        <td className="px-2 py-3 text-xs font-semibold tabular-nums"
                          title={row.latest_submission_at ? exactTimestamp(row.latest_submission_at) : undefined}
                          style={{ color: "rgba(245,245,245,0.4)" }}>
                          {row.latest_submission_at ? latestInState(row.latest_submission_at) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {auditRows.length === 0 && (
                    <tr>
                      <td colSpan={14} className="px-6 py-12 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                        No reporting audit rows loaded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </AdminSectionShell>

        {/* ── Photo Requests (Auto-email workflow) ── */}
        <AdminSectionShell id="admin-photo-requests">
        {photoRequests && (
          <div className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="px-6 py-4 flex items-start justify-between gap-4 flex-wrap border-b"
              style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(30,58,95,0.4)" }}>
              <div>
                <h2 className="font-black text-white text-base tracking-wide">Photo Requests</h2>
                <p className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
                  Automatic photo / source request emails to reporters when their named court actor crosses the public threshold. One email per reporter per actor, ever.
                </p>
              </div>
              <button
                onClick={() => setPhotoRequestsExpanded(v => !v)}
                className="text-xs px-3 py-1.5 font-bold rounded-lg whitespace-nowrap transition-colors"
                style={{
                  border: `1px solid rgba(201,162,39,0.3)`,
                  backgroundColor: photoRequestsExpanded ? "rgba(201,162,39,0.18)" : "transparent",
                  color: photoRequestsExpanded ? GOLD : "rgba(245,245,245,0.55)",
                }}>
                {photoRequestsExpanded ? "Hide recent" : "Show recent"}
              </button>
            </div>
            <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-black text-white">{photoRequests.totals.sent_last_7d}</div>
                <div className="text-xs" style={{ color: "rgba(245,245,245,0.5)" }}>Sent · last 7 days</div>
              </div>
              <div>
                <div className="text-2xl font-black"
                  style={{ color: photoRequests.totals.failed_last_7d > 0 ? "rgb(252,165,165)" : "rgb(245,245,245)" }}>
                  {photoRequests.totals.failed_last_7d}
                </div>
                <div className="text-xs" style={{ color: "rgba(245,245,245,0.5)" }}>Failed · last 7 days</div>
              </div>
              <div>
                <div className="text-2xl font-black text-white">{photoRequests.totals.would_send}</div>
                <div className="text-xs" style={{ color: "rgba(245,245,245,0.5)" }}>Pending next run</div>
              </div>
              <div>
                <div className="text-2xl font-black text-white">{photoRequests.totals.already_sent}</div>
                <div className="text-xs" style={{ color: "rgba(245,245,245,0.5)" }}>Total ever sent</div>
              </div>
            </div>
            {photoRequests.totals.last_sent_at && (
              <div className="px-6 pb-3 text-xs" style={{ color: "rgba(245,245,245,0.45)" }}>
                Last send: <span title={exactTimestamp(photoRequests.totals.last_sent_at)}>
                  {timeAgo(photoRequests.totals.last_sent_at)}
                </span>
                {" · "}
                <a
                  href="https://github.com/standwithmeg/standwithmeg-registry/actions/workflows/send-public-court-actor-photo-requests.yml"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: GOLD, textDecoration: "underline" }}>
                  Workflow runs ↗
                </a>
              </div>
            )}
            {photoRequestsExpanded && photoRequests.recent.length > 0 && (
              <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                      <th className="px-6 py-2 text-left font-bold" style={{ color: "rgba(245,245,245,0.4)" }}>When</th>
                      <th className="px-2 py-2 text-left font-bold" style={{ color: "rgba(245,245,245,0.4)" }}>Status</th>
                      <th className="px-2 py-2 text-left font-bold" style={{ color: "rgba(245,245,245,0.4)" }}>Court actor</th>
                      <th className="px-2 py-2 text-left font-bold" style={{ color: "rgba(245,245,245,0.4)" }}>Reporter</th>
                      <th className="px-6 py-2 text-left font-bold" style={{ color: "rgba(245,245,245,0.4)" }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {photoRequests.recent.map(r => {
                      const statusColor =
                        r.status === "sent" ? "rgb(134,239,172)" :
                        r.status === "failed" ? "rgb(252,165,165)" :
                        "rgba(245,245,245,0.55)";
                      return (
                        <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <td className="px-6 py-2 whitespace-nowrap" style={{ color: "rgba(245,245,245,0.5)" }}
                            title={exactTimestamp(r.created_at)}>
                            {timeAgo(r.created_at)}
                          </td>
                          <td className="px-2 py-2 font-bold" style={{ color: statusColor }}>
                            {r.status}
                          </td>
                          <td className="px-2 py-2" style={{ color: "rgba(245,245,245,0.85)" }}>
                            {r.canonical_name} <span style={{ color: "rgba(245,245,245,0.4)" }}>· {r.location_key}</span>
                          </td>
                          <td className="px-2 py-2 font-mono" style={{ color: "rgba(245,245,245,0.65)" }}>
                            {r.reporter_email}
                          </td>
                          <td className="px-6 py-2" style={{ color: r.status === "failed" ? "rgb(252,165,165)" : "rgba(245,245,245,0.5)" }}>
                            {r.status === "failed" ? r.error_message : (r.email_subject ?? "")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        </AdminSectionShell>

        {/* ── Recent Submissions ── */}
        <AdminSectionShell id="admin-recent-submissions">
        <div className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>

          <div className="px-6 py-4 border-b"
            style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(30,58,95,0.4)" }}>
            <h2 className="font-black text-white text-base tracking-wide">Recent Submissions</h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
              Click any submission to view full details. Approve only when a quote can be shown publicly; data-only/do-not-share submissions should stay private.
            </p>
          </div>

          <div>
            {stats.recent.map((row, i) => (
              <div key={row.id}
                className="px-6 py-5 transition-colors cursor-pointer"
                onClick={() => setDetailRow(row)}
                style={{
                  borderBottom: i < stats.recent.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                  backgroundColor: row.approved ? "rgba(201,162,39,0.04)" : "transparent",
                }}>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-black text-sm" style={{ color: GOLD }}>
                        {row.state_of_occurrence ?? row.outside_us_country}
                        {row.case_county ? ` — ${row.case_county}` : ""}
                      </span>
                      {row.case_status && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(245,245,245,0.6)" }}>
                          {row.case_status}
                        </span>
                      )}
                      {row.system_affected && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor: "rgba(30,58,95,0.6)", color: "rgba(245,245,245,0.7)" }}>
                          {row.system_affected.replace(/_/g, " ")}
                        </span>
                      )}
                      {row.total_financial_loss != null && row.total_financial_loss > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold text-red-400"
                          style={{ backgroundColor: "rgba(185,28,28,0.2)" }}>
                          {fmt$(row.total_financial_loss)}
                        </span>
                      )}
                      <span className="text-xs" style={{ color: "rgba(245,245,245,0.25)" }}>
                        {timeAgo(row.created_at)}
                      </span>
                    </div>

                    {row.impact_quote && (
                      <blockquote className="text-sm italic pl-3 mt-1"
                        style={{ borderLeft: `2px solid rgba(201,162,39,0.4)`, color: "rgba(245,245,245,0.65)" }}>
                        &ldquo;{row.impact_quote.slice(0, 220)}{row.impact_quote.length > 220 ? "…" : ""}&rdquo;
                        <span className="not-italic ml-2" style={{ color: "rgba(245,245,245,0.3)" }}>
                          — {displayName(row)}
                        </span>
                      </blockquote>
                    )}
                  </div>

                  <button
                    onClick={() => toggleApprove(row.id, row.approved)}
                    disabled={approving === row.id}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-bold transition-colors disabled:opacity-40"
                    style={
                      row.approved
                        ? { backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: `1px solid rgba(201,162,39,0.4)` }
                        : { backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.5)", border: "1px solid rgba(255,255,255,0.12)" }
                    }
                  >
                    {approving === row.id ? "…" : row.approved ? "✓ Approved" : "Approve"}
                  </button>
                </div>
              </div>
            ))}

            {stats.recent.length === 0 && (
              <div className="px-6 py-12 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                No submissions yet. Share the /survey form to start collecting data.
              </div>
            )}
          </div>
        </div>
        </AdminSectionShell>

      </div>

      {/* Footer */}
      <footer className="relative z-10 text-center px-6 py-5 mt-4 text-xs border-t"
        style={{ color: "rgba(245,245,245,0.2)", borderColor: "rgba(255,255,255,0.06)" }}>
        Stand With Meg &nbsp;·&nbsp; Courage to Stand, Power to Change &nbsp;·&nbsp; standwithmeg.com
      </footer>

      {deployActorModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
          onClick={e => {
            if (e.target === e.currentTarget && deployActorModal.status !== "deploying") setDeployActorModal(null);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#0F1E30", border: `1px solid rgba(201,162,39,0.35)` }}>
            <div className="px-6 py-4 flex items-start justify-between gap-4"
              style={{ borderBottom: `1px solid rgba(201,162,39,0.2)`, backgroundColor: "rgba(30,58,95,0.6)" }}>
              <div>
                <div className="font-black text-white text-base leading-none">Create actor share page</div>
                <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.45)" }}>
                  The actor already appears on /report. This commits the photo/manifest entry, then queues that state&apos;s regen workflow to create the public share page.
                </div>
              </div>
              <button
                type="button"
                disabled={deployActorModal.status === "deploying"}
                onClick={() => setDeployActorModal(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 disabled:opacity-40"
                style={{ color: "rgba(245,245,245,0.5)" }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <label className="block text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.48)" }}>
                Display name
                <input
                  value={deployActorModal.display_name}
                  onChange={e => setDeployActorModal(prev => prev ? { ...prev, display_name: e.target.value, status: "idle", message: null } : prev)}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: "rgba(0,0,0,0.34)", color: "white", border: "1px solid rgba(255,255,255,0.14)" }}
                />
              </label>
              <label className="block text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.48)" }}>
                State
                <input
                  value={deployActorModal.state_abbr}
                  readOnly
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(245,245,245,0.7)", border: "1px solid rgba(255,255,255,0.10)" }}
                />
              </label>
              <label className="block text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.48)" }}>
                Portrait photo
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={deployActorModal.status === "deploying"}
                  onChange={e => {
                    const file = e.target.files?.[0] ?? null;
                    setDeployActorModal(prev => prev ? { ...prev, photo_file: file, status: "idle", message: null } : prev);
                  }}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: "rgba(0,0,0,0.34)", color: "white", border: "1px solid rgba(255,255,255,0.14)" }}
                />
                <span className="block mt-1 text-[11px] normal-case font-normal tracking-normal"
                  style={{ color: "rgba(245,245,245,0.38)" }}>
                  Optional PNG or JPEG headshot. If you choose the photo from the pending-live folder, it will be committed with the actor and regenerated from GitHub.
                </span>
              </label>
              {deployActorModal.message && (
                <div className="rounded-lg px-3 py-2 text-xs"
                  style={{
                    backgroundColor: deployActorModal.status === "error" ? "rgba(185,28,28,0.14)" : "rgba(74,222,128,0.10)",
                    color: deployActorModal.status === "error" ? "rgb(252,165,165)" : "rgb(134,239,172)",
                    border: `1px solid ${deployActorModal.status === "error" ? "rgba(185,28,28,0.35)" : "rgba(74,222,128,0.24)"}`,
                  }}>
                  {deployActorModal.message}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={deployActorModal.status === "deploying"}
                  onClick={() => setDeployActorModal(null)}
                  className="text-xs px-3 py-2 rounded-lg font-bold disabled:opacity-40"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.68)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deployActorModal.status === "deploying" || !deployActorModal.display_name.trim()}
                  onClick={() => void deployActorFromModal()}
                  className="text-xs px-4 py-2 rounded-lg font-bold disabled:opacity-50"
                  style={{ backgroundColor: "rgba(201,162,39,0.18)", color: GOLD, border: "1px solid rgba(201,162,39,0.38)" }}>
                  {deployActorModal.status === "deploying" ? "Creating..." : "Create share page"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {replacePhotoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
          onClick={e => {
            if (e.target === e.currentTarget && replacePhotoModal.status !== "uploading") setReplacePhotoModal(null);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#0F1E30", border: `1px solid rgba(201,162,39,0.35)` }}>
            <div className="px-6 py-4 flex items-start justify-between gap-4"
              style={{ borderBottom: `1px solid rgba(201,162,39,0.2)`, backgroundColor: "rgba(30,58,95,0.6)" }}>
              <div>
                <div className="font-black text-white text-base leading-none">Replace actor photo</div>
                <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.45)" }}>
                  This commits a new 1080×1920 PNG and queues that state&apos;s regen workflow.
                </div>
              </div>
              <button
                type="button"
                disabled={replacePhotoModal.status === "uploading"}
                onClick={() => setReplacePhotoModal(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 disabled:opacity-40"
                style={{ color: "rgba(245,245,245,0.5)" }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="rounded-lg px-3 py-2 text-xs"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(245,245,245,0.65)", border: "1px solid rgba(255,255,255,0.10)" }}>
                {replacePhotoModal.display_name} · {replacePhotoModal.state_abbr} · {replacePhotoModal.slug}
              </div>
              <label className="block text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.48)" }}>
                Replacement photo
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={replacePhotoModal.status === "uploading"}
                  onChange={e => {
                    const file = e.target.files?.[0] ?? null;
                    setReplacePhotoModal(prev => prev ? { ...prev, photo_file: file, status: "idle", message: null } : prev);
                  }}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: "rgba(0,0,0,0.34)", color: "white", border: "1px solid rgba(255,255,255,0.14)" }}
                />
                <span className="block mt-1 text-[11px] normal-case font-normal tracking-normal"
                  style={{ color: "rgba(245,245,245,0.38)" }}>
                  PNG or JPEG headshot only. The share renderer fits portrait, square, and landscape headshots into the card.
                </span>
              </label>
              {replacePhotoModal.message && (
                <div className="rounded-lg px-3 py-2 text-xs"
                  style={{
                    backgroundColor: replacePhotoModal.status === "error" ? "rgba(185,28,28,0.14)" : "rgba(74,222,128,0.10)",
                    color: replacePhotoModal.status === "error" ? "rgb(252,165,165)" : "rgb(134,239,172)",
                    border: `1px solid ${replacePhotoModal.status === "error" ? "rgba(185,28,28,0.35)" : "rgba(74,222,128,0.24)"}`,
                  }}>
                  {replacePhotoModal.message}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={replacePhotoModal.status === "uploading"}
                  onClick={() => setReplacePhotoModal(null)}
                  className="text-xs px-3 py-2 rounded-lg font-bold disabled:opacity-40"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.68)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={replacePhotoModal.status === "uploading" || !replacePhotoModal.photo_file}
                  onClick={() => void replacePhotoFromModal()}
                  className="text-xs px-4 py-2 rounded-lg font-bold disabled:opacity-50"
                  style={{ backgroundColor: "rgba(201,162,39,0.18)", color: GOLD, border: "1px solid rgba(201,162,39,0.38)" }}>
                  {replacePhotoModal.status === "uploading" ? "Uploading..." : "Replace photo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reporting Review Modal — inspect mismatches before deleting anything ── */}
      {(auditReview || auditReviewLoading || auditReviewError) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) { setAuditReview(null); setAuditReviewError(null); setAuditReviewContext(null); } }}
        >
          <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#0F1E30", border: `1px solid rgba(201,162,39,0.35)` }}>

            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
              style={{ borderBottom: `1px solid rgba(201,162,39,0.2)`, backgroundColor: "rgba(30,58,95,0.6)" }}>
              <div>
                <div className="font-black text-white text-base leading-none">
                  Review reporting data{auditReview?.state ? ` · ${auditReview.state}` : ""}
                </div>
                <div className="text-xs mt-1 max-w-3xl" style={{ color: "rgba(245,245,245,0.45)" }}>
                  For each duplicate group, decide: <strong>Same family</strong> (duplicate import — same family, same case, only one counts), <strong>Different case</strong> (real separate court matter — counts on its own; can be the same family with another case OR unrelated families), <strong>Superseded</strong> (older survey replaced by a newer one), or <strong>Delete</strong> (hide obvious junk without removing it from Supabase).
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowReviewedAuditGroups(v => !v)}
                  className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: showReviewedAuditGroups ? "rgba(201,162,39,0.18)" : "rgba(255,255,255,0.05)",
                    color: showReviewedAuditGroups ? GOLD : "rgba(245,245,245,0.6)",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}>
                  {showReviewedAuditGroups ? "Hide reviewed" : "Show reviewed"}
                </button>
                <button onClick={() => { setAuditReview(null); setAuditReviewError(null); setAuditReviewContext(null); }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                  style={{ color: "rgba(245,245,245,0.5)" }} aria-label="Close">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {auditReviewLoading && (
                <div className="py-12 text-center text-sm" style={{ color: "rgba(245,245,245,0.45)" }}>
                  Loading review data…
                </div>
              )}

              {auditReviewError && (
                <div className="rounded-xl px-4 py-3 text-sm"
                  style={{ backgroundColor: "rgba(185,28,28,0.14)", color: "rgb(252,165,165)", border: "1px solid rgba(185,28,28,0.35)" }}>
                  {auditReviewError}
                </div>
              )}

              {auditReview && (
                <>
                  {/* ── Reporting status panel — what does the mismatch number actually mean? ── */}
                  {auditReviewContext && (() => {
                    const ctx = auditReviewContext;
                    const meta = auditStatusMeta(ctx.reporting_status);
                    const dashCount = ctx.dashboard_families;
                    const dedupedCount = ctx.deduped_view_families;
                    const pdfCount = ctx.pdf_index_families;
                    const dashVsDeduped = ctx.delta_dashboard_vs_deduped;
                    const dashVsPdf = pdfCount === null ? null : dashCount - pdfCount;
                    const numCard = (label: string, value: number | null, hint?: string) => (
                      <div className="rounded-xl px-4 py-3"
                        style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
                        <div className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.4)" }}>{label}</div>
                        <div className="text-2xl font-black mt-1 text-white">{value === null ? "—" : fmtNum(value)}</div>
                        {hint && <div className="text-[10px] mt-1" style={{ color: "rgba(245,245,245,0.4)" }}>{hint}</div>}
                      </div>
                    );
                    const deltaCard = (label: string, value: number | null, hint: string) => {
                      const isMismatch = value !== null && value !== 0;
                      return (
                        <div className="rounded-xl px-4 py-3"
                          style={{
                            backgroundColor: isMismatch ? "rgba(234,179,8,0.10)" : "rgba(74,222,128,0.08)",
                            border: `1px solid ${isMismatch ? "rgba(234,179,8,0.32)" : "rgba(74,222,128,0.22)"}`,
                          }}>
                          <div className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.5)" }}>{label}</div>
                          <div className="text-2xl font-black mt-1" style={{ color: isMismatch ? "rgb(253,224,71)" : "rgb(134,239,172)" }}>
                            {value === null ? "—" : (value > 0 ? `+${fmtNum(value)}` : fmtNum(value))}
                          </div>
                          <div className="text-[10px] mt-1" style={{ color: "rgba(245,245,245,0.4)" }}>{hint}</div>
                        </div>
                      );
                    };
                    return (
                      <div className="rounded-2xl px-5 py-4 space-y-4"
                        style={{ backgroundColor: "rgba(30,58,95,0.32)", border: "1px solid rgba(201,162,39,0.22)" }}>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <div className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.45)" }}>Reporting status</div>
                            <div className="text-base font-black text-white mt-0.5">{ctx.state} · {meta.label}</div>
                          </div>
                          <span className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                            style={{
                              backgroundColor:
                                ctx.reporting_status === "ok" ? "rgba(74,222,128,0.16)" :
                                ctx.reporting_status === "count_mismatch" ? "rgba(234,179,8,0.18)" :
                                ctx.reporting_status === "missing_pdf" ? "rgba(239,68,68,0.16)" :
                                ctx.reporting_status === "stale_pdf" ? "rgba(96,165,250,0.16)" :
                                "rgba(255,255,255,0.06)",
                              color:
                                ctx.reporting_status === "ok" ? "rgb(134,239,172)" :
                                ctx.reporting_status === "count_mismatch" ? "rgb(253,224,71)" :
                                ctx.reporting_status === "missing_pdf" ? "rgb(252,165,165)" :
                                ctx.reporting_status === "stale_pdf" ? "rgb(147,197,253)" :
                                "rgba(245,245,245,0.6)",
                              border: "1px solid rgba(255,255,255,0.16)",
                            }}>
                            {ctx.reporting_status.replace("_", " ")}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {numCard("Dashboard count", dashCount, "movement_stats_by_state · live")}
                          {numCard("Deduped view count", dedupedCount, dedupedCount === null ? "view not deployed" : "movement_deduped_submissions · per-row dedup")}
                          {numCard("PDF index count", pdfCount, pdfCount === null ? "no PDF for this state" : "public/state-reports/index.json")}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {deltaCard("Δ Dashboard vs Deduped view", dashVsDeduped, "Non-zero = financial-fingerprint twins or Different case decisions diverging between the two views")}
                          {deltaCard("Δ Dashboard vs PDF index", dashVsPdf, "Non-zero = PDF was generated against an older dashboard snapshot (stale PDF)")}
                        </div>

                        <div className="rounded-xl px-4 py-3 text-xs leading-relaxed"
                          style={{ backgroundColor: "rgba(0,0,0,0.18)", color: "rgba(245,245,245,0.65)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <strong style={{ color: "rgba(245,245,245,0.85)" }}>Three independent things can cause a mismatch:</strong>
                          <ol className="list-decimal pl-5 mt-1 space-y-1">
                            <li><strong>Same-email review</strong> — two rows in this state share the same email and need a manual <em>Same family / Different case / Delete</em> decision. Shown below in <em>Rows grouped by same email and state</em>.</li>
                            <li><strong>Financial-fingerprint review</strong> — two rows share the same county + dollar amounts + months lost (likely dual imports or twins). These do not appear in the same-email section. They will be reviewed via the reconciliation export at <code>outputs/reconciliation/&lt;date&gt;/dedupe-candidates.html</code>, or a future financial-fingerprint section in this modal.</li>
                            <li><strong>Stale PDF / index</strong> — the dashboard updated since the last PDF regeneration, so the PDF still shows an older count. Fixed by regenerating that state PDF or all PDFs once same-email and financial-fingerprint reviews are resolved.</li>
                          </ol>
                          <div className="mt-2" style={{ color: "rgba(245,245,245,0.45)" }}>
                            Migration 020 (financial-fingerprint dedup) and migration 022 (placeholder-email dedup) are intentionally on hold until the financial-fingerprint candidate groups are reviewed. PDFs are not regenerated until both are applied.
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      ["Raw rows", auditReview.summary.raw_rows],
                      ["Deduped families", auditReview.summary.deduped_families],
                      ["Same-email groups", auditReview.summary.duplicate_groups],
                      ["Hidden by dedupe", auditReview.summary.hidden_by_dedupe],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl px-4 py-3"
                        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        <div className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.4)" }}>{label}</div>
                        <div className="text-2xl font-black mt-1" style={{ color: label === "Hidden by dedupe" && Number(value) > 0 ? GOLD : "white" }}>
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {auditReview.duplicate_groups.filter(group => showReviewedAuditGroups || !auditGroupReviewed(group)).length === 0 ? (
                    <div className="rounded-xl px-4 py-4 text-sm"
                      style={{ backgroundColor: "rgba(74,222,128,0.08)", color: "rgba(245,245,245,0.75)", border: "1px solid rgba(74,222,128,0.2)" }}>
                      {auditReview.duplicate_groups.length === 0
                        ? `No same-email duplicate groups were found for ${auditReview.state}. If the audit table still says mismatch, the most likely cause is a stale PDF/index. Regenerate that state PDF or regenerate all 30+ PDFs.`
                        : `All same-email duplicate groups for ${auditReview.state} are reviewed. Use Show reviewed if you need to reopen what you just labeled.`}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-black text-white text-sm">Rows grouped by same email and state</h3>
                        <p className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.45)" }}>
                          For each row decide:
                          {" "}<strong style={{ color: "rgba(134,239,172,1)" }}>Same family</strong> (duplicate of its twin — same family, same case, only one counts),
                          {" "}<strong style={{ color: "rgba(253,224,71,1)" }}>Different case</strong> (real separate court matter — counts on its own; can still be the same family with another case),
                          {" "}<strong style={{ color: "rgba(216,180,254,1)" }}>Superseded</strong> (older survey replaced by the newest row),
                          {" "}or <strong style={{ color: "rgba(252,165,165,1)" }}>Delete</strong> (obvious junk import, test row, or wrong state — hides the row without deleting it).
                        </p>
                      </div>

                      {auditReview.duplicate_groups
                        .filter(group => showReviewedAuditGroups || !auditGroupReviewed(group))
                        .map(group => {
                        const groupReviewed = auditGroupReviewed(group);
                        const surveyRows = group.rows.filter(row => row.source_table === "survey_submissions");
                        const newestSurveyRow = surveyRows
                          .slice()
                          .sort((a, b) => {
                            const aMs = a.created_at ? Date.parse(a.created_at) : 0;
                            const bMs = b.created_at ? Date.parse(b.created_at) : 0;
                            return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
                          })[0];
                        const supersedableRows = newestSurveyRow
                          ? surveyRows.filter(row => row.id !== newestSurveyRow.id && row.review_decision !== "superseded")
                          : [];
                        const canSupersede = supersedableRows.length > 0;
                        const canMerge = group.rows.length === 2 && surveyRows.length === 2 && !!group.email;
                        const winnerRow = group.rows.find(row => row.dedupe_winner) ?? group.rows[0];
                        const loserRow = group.rows.find(row => row !== winnerRow);
                        return (
                        <div key={group.family_key} className="rounded-xl overflow-hidden"
                          style={{ backgroundColor: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
                            style={{ backgroundColor: "rgba(30,58,95,0.45)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                            <div>
                              <div className="text-xs font-bold text-white">{group.email || "No email"}</div>
                              <div className="text-[11px]" style={{ color: "rgba(245,245,245,0.4)" }}>
                                {group.rows.length} rows · counted as {auditGroupCountedFamilies(group)} {auditGroupCountedFamilies(group) === 1 ? "family" : "families"}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {canSupersede && (
                                <button
                                  type="button"
                                  onClick={() => supersedeAuditReviewGroup(group)}
                                  disabled={supersedingAuditGroup === group.family_key}
                                  className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80 disabled:opacity-40"
                                  style={{ backgroundColor: "rgba(168,85,247,0.14)", color: "rgb(216,180,254)", border: "1px solid rgba(168,85,247,0.35)" }}
                                  title="Mark older survey submissions in this same-email group as superseded. The newest survey stays live; older quotes stay in Supabase but are hidden from public output."
                                >
                                  {supersedingAuditGroup === group.family_key ? "Saving…" : "Superseded — hide old quote"}
                                </button>
                              )}
                              {canMerge && winnerRow && loserRow && (
                                <button
                                  type="button"
                                  onClick={() => openMergePreview(auditReview.state, winnerRow.id, loserRow.id)}
                                  disabled={mergeLoading}
                                  className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80 disabled:opacity-40"
                                  style={{ backgroundColor: "rgba(96,165,250,0.14)", color: "rgb(147,197,253)", border: "1px solid rgba(96,165,250,0.35)" }}
                                  title="Merge these two rows into one record. The winner row keeps the smart-merged values; the loser row is deleted. Court actors attached to the loser are reassigned to the winner."
                                >
                                  {mergeLoading ? "Loading…" : "Merge group"}
                                </button>
                              )}
                              {groupReviewed ? (
                                <span className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                                  style={{ backgroundColor: "rgba(74,222,128,0.14)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.28)" }}>
                                  Reviewed
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide"
                                  style={{ backgroundColor: "rgba(234,179,8,0.16)", color: "rgb(253,224,71)", border: "1px solid rgba(234,179,8,0.35)" }}>
                                  Review
                                </span>
                              )}
                            </div>
                          </div>

                          <div>
                            {group.rows.map(row => (
                              <div key={`${row.source_table}-${row.id}`} className="px-4 py-4"
                                style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-sm text-white">{auditReviewName(row)}</span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                        style={{
                                          backgroundColor: row.source_table === "survey_submissions" ? "rgba(74,222,128,0.14)" : "rgba(59,130,246,0.14)",
                                          color: row.source_table === "survey_submissions" ? "rgb(134,239,172)" : "rgb(147,197,253)",
                                          border: row.source_table === "survey_submissions" ? "1px solid rgba(74,222,128,0.28)" : "1px solid rgba(59,130,246,0.25)",
                                        }}>
                                        {auditReviewSource(row)}
                                      </span>
                                      {row.dedupe_winner && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                          style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: "1px solid rgba(201,162,39,0.35)" }}>
                                          Counted
                                        </span>
                                      )}
                                      {row.review_decision === "keep" && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                          style={{ backgroundColor: "rgba(74,222,128,0.14)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.28)" }}>
                                          Same family
                                        </span>
                                      )}
                                      {row.review_decision === "count_separately" && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                          style={{ backgroundColor: "rgba(234,179,8,0.18)", color: "rgb(253,224,71)", border: "1px solid rgba(234,179,8,0.38)" }}>
                                          Different case
                                        </span>
                                      )}
                                      {row.review_decision === "superseded" && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                          style={{ backgroundColor: "rgba(168,85,247,0.16)", color: "rgb(216,180,254)", border: "1px solid rgba(168,85,247,0.38)" }}
                                          title="Older submission replaced by a newer survey row. Hidden from public counts and quotes until restored.">
                                          Superseded
                                        </span>
                                      )}
                                      {row.review_decision === "delete" && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                          style={{ backgroundColor: "rgba(239,68,68,0.16)", color: "rgb(252,165,165)", border: "1px solid rgba(239,68,68,0.38)" }}
                                          title="Hidden by admin review. The source row still exists in Supabase and can be restored.">
                                          Hidden
                                        </span>
                                      )}
                                      {row.is_placeholder_email && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                          style={{ backgroundColor: "rgba(239,68,68,0.16)", color: "rgb(252,165,165)", border: "1px solid rgba(239,68,68,0.38)" }}
                                          title="Placeholder email (anonymous@anonymous.com etc). Not auto-deduped — different families often share these.">
                                          Placeholder email
                                        </span>
                                      )}
                                    </div>

                                    <div className="mt-1 text-[11px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: "rgba(245,245,245,0.48)" }}>
                                      <span>{shortDate(row.created_at)}</span>
                                      {row.case_county && <span>{row.case_county}</span>}
                                      {row.case_status && <span>{row.case_status}</span>}
                                      {row.system_affected && <span>{row.system_affected}</span>}
                                      {row.total_financial_loss != null && <span>{fmt$(Number(row.total_financial_loss) || null)}</span>}
                                      {row.months_lost_parenting_time != null && <span>{row.months_lost_parenting_time} months lost</span>}
                                    </div>

                                    {row.impact_quote && (
                                      <blockquote className="mt-2 text-xs italic pl-3"
                                        style={{ borderLeft: `2px solid rgba(201,162,39,0.35)`, color: "rgba(245,245,245,0.65)" }}>
                                        &ldquo;{row.impact_quote.slice(0, 260)}{row.impact_quote.length > 260 ? "…" : ""}&rdquo;
                                      </blockquote>
                                    )}

                                    <AuditReviewDetails row={row} />
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {row.review_decision === "superseded" || row.review_decision === "delete" ? (
                                      <button
                                        type="button"
                                        onClick={() => restoreAuditReviewRow(row)}
                                        disabled={restoringAuditRow === auditRowKey(row)}
                                        className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80 disabled:opacity-40"
                                        style={{ backgroundColor: "rgba(96,165,250,0.14)", color: "rgb(147,197,253)", border: "1px solid rgba(96,165,250,0.35)" }}
                                        title="Clear the review decision so this row counts and can surface publicly again."
                                      >
                                        {restoringAuditRow === auditRowKey(row) ? "Restoring…" : "Restore / Take live"}
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => keepAuditReviewRow(row)}
                                          disabled={keepingAuditRow === auditRowKey(row)}
                                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80"
                                          style={{ backgroundColor: "rgba(74,222,128,0.08)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.22)" }}
                                          title="Same family — this row + its twin are one family. Normal dedup applies, only one counts. Use this for confirmed duplicates."
                                        >
                                          {keepingAuditRow === auditRowKey(row) ? "Saving…" : row.review_decision === "keep" ? "Same family ✓" : "Same family"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => countAuditReviewRowSeparately(row)}
                                          disabled={countingSeparatelyAuditRow === auditRowKey(row)}
                                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80 disabled:opacity-40"
                                          style={{ backgroundColor: "rgba(234,179,8,0.12)", color: "rgb(253,224,71)", border: "1px solid rgba(234,179,8,0.35)" }}
                                          title="Different case — real separate court matter (CPS vs family court, different kids, etc). This row counts on its own. Can still be the same family — they just have more than one case."
                                        >
                                          {countingSeparatelyAuditRow === auditRowKey(row)
                                            ? "Saving…"
                                            : row.review_decision === "count_separately"
                                              ? "Different case ✓"
                                              : "Different case"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deleteAuditReviewRow(row)}
                                          disabled={deletingAuditRow === row.id}
                                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80 disabled:opacity-40"
                                          style={{ backgroundColor: "rgba(185,28,28,0.14)", color: "rgb(252,165,165)", border: "1px solid rgba(185,28,28,0.35)" }}
                                        >
                                          {deletingAuditRow === row.id ? "Saving…" : "Delete"}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {auditReview.financial_fingerprint_groups && auditReview.financial_fingerprint_groups.filter(group => showReviewedAuditGroups || !auditGroupReviewed(group)).length > 0 && (
                    <div className="space-y-3">
                      <div className="rounded-xl px-4 py-3"
                        style={{ backgroundColor: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.35)" }}>
                        <h3 className="font-black text-white text-sm">Financial-fingerprint candidates · {auditReview.state}</h3>
                        <p className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.7)" }}>
                          These rows share the same state + county + fee vector + months lost. Migration 020 (held)
                          would auto-collapse each group to a single counted family. <strong>Review each group with
                          case-type fields visible</strong> — identical financials can come from one person submitted
                          twice (mark <strong style={{ color: "rgba(134,239,172,1)" }}>Same family</strong>) OR one
                          person with two real cases like CPS + family court (mark
                          <strong style={{ color: "rgba(253,224,71,1)" }}> Different case</strong>). Use
                          <strong style={{ color: "rgba(252,165,165,1)" }}> Delete</strong> to hide obvious junk without removing it from Supabase — e.g.
                          a legacy_v1_email_corrupted row that is just a dual-import twin of a current survey row.
                          Same-email collisions and placeholder-email rows are excluded here so you do not review
                          them twice.
                        </p>
                      </div>

                      {auditReview.financial_fingerprint_groups
                        .filter(group => showReviewedAuditGroups || !auditGroupReviewed(group))
                        .map(group => (
                        <div key={`fp-${group.family_key}`} className="rounded-xl overflow-hidden"
                          style={{ backgroundColor: "rgba(255,255,255,0.025)", border: "1px solid rgba(234,179,8,0.22)" }}>
                          <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
                            style={{ backgroundColor: "rgba(234,179,8,0.06)", borderBottom: "1px solid rgba(234,179,8,0.16)" }}>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white">
                                Financial twin · {group.rows[0]?.case_county || "(no county)"}
                              </div>
                              <div className="text-[11px]" style={{ color: "rgba(245,245,245,0.5)" }}>
                                {group.rows.length} rows · would collapse to 1 family under migration 020
                              </div>
                              <div className="text-[10px] mt-1 font-mono break-all" style={{ color: "rgba(245,245,245,0.32)" }}>
                                {group.family_key}
                              </div>
                            </div>
                          </div>

                          <div className="divide-y divide-white/5">
                            {group.rows.map(row => {
                              const fees: Array<[string, number | null]> = [
                                ["Atty", row.attorney_fees],
                                ["GAL", row.gal_fees],
                                ["Therapy", row.therapy_eval_fees],
                                ["Reunif", row.reunification_fees],
                                ["Other", row.other_court_actors_fees],
                                ["Wages", row.lost_wages],
                                ["Assets", row.asset_liquidation_loss],
                              ];
                              return (
                                <div key={`fp-row-${row.source_table}-${row.id}`} className="px-4 py-4">
                                  <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-sm text-white">{auditReviewName(row)}</span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                          style={{
                                            backgroundColor: row.source_table === "survey_submissions" ? "rgba(74,222,128,0.14)" : "rgba(59,130,246,0.14)",
                                            color: row.source_table === "survey_submissions" ? "rgb(134,239,172)" : "rgb(147,197,253)",
                                            border: row.source_table === "survey_submissions" ? "1px solid rgba(74,222,128,0.28)" : "1px solid rgba(59,130,246,0.25)",
                                          }}>
                                          {auditReviewSource(row)}
                                        </span>
                                        {row.review_decision === "count_separately" && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                            style={{ backgroundColor: "rgba(234,179,8,0.18)", color: "rgb(253,224,71)", border: "1px solid rgba(234,179,8,0.38)" }}>
                                            Different case
                                          </span>
                                        )}
                                        {row.review_decision === "keep" && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                            style={{ backgroundColor: "rgba(74,222,128,0.14)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.28)" }}>
                                            Same family
                                          </span>
                                        )}
                                        {row.review_decision === "superseded" && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                            style={{ backgroundColor: "rgba(168,85,247,0.16)", color: "rgb(216,180,254)", border: "1px solid rgba(168,85,247,0.38)" }}>
                                            Superseded
                                          </span>
                                        )}
                                        {row.review_decision === "delete" && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                            style={{ backgroundColor: "rgba(239,68,68,0.16)", color: "rgb(252,165,165)", border: "1px solid rgba(239,68,68,0.38)" }}>
                                            Hidden
                                          </span>
                                        )}
                                        {row.is_placeholder_email && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                            style={{ backgroundColor: "rgba(239,68,68,0.16)", color: "rgb(252,165,165)", border: "1px solid rgba(239,68,68,0.38)" }}>
                                            Placeholder email
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] mt-1" style={{ color: "rgba(245,245,245,0.5)" }}>
                                        {row.email || "no email"} · {shortDate(row.created_at)}
                                      </div>

                                      {/* Case-type fields — what determines if these are 2 real cases vs 1 dup */}
                                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                                        {[
                                          ["System affected", row.system_affected],
                                          ["Allegation", row.allegation_type],
                                          ["Custody", row.custody_status],
                                          ["County", row.case_county],
                                          ["# of kids", row.number_of_kids],
                                          ["Time in system", row.time_in_system],
                                        ].map(([label, value]) => (
                                          <div key={`fp-case-${row.source_table}-${row.id}-${label}`} className="rounded px-2 py-1.5"
                                            style={{ backgroundColor: "rgba(0,0,0,0.18)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                            <div className="text-[9px] uppercase tracking-wide font-bold" style={{ color: "rgba(245,245,245,0.35)" }}>{label}</div>
                                            <div className="text-[11px] mt-0.5 break-words" style={{ color: "rgba(245,245,245,0.78)" }}>
                                              {value === null || value === undefined || value === "" ? "—" : String(value)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Fee vector — should be identical across all rows in the group */}
                                      <div className="flex flex-wrap gap-2 mt-3">
                                        {fees.map(([label, val]) => (
                                          <span key={`fp-fee-${row.source_table}-${row.id}-${label}`}
                                            className="text-[10px] px-2 py-0.5 rounded font-mono"
                                            style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(245,245,245,0.55)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                            {label}: {val === null || val === undefined ? "—" : auditReviewMoney(val)}
                                          </span>
                                        ))}
                                        <span className="text-[10px] px-2 py-0.5 rounded font-mono"
                                          style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(245,245,245,0.55)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                          Mo lost: {row.months_lost_parenting_time ?? "—"}
                                        </span>
                                      </div>

                                      <AuditReviewDetails row={row} />
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      {row.review_decision === "superseded" || row.review_decision === "delete" ? (
                                        <button
                                          type="button"
                                          onClick={() => restoreAuditReviewRow(row)}
                                          disabled={restoringAuditRow === auditRowKey(row)}
                                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80 disabled:opacity-40"
                                          style={{ backgroundColor: "rgba(96,165,250,0.14)", color: "rgb(147,197,253)", border: "1px solid rgba(96,165,250,0.35)" }}
                                          title="Clear the review decision so this row counts and can surface publicly again."
                                        >
                                          {restoringAuditRow === auditRowKey(row) ? "Restoring…" : "Restore / Take live"}
                                        </button>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => keepAuditReviewRow(row)}
                                            disabled={keepingAuditRow === auditRowKey(row)}
                                            className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80"
                                            style={{ backgroundColor: "rgba(74,222,128,0.08)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.22)" }}
                                            title="Same family — this row + its twin are one family. Migration 020 (when applied) will collapse them to 1 counted family."
                                          >
                                            {keepingAuditRow === auditRowKey(row) ? "Saving…" : row.review_decision === "keep" ? "Same family ✓" : "Same family"}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => countAuditReviewRowSeparately(row)}
                                            disabled={countingSeparatelyAuditRow === auditRowKey(row)}
                                            className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80 disabled:opacity-40"
                                            style={{ backgroundColor: "rgba(234,179,8,0.12)", color: "rgb(253,224,71)", border: "1px solid rgba(234,179,8,0.35)" }}
                                            title="Different case — real separate cases (e.g. one CPS case and one family court case for the same family, or unrelated families with identical financials). This row counts on its own and is bypassed by migration 020."
                                          >
                                            {countingSeparatelyAuditRow === auditRowKey(row)
                                              ? "Saving…"
                                              : row.review_decision === "count_separately"
                                                ? "Different case ✓"
                                                : "Different case"}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => deleteAuditReviewRow(row)}
                                            disabled={deletingAuditRow === row.id}
                                            className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80 disabled:opacity-40"
                                            style={{ backgroundColor: "rgba(185,28,28,0.14)", color: "rgb(252,165,165)", border: "1px solid rgba(185,28,28,0.35)" }}
                                            title="Delete row — hides it without removing it from Supabase. Use for obvious junk: a legacy_v1_email_corrupted row that is just a dual-import twin of a current survey row, test rows, or wrong-state imports."
                                          >
                                            {deletingAuditRow === row.id ? "Saving…" : "Delete"}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {auditReview.placeholder_email_groups && auditReview.placeholder_email_groups.length > 0 && (
                    <div className="space-y-3">
                      <div className="rounded-xl px-4 py-3"
                        style={{ backgroundColor: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.32)" }}>
                        <h3 className="font-black text-white text-sm">Rows sharing a placeholder email · {auditReview.state}</h3>
                        <p className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.7)" }}>
                          These rows use placeholder addresses (anonymous@anonymous.com, n/a, test@test.com, etc).
                          They are <strong>NOT auto-deduped</strong> — different families often share placeholder
                          emails, so each row is counted separately by default. If two rows below really are the
                          same family, use Merge group inside the same-email section after marking them with the
                          same real email.
                        </p>
                      </div>

                      {auditReview.placeholder_email_groups.map(group => (
                        <div key={`placeholder-${group.family_key}`} className="rounded-xl overflow-hidden"
                          style={{ backgroundColor: "rgba(255,255,255,0.025)", border: "1px solid rgba(239,68,68,0.22)" }}>
                          <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
                            style={{ backgroundColor: "rgba(239,68,68,0.08)", borderBottom: "1px solid rgba(239,68,68,0.16)" }}>
                            <div>
                              <div className="text-xs font-bold text-white">{group.email || "(placeholder email)"}</div>
                              <div className="text-[11px]" style={{ color: "rgba(245,245,245,0.5)" }}>
                                {group.rows.length} rows · counted as {group.rows.length} families (placeholder, not auto-deduped)
                              </div>
                            </div>
                          </div>
                          <div className="divide-y divide-white/5">
                            {group.rows.map(row => (
                              <div key={`placeholder-row-${row.source_table}-${row.id}`} className="px-4 py-3 text-xs">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="min-w-0">
                                    <span className="font-bold text-white">{auditReviewName(row)}</span>
                                    <span style={{ color: "rgba(245,245,245,0.4)" }}> · {auditReviewSource(row)} · {shortDate(row.created_at)}</span>
                                  </div>
                                </div>
                                <AuditReviewDetails row={row} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <details className="rounded-xl overflow-hidden"
                    style={{ backgroundColor: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-white">
                      Show all {auditReview.rows.length} source rows in {auditReview.state}
                    </summary>
                    <div className="divide-y divide-white/5">
                      {auditReview.rows.map(row => (
                        <div key={`all-${row.source_table}-${row.id}`} className="px-4 py-3 text-xs">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <span className="font-bold text-white">{auditReviewName(row)}</span>
                              <span style={{ color: "rgba(245,245,245,0.4)" }}> · {row.email || "no email"} · {auditReviewSource(row)} · {shortDate(row.created_at)}</span>
                            </div>
                            {row.dedupe_winner ? (
                              <span style={{ color: GOLD }}>counted</span>
                            ) : (
                              <span style={{ color: "rgba(245,245,245,0.35)" }}>hidden by dedupe</span>
                            )}
                          </div>
                          <AuditReviewDetails row={row} />
                        </div>
                      ))}
                    </div>
                  </details>
                </>
              )}
            </div>

            {/* ── Sticky footer — explicit "done with this state" action ── */}
            {auditReview && (() => {
              const allGroups = [
                ...auditReview.duplicate_groups,
                ...(auditReview.financial_fingerprint_groups ?? []),
                ...(auditReview.placeholder_email_groups ?? []),
              ];
              const totalGroups = allGroups.length;
              // Strict check — a group with one decided row out of three is
              // NOT reviewed; the loose .some() lit the Done button gold
              // while rows were still unresolved.
              const reviewedGroups = allGroups.filter(g => auditGroupReviewed(g)).length;
              const allReviewed = totalGroups > 0 && reviewedGroups === totalGroups;
              const stateLabel = auditReview.state || "this state";
              return (
                <div className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap flex-shrink-0"
                  style={{ borderTop: "1px solid rgba(201,162,39,0.2)", backgroundColor: "rgba(15,30,48,0.94)" }}>
                  <div className="text-xs" style={{ color: "rgba(245,245,245,0.55)" }}>
                    {totalGroups === 0 ? (
                      <>No review groups for {stateLabel}. Decisions auto-save as you click — close when ready.</>
                    ) : (
                      <>
                        <strong style={{ color: "rgba(245,245,245,0.85)" }}>{reviewedGroups}</strong>
                        <span> of </span>
                        <strong style={{ color: "rgba(245,245,245,0.85)" }}>{totalGroups}</strong>
                        <span> groups reviewed in {stateLabel}. Each Same family / Different case / Delete saves immediately — this button just refreshes the audit table and closes.</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={finishAuditReview}
                    disabled={auditReviewFinishing}
                    className="text-xs px-4 py-2 rounded-lg font-bold uppercase tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{
                      backgroundColor: allReviewed ? "rgba(201,162,39,0.92)" : "rgba(201,162,39,0.18)",
                      color: allReviewed ? "rgb(15,30,48)" : GOLD,
                      border: `1px solid ${allReviewed ? "rgba(201,162,39,0.95)" : "rgba(201,162,39,0.45)"}`,
                    }}
                    title={allReviewed
                      ? `All ${totalGroups} groups in ${stateLabel} reviewed. Refresh the audit table and close the modal.`
                      : `Refresh the audit table and close. You can reopen ${stateLabel} any time to keep reviewing.`}>
                    {auditReviewFinishing
                      ? "Refreshing…"
                      : allReviewed
                        ? `Done with ${stateLabel} — save & close`
                        : `Close ${stateLabel} & refresh`}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Nudge Modal — pre-written email with copy buttons ── */}
      {nudgeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setNudgeTarget(null); }}
        >
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#0F1E30", border: `1px solid rgba(201,162,39,0.35)` }}>

            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
              style={{ borderBottom: `1px solid rgba(201,162,39,0.2)`, backgroundColor: "rgba(30,58,95,0.6)" }}>
              <div>
                <div className="font-black text-white text-base leading-none">Nudge this family</div>
                <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.4)" }}>
                  Edit the message, then send it from info@standwithmeg.com or copy it into your mail app.
                </div>
              </div>
              <button onClick={() => setNudgeTarget(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                style={{ color: "rgba(245,245,245,0.5)" }} aria-label="Close">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

              {/* Email */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.5)" }}>To</label>
                  <button onClick={() => copyToClip(nudgeTarget.email, "email")}
                    className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide transition-colors"
                    style={{
                      backgroundColor: nudgeCopied === "email" ? "rgba(74,222,128,0.2)" : "rgba(201,162,39,0.15)",
                      color: nudgeCopied === "email" ? "rgb(134,239,172)" : GOLD,
                      border: "1px solid " + (nudgeCopied === "email" ? "rgba(74,222,128,0.3)" : "rgba(201,162,39,0.3)"),
                    }}>
                    {nudgeCopied === "email" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
                <input
                  type="email"
                  value={nudgeTarget.email}
                  onChange={e => updateNudgeField("email", e.target.value)}
                  className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                />
              </div>

              {/* Subject */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.5)" }}>Subject</label>
                  <button onClick={() => copyToClip(nudgeTarget.subject, "subject")}
                    className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide transition-colors"
                    style={{
                      backgroundColor: nudgeCopied === "subject" ? "rgba(74,222,128,0.2)" : "rgba(201,162,39,0.15)",
                      color: nudgeCopied === "subject" ? "rgb(134,239,172)" : GOLD,
                      border: "1px solid " + (nudgeCopied === "subject" ? "rgba(74,222,128,0.3)" : "rgba(201,162,39,0.3)"),
                    }}>
                    {nudgeCopied === "subject" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
                <input
                  type="text"
                  value={nudgeTarget.subject}
                  onChange={e => updateNudgeField("subject", e.target.value)}
                  className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                />
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.5)" }}>Message</label>
                  <button onClick={() => copyToClip(nudgeTarget.body, "body")}
                    className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide transition-colors"
                    style={{
                      backgroundColor: nudgeCopied === "body" ? "rgba(74,222,128,0.2)" : "rgba(201,162,39,0.15)",
                      color: nudgeCopied === "body" ? "rgb(134,239,172)" : GOLD,
                      border: "1px solid " + (nudgeCopied === "body" ? "rgba(74,222,128,0.3)" : "rgba(201,162,39,0.3)"),
                    }}>
                    {nudgeCopied === "body" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
                <textarea
                  value={nudgeTarget.body}
                  onChange={e => updateNudgeField("body", e.target.value)}
                  rows={14}
                  className="w-full rounded-lg px-4 py-3 text-sm outline-none resize-y"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(245,245,245,0.85)", minHeight: "260px" }}
                />
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 flex flex-col gap-2 flex-shrink-0"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.02)" }}>
              {nudgeSendError && (
                <div className="text-xs px-3 py-2 rounded"
                  style={{ backgroundColor: "rgba(185,28,28,0.15)", color: "rgb(252,165,165)", border: "1px solid rgba(185,28,28,0.3)" }}>
                  {nudgeSendError}
                </div>
              )}
              <div className="flex items-center gap-3">
	              <button
	                onClick={sendNudgeNow}
	                disabled={
	                  nudgeSending === "sending" ||
	                  nudgeSending === "sent" ||
	                  !nudgeTarget.email.trim() ||
	                  !nudgeTarget.subject.trim() ||
	                  !nudgeTarget.body.trim()
	                }
                className="flex-1 py-2.5 rounded-lg font-bold text-sm transition-colors disabled:opacity-70"
                style={{
                  backgroundColor: nudgeSending === "sent" ? "rgba(74,222,128,0.2)" : "#C9A227",
                  color: nudgeSending === "sent" ? "rgb(134,239,172)" : "#0F1E30",
                  border: nudgeSending === "sent" ? "1px solid rgba(74,222,128,0.3)" : "none",
                }}>
                {nudgeSending === "sent"
                  ? "✓ Sent from info@standwithmeg.com"
                  : nudgeSending === "sending"
                  ? "Sending…"
                  : "✉ Send now from info@standwithmeg.com"}
              </button>
              <button
                onClick={() => copyToClip(`To: ${nudgeTarget.email}\nSubject: ${nudgeTarget.subject}\n\n${nudgeTarget.body}`, "all")}
                className="py-2.5 px-4 rounded-lg font-bold text-sm transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: nudgeCopied === "all" ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.06)",
                  color: nudgeCopied === "all" ? "rgb(134,239,172)" : "rgba(245,245,245,0.85)",
                  border: nudgeCopied === "all" ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(255,255,255,0.12)",
                }}>
                {nudgeCopied === "all" ? "✓ Copied" : "Copy all"}
              </button>
              <a
                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(nudgeTarget.email)}&su=${encodeURIComponent(nudgeTarget.subject)}&body=${encodeURIComponent(nudgeTarget.body)}`}
                target="_blank" rel="noopener noreferrer"
                title="Opens the compose window in web Gmail. Switch the From address to info@standwithmeg.com if you've set it up as a Send-As."
                className="py-2.5 px-4 rounded-lg font-bold text-sm transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: "rgba(234,67,53,0.15)",
                  color: "rgb(252,165,165)",
                  border: "1px solid rgba(234,67,53,0.3)",
                }}>
                Open in Gmail
              </a>
              <a
                href={`mailto:${nudgeTarget.email}?subject=${encodeURIComponent(nudgeTarget.subject)}&body=${encodeURIComponent(nudgeTarget.body)}`}
                title="Opens your default desktop mail client"
                className="py-2.5 px-4 rounded-lg font-bold text-sm transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  color: "rgba(245,245,245,0.7)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}>
                mailto:
              </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal — full submission view ── */}
      {detailRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setDetailRow(null); }}
        >
          <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#0F1E30", border: `1px solid rgba(201,162,39,0.35)` }}>

            {/* Modal header */}
            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
              style={{ borderBottom: `1px solid rgba(201,162,39,0.2)`, backgroundColor: "rgba(30,58,95,0.6)" }}>
              <div>
                <div className="font-black text-white text-base leading-none">
                  {detailRow.state_of_occurrence ?? detailRow.outside_us_country}
                  {detailRow.case_county ? ` — ${detailRow.case_county}` : ""}
                </div>
                <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.4)" }}>
                  Submitted {exactTimestamp(detailRow.created_at)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleApprove(detailRow.id, detailRow.approved); }}
                  disabled={approving === detailRow.id}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold transition-colors disabled:opacity-40"
                  style={
                    detailRow.approved
                      ? { backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: `1px solid rgba(201,162,39,0.4)` }
                      : { backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.5)", border: "1px solid rgba(255,255,255,0.12)" }
                  }
                >
                  {approving === detailRow.id ? "…" : detailRow.approved ? "✓ Approved" : "Approve"}
                </button>
                <button onClick={() => setDetailRow(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                  style={{ color: "rgba(245,245,245,0.5)" }} aria-label="Close">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* Contact Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["Name", `${detailRow.first_name ?? ""} ${detailRow.last_name ?? ""}`],
                  ["Email", detailRow.email],
                  ["Permission", detailRow.permission_to_share],
                  ["Kids", detailRow.number_of_kids?.toString()],
                ].map(([label, val]) => (
                  <div key={label as string} className="rounded-lg p-3"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(245,245,245,0.35)" }}>
                      {label}
                    </div>
                    <div className="text-sm text-white break-all">{val || "—"}</div>
                  </div>
                ))}
              </div>

              {/* Case Info */}
              <div>
                <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Case Details</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    ["Status", detailRow.case_status],
                    ["System", detailRow.system_affected],
                    ["Time in System", detailRow.time_in_system],
                    ["Custody", detailRow.custody_status],
                    ["Pro Se", String(detailRow.is_pro_se ?? "—")],
                    ["Legal History", detailRow.legal_rep_history],
                  ].map(([label, val]) => (
                    <div key={label as string} className="rounded-lg p-3"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(245,245,245,0.35)" }}>
                        {label}
                      </div>
                      <div className="text-sm" style={{ color: "rgba(245,245,245,0.7)" }}>{val || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Allegations */}
              <div>
                <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Allegations & Due Process</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg p-3"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(245,245,245,0.35)" }}>
                      Allegation Type
                    </div>
                    <div className="text-sm" style={{ color: "rgba(245,245,245,0.7)" }}>{detailRow.allegation_type || "—"}</div>
                    {detailRow.allegation_other_detail && (
                      <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.45)" }}>{detailRow.allegation_other_detail}</div>
                    )}
                  </div>
                  <div className="rounded-lg p-3"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(245,245,245,0.35)" }}>
                      Due Process Issues
                    </div>
                    <div className="text-sm" style={{ color: "rgba(245,245,245,0.7)" }}>
                      {detailRow.due_process_checklist && detailRow.due_process_checklist.length > 0
                        ? detailRow.due_process_checklist.join(", ")
                        : "—"}
                    </div>
                    {detailRow.other_allegation_details && (
                      <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.45)" }}>{detailRow.other_allegation_details}</div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <div className="rounded-lg p-3"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(245,245,245,0.35)" }}>
                      Conflict of Interest
                    </div>
                    <div className="text-sm" style={{ color: "rgba(245,245,245,0.7)" }}>{detailRow.conflict_of_interest_awareness || "—"}</div>
                    {detailRow.conflict_description && (
                      <div className="text-xs mt-1 italic" style={{ color: "rgba(245,245,245,0.45)" }}>{detailRow.conflict_description}</div>
                    )}
                  </div>
                  <div className="rounded-lg p-3"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(245,245,245,0.35)" }}>
                      Federal Funding Influence
                    </div>
                    <div className="text-sm" style={{ color: "rgba(245,245,245,0.7)" }}>{detailRow.federal_funding_influence || "—"}</div>
                  </div>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div>
                <div className="text-xs font-bold uppercase tracking-widest mb-2 text-red-400">Financial Impact</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ["Attorney", detailRow.attorney_fees],
                    ["GAL", detailRow.gal_fees],
                    ["Therapy/Eval", detailRow.therapy_eval_fees],
                    ["Reunification", detailRow.reunification_fees],
                    ["Other Court", detailRow.other_court_actors_fees],
                    ["Lost Wages", detailRow.lost_wages],
                    ["Asset Loss", detailRow.asset_liquidation_loss],
                    ["TOTAL", detailRow.total_financial_loss],
                  ].map(([label, val]) => (
                    <div key={label as string} className="rounded-lg p-3"
                      style={{
                        backgroundColor: label === "TOTAL" ? "rgba(185,28,28,0.15)" : "rgba(255,255,255,0.04)",
                        border: label === "TOTAL" ? "1px solid rgba(185,28,28,0.3)" : "1px solid rgba(255,255,255,0.07)",
                      }}>
                      <div className="text-xs font-bold uppercase tracking-wide mb-1"
                        style={{ color: label === "TOTAL" ? "rgba(248,113,113,0.8)" : "rgba(245,245,245,0.35)" }}>
                        {label}
                      </div>
                      <div className={`text-sm font-bold ${label === "TOTAL" ? "text-red-400" : ""}`}
                        style={label !== "TOTAL" ? { color: "rgba(245,245,245,0.7)" } : undefined}>
                        {fmt$(val as number | null)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stolen Time */}
              {(detailRow.months_lost_parenting_time || detailRow.lost_milestones_description) && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Stolen Time</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-lg p-3"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(245,245,245,0.35)" }}>
                        Months Lost
                      </div>
                      <div className="text-sm" style={{ color: "rgba(245,245,245,0.7)" }}>
                        {detailRow.months_lost_parenting_time ?? "—"}
                      </div>
                    </div>
                    {detailRow.lost_milestones_description && (
                      <div className="rounded-lg p-3"
                        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(245,245,245,0.35)" }}>
                          Lost Milestones
                        </div>
                        <div className="text-sm" style={{ color: "rgba(245,245,245,0.7)" }}>
                          {detailRow.lost_milestones_description}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Impact Quote */}
              {detailRow.impact_quote && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Impact Quote</div>
                  <blockquote className="text-sm italic pl-4 py-2"
                    style={{ borderLeft: `3px solid rgba(201,162,39,0.5)`, color: "rgba(245,245,245,0.8)" }}>
                    &ldquo;{detailRow.impact_quote}&rdquo;
                  </blockquote>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Survey Detail Modal — full submission view for possible matches ── */}
      {surveyDetail.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) closeSurveyDetail(); }}
        >
          <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#0F1E30", border: `1px solid rgba(201,162,39,0.35)` }}>
            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
              style={{ borderBottom: `1px solid rgba(201,162,39,0.2)`, backgroundColor: "rgba(30,58,95,0.6)" }}>
              <div className="min-w-0">
                <div className="font-black text-white text-base leading-none">
                  {surveyDetail.loading
                    ? "Loading survey…"
                    : surveyDetail.data
                      ? `${publicSubmissionDisplayName(surveyDetail.data.submission)} · Survey detail`
                      : "Survey detail"}
                </div>
                <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.4)" }}>
                  {surveyDetail.loading
                    ? "Fetching the linked survey submission and actor rows."
                    : surveyDetail.data
                      ? [
                          surveyDetail.data.submission.state_of_occurrence ?? surveyDetail.data.submission.outside_us_country ?? "No location",
                          surveyDetail.data.submission.case_county ? surveyDetail.data.submission.case_county : null,
                        ].filter(Boolean).join(" · ")
                      : surveyDetail.error || ""}
                </div>
              </div>
              <button
                onClick={closeSurveyDetail}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                style={{ color: "rgba(245,245,245,0.5)" }}
                aria-label="Close survey detail"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {surveyDetail.loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: `${GOLD} transparent ${GOLD} ${GOLD}` }} />
                </div>
              )}

              {!surveyDetail.loading && surveyDetail.error && (
                <div className="rounded-xl px-4 py-3 text-sm"
                  style={{ backgroundColor: "rgba(185,28,28,0.14)", border: "1px solid rgba(185,28,28,0.35)", color: "rgb(252,165,165)" }}>
                  {surveyDetail.error}
                </div>
              )}

              {!surveyDetail.loading && surveyDetail.data && (() => {
                const submission = surveyDetail.data!.submission;
                const badge = permissionToShareBadge(submission.permission_to_share);
                const name = publicSubmissionDisplayName(submission);
                const location = submission.state_of_occurrence ?? submission.outside_us_country ?? "—";
                const county = submission.case_county || "—";
                const courtActors = surveyDetail.data!.court_actors;

                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                      {[
                        ["Name", name],
                        ["Email", submission.email || "—"],
                        ["State", location],
                        ["County", county],
                        ["Case status", submission.case_status || "—"],
                        ["Custody status", submission.custody_status || "—"],
                        ["Months lost parenting time", submission.months_lost_parenting_time?.toString() || "—"],
                        ["Total financial loss", fmt$(submission.total_financial_loss)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg p-3"
                          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(245,245,245,0.35)" }}>
                            {label}
                          </div>
                          <div className="text-sm text-white break-words">{value}</div>
                        </div>
                      ))}
                      <div className="rounded-lg p-3 md:col-span-2 xl:col-span-4"
                        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(245,245,245,0.35)" }}>
                              Permission to share
                            </div>
                            <div
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide"
                              style={{
                                color: badge.color,
                                backgroundColor: badge.bg,
                                border: `1px solid ${badge.border}`,
                              }}
                            >
                              {badge.label}
                            </div>
                          </div>
                          <div className="text-xs" style={{ color: "rgba(245,245,245,0.45)" }}>
                            Submitted {exactTimestamp(submission.created_at)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
                        Impact Quote
                      </div>
                      <div className="rounded-xl p-4"
                        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        {submission.impact_quote ? (
                          <blockquote className="text-sm italic pl-4 py-1"
                            style={{ borderLeft: `3px solid rgba(201,162,39,0.5)`, color: "rgba(245,245,245,0.8)" }}>
                            &ldquo;{submission.impact_quote}&rdquo;
                          </blockquote>
                        ) : (
                          <div className="text-sm" style={{ color: "rgba(245,245,245,0.45)" }}>
                            No impact quote on file.
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
                        Linked Court Actors
                      </div>
                      <div className="space-y-2">
                        {courtActors.length > 0 ? courtActors.map(actor => (
                          <div key={actor.id} className="rounded-lg px-4 py-3"
                            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                                  style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.75)" }}>
                                  {actor.role}
                                </span>
                                <span className="font-semibold text-sm text-white">{actor.name}</span>
                              </div>
                              <div className="text-xs" style={{ color: "rgba(245,245,245,0.45)" }}>
                                {actor.court_or_county || "—"}
                              </div>
                            </div>
                            {actor.notes && (
                              <div className="mt-1.5 text-xs italic" style={{ color: "rgba(245,245,245,0.55)" }}>
                                {actor.notes}
                              </div>
                            )}
                          </div>
                        )) : (
                          <div className="rounded-lg px-4 py-3 text-sm"
                            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(245,245,245,0.45)" }}>
                            No court actors are linked to this submission.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Quote Modal ── */}
      {quoteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#0F1E30", border: `1px solid rgba(201,162,39,0.35)` }}
          >
            {/* Modal header */}
            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
              style={{ borderBottom: `1px solid rgba(201,162,39,0.2)`, backgroundColor: "rgba(30,58,95,0.6)" }}>
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)" }}>
                    <svg className="w-3.5 h-3.5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-black text-white text-base leading-none">
                      {quoteModal.state} — Approved Quotes
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
                      {modalLoading ? "Loading…" : `${modalQuotes.length} public quote${modalQuotes.length === 1 ? "" : "s"}`}
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                style={{ color: "rgba(245,245,245,0.5)" }}
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quotes list */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {modalLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: `${GOLD} transparent ${GOLD} ${GOLD}` }} />
                </div>
              )}

              {!modalLoading && modalQuotes.map(q => {
                // Resolve display name per permission_to_share rules
                // Values match the short enum stored by the submit form
                let attribution = "Anonymous";
                if (q.permission_to_share === "public" && q.first_name) {
                  attribution = q.first_name;
                } else if (q.permission_to_share === "first_name" && q.first_name) {
                  attribution = q.first_name[0] + ".";
                }

                return (
                  <div key={q.id} className="rounded-xl p-4"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <blockquote className="text-sm italic"
                      style={{ borderLeft: `2px solid rgba(201,162,39,0.5)`, paddingLeft: "12px", color: "rgba(245,245,245,0.8)" }}>
                      &ldquo;{q.impact_quote}&rdquo;
                    </blockquote>
                    <div className="mt-2 flex items-center gap-2 flex-wrap" style={{ paddingLeft: "14px" }}>
                      <span className="text-xs font-semibold" style={{ color: GOLD }}>— {attribution}</span>
                      {q.case_county && (
                        <span className="text-xs" style={{ color: "rgba(245,245,245,0.3)" }}>· {q.case_county}</span>
                      )}
                      <span className="text-xs" style={{ color: "rgba(245,245,245,0.2)" }}>
                        · {new Date(q.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                      </span>
                    </div>
                  </div>
                );
              })}

              {!modalLoading && modalQuoteError && (
                <div className="py-10 text-center text-sm" style={{ color: "#f87171" }}>
                  {modalQuoteError}
                </div>
              )}

              {!modalLoading && !modalQuoteError && modalQuotes.length === 0 && (
                <div className="py-10 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                  No public quotes found for this state.
                </div>
              )}
            </div>

            {/* Explanatory note */}
            <div className="px-6 py-3 flex-shrink-0"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.02)" }}>
              <p className="text-xs" style={{ color: "rgba(245,245,245,0.35)" }}>
                Showing {modalQuotes.length} publicly displayable quote{modalQuotes.length === 1 ? "" : "s"} from {quoteModal.state}.
                {" "}This state has {quoteModal.total.toLocaleString()} total submission{quoteModal.total === 1 ? "" : "s"} — additional
                families are counted in the totals but are not shown here because they submitted for data purposes only
                or without a shareable quote.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Merge Preview Modal — side-by-side per-field diff with override picks ── */}
      {(mergePreview || mergeLoading || mergeError) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.78)", backdropFilter: "blur(4px)" }}
          onClick={e => {
            if (e.target === e.currentTarget && !mergeSaving) {
              setMergePreview(null);
              setMergeError(null);
            }
          }}
        >
          <div className="relative w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
            style={{ backgroundColor: BG, border: "1px solid rgba(96,165,250,0.4)", maxHeight: "90vh" }}>

            <div className="px-5 py-4 flex items-start justify-between gap-3"
              style={{ borderBottom: "1px solid rgba(96,165,250,0.25)", backgroundColor: "rgba(30,58,95,0.6)" }}>
              <div className="min-w-0">
                <div className="font-black text-white text-base leading-tight">Merge duplicate rows</div>
                <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.55)" }}>
                  {mergePreview?.winner.email as string ?? ""}{mergePreview?.state ? ` · ${mergePreview.state}` : ""}
                  {mergePreview && (
                    <span className="ml-2" style={{ color: "rgba(245,245,245,0.4)" }}>
                      Pick a value per field. Defaults to the NEWEST submission&apos;s value. Permission defaults to MORE PRIVATE for safety. Due-process flags are unioned.
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (!mergeSaving) { setMergePreview(null); setMergeError(null); } }}
                disabled={mergeSaving}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 flex-shrink-0 disabled:opacity-40"
                style={{ color: "rgba(245,245,245,0.5)" }}
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              {mergeLoading && (
                <div className="text-sm text-center py-8" style={{ color: "rgba(245,245,245,0.4)" }}>
                  Loading merge preview…
                </div>
              )}

              {!mergeLoading && mergeError && (
                <div className="rounded-lg px-4 py-3 text-sm"
                  style={{ backgroundColor: "rgba(185,28,28,0.14)", color: "rgb(252,165,165)", border: "1px solid rgba(185,28,28,0.4)" }}>
                  {mergeError}
                </div>
              )}

              {!mergeLoading && mergePreview && mergePreview.diffs.length === 0 && (
                <div className="text-sm text-center py-8" style={{ color: "rgba(245,245,245,0.4)" }}>
                  Both rows have identical values — nothing to merge. Use Delete instead if you want to remove the duplicate.
                </div>
              )}

              {!mergeLoading && mergePreview && mergePreview.diffs.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-wide px-2 py-1"
                    style={{ color: "rgba(245,245,245,0.5)" }}>
                    <div className="col-span-3">Field</div>
                    <div className="col-span-4">Winner (kept)</div>
                    <div className="col-span-4">Loser (deleted)</div>
                    <div className="col-span-1 text-right">Use</div>
                  </div>
                  {mergePreview.diffs.map(diff => {
                    const choice = mergePreview.choices[diff.field];
                    return (
                      <div key={diff.field} className="grid grid-cols-12 gap-2 text-xs rounded-lg px-2 py-2"
                        style={{ backgroundColor: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div className="col-span-3 font-bold text-white truncate" title={diff.field}>
                          {diff.label}
                        </div>
                        <div
                          className="col-span-4 break-words rounded px-2 py-1 cursor-pointer"
                          onClick={() => setMergePreview(p => p ? { ...p, choices: { ...p.choices, [diff.field]: "winner" } } : p)}
                          style={{
                            backgroundColor: choice === "winner" ? "rgba(74,222,128,0.12)" : "transparent",
                            border: choice === "winner" ? "1px solid rgba(74,222,128,0.4)" : "1px solid rgba(255,255,255,0.06)",
                            color: "rgba(245,245,245,0.85)",
                          }}>
                          {formatMergeValue(diff.winnerValue)}
                        </div>
                        <div
                          className="col-span-4 break-words rounded px-2 py-1 cursor-pointer"
                          onClick={() => setMergePreview(p => p ? { ...p, choices: { ...p.choices, [diff.field]: "loser" } } : p)}
                          style={{
                            backgroundColor: choice === "loser" ? "rgba(74,222,128,0.12)" : "transparent",
                            border: choice === "loser" ? "1px solid rgba(74,222,128,0.4)" : "1px solid rgba(255,255,255,0.06)",
                            color: "rgba(245,245,245,0.85)",
                          }}>
                          {formatMergeValue(diff.loserValue)}
                        </div>
                        <div className="col-span-1 flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setMergePreview(p => p ? { ...p, choices: { ...p.choices, [diff.field]: "winner" } } : p)}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style={{
                              backgroundColor: choice === "winner" ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.04)",
                              color: choice === "winner" ? "rgb(134,239,172)" : "rgba(245,245,245,0.4)",
                            }}
                            title="Use winner's value"
                          >A</button>
                          <button
                            type="button"
                            onClick={() => setMergePreview(p => p ? { ...p, choices: { ...p.choices, [diff.field]: "loser" } } : p)}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style={{
                              backgroundColor: choice === "loser" ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.04)",
                              color: choice === "loser" ? "rgb(134,239,172)" : "rgba(245,245,245,0.4)",
                            }}
                            title="Use loser's value"
                          >B</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-3 flex items-center justify-end gap-2"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" }}>
              <button
                type="button"
                onClick={() => { if (!mergeSaving) { setMergePreview(null); setMergeError(null); } }}
                disabled={mergeSaving}
                className="text-xs px-3 py-2 rounded font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commitMerge}
                disabled={!mergePreview || mergePreview.diffs.length === 0 || mergeSaving}
                className="text-xs px-3 py-2 rounded font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: "rgba(96,165,250,0.18)", color: "rgb(147,197,253)", border: "1px solid rgba(96,165,250,0.45)" }}
              >
                {mergeSaving ? "Merging…" : "Merge into winner"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatMergeValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed.length === 0) return "—";
    return trimmed.length > 220 ? trimmed.slice(0, 220) + "…" : trimmed;
  }
  if (typeof v === "number") {
    return v.toLocaleString();
  }
  if (typeof v === "boolean") {
    return v ? "Yes" : "No";
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    return v.map(x => String(x)).join(" · ");
  }
  return String(v);
}
