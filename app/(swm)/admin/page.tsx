"use client";

import { useState, useEffect, useCallback } from "react";
import { COURT_ACTOR_PUBLIC_THRESHOLD } from "../../../lib/court-actors";

const GOLD  = "#C9A227";
const BG    = "#0F1E30";  // deep dark navy for page background

// Fires a workflow_dispatch on GitHub. The workflow regenerates one state
// PDF (or all 30+ states when state is blank), commits to main, and Vercel
// redeploys. UI polls GitHub after dispatch so admins can see whether it
// queued, started, completed, or failed.
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
    body: JSON.stringify({ state }),
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
  const target = state ? `${state}.pdf` : "all 30+ state PDFs";
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
    : "Regen PDF";
  const color = status === "done" ? "#22c55e" : status === "error" ? "#ef4444" : GOLD;
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={click}
        disabled={status === "pending" || status === "queued" || status === "running"}
        title={msg || (workflowUrl ? `Check ${workflowUrl}` : `Regenerate ${state}.pdf from live Supabase data`)}
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
    if (!window.confirm("Regenerate PDFs for every state with 30+ submissions? Takes ~5-10 min.")) return;
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
    : "Regenerate all 30+ PDFs";
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={click}
        disabled={status === "pending" || status === "queued" || status === "running"}
        title={msg || (workflowUrl ? `Check ${workflowUrl}` : "Queue a workflow run that regenerates every 30+ state PDF")}
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
  review_decision: "keep" | "delete" | "count_separately" | null;
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
  const hasNormalDedupeRow = group.rows.some(row => row.review_decision !== "count_separately");
  return separateRows + (hasNormalDedupeRow ? 1 : 0);
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
    ["Admin review", row.review_decision === "keep" ? `Kept${row.reviewed_at ? ` on ${shortDate(row.reviewed_at)}` : ""}` : "Not reviewed"],
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

export default function AdminPage() {
  const [stats, setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof StateRow>("total_submissions");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc");
  const [approving, setApproving] = useState<string | null>(null);

  // Detail modal — view all fields for a single submission
  const [detailRow, setDetailRow] = useState<RecentRow | null>(null);

  // Court actors panel — all actors + aggregates
  type AdminActor = {
    id: string;
    role: string;
    name: string;
    court_or_county: string | null;
    state_code: string | null;
    location_key: string | null;
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
  };
  type AdminActorAgg = {
    role: string;
    name: string;
    state_code: string | null;
    location_key: string | null;
    court_or_county: string | null;
    count: number;
  };
  const [adminActors, setAdminActors] = useState<AdminActor[]>([]);
  const [adminActorAggs, setAdminActorAggs] = useState<AdminActorAgg[]>([]);
  type ActorView = "by_state" | "patterns" | "all";
  const [actorView, setActorView] = useState<ActorView>("by_state");
  const [expandedState, setExpandedState] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<ReportingAuditRow[]>([]);
  const [auditSummary, setAuditSummary] = useState<ReportingAuditSummary | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditReview, setAuditReview] = useState<AuditReviewData | null>(null);
  const [auditReviewContext, setAuditReviewContext] = useState<ReportingAuditRow | null>(null);
  const [auditReviewLoading, setAuditReviewLoading] = useState(false);
  const [auditReviewError, setAuditReviewError] = useState<string | null>(null);
  const [deletingAuditRow, setDeletingAuditRow] = useState<string | null>(null);
  const [keepingAuditRow, setKeepingAuditRow] = useState<string | null>(null);
  const [countingSeparatelyAuditRow, setCountingSeparatelyAuditRow] = useState<string | null>(null);

  // Quote modal
  const [quoteModal, setQuoteModal] = useState<{ state: string; is_us: boolean; total: number } | null>(null);
  const [modalQuotes, setModalQuotes]   = useState<QuoteRow[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  async function openQuoteModal(row: StateRow) {
    if (row.approved_count === 0) return;
    setQuoteModal({ state: row.state, is_us: row.is_us, total: row.total_submissions });
    setModalQuotes([]);
    setModalLoading(true);
    try {
      const res = await fetch(
        `/api/admin/state-quotes?state=${encodeURIComponent(row.state)}&is_us=${row.is_us}`
      );
      const data = await res.json();
      setModalQuotes(data.quotes ?? []);
    } finally {
      setModalLoading(false);
    }
  }

  function closeModal() { setQuoteModal(null); setModalQuotes([]); }

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
    void loadAuditReview(row.state);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, actorsRes, auditRes] = await Promise.all([
        fetch("/api/admin/survey-stats"),
        fetch("/api/admin/court-actors"),
        fetch("/api/admin/reporting-audit"),
      ]);
      const statsData = await statsRes.json();
      if (!statsRes.ok) { setError(statsData.error || "Failed to load stats."); return; }
      setStats(statsData);

      const actorsData = await actorsRes.json().catch(() => ({ actors: [], aggregates: [] }));
      applyActorData(actorsData);

      const auditData = await auditRes.json().catch(() => ({ rows: [], summary: null }));
      if (auditRes.ok) {
        applyAuditData(auditData);
      } else {
        setAuditRows([]);
        setAuditSummary(null);
        setAuditError(auditData.error || "Failed to load reporting audit.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [applyActorData, applyAuditData]);

  useEffect(() => { load(); }, [load]);

  async function toggleApprove(id: string, current: boolean) {
    setApproving(id);
    try {
      await fetch("/api/admin/survey-stats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, approved: !current }),
      });
      // Full refresh so state table approved_count and all stats stay accurate
      await load();
    } finally {
      setApproving(null);
    }
  }

  async function deleteAuditReviewRow(row: AuditReviewRow) {
    const label = `${row.source_table === "survey_submissions" ? "current survey" : "legacy/import"} row for ${row.email || "no email"} in ${row.state}`;
    if (!window.confirm(`Delete this ${label}? This permanently removes it from Supabase. If this is a real separate court matter, choose Cancel and keep it.`)) {
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
      await Promise.all([loadAuditReview(row.state), refreshStatsAndAudit()]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingAuditRow(null);
    }
  }

  async function keepAuditReviewRow(row: AuditReviewRow) {
    const key = auditRowKey(row);
    setKeepingAuditRow(key);
    try {
      const res = await fetch("/api/admin/reporting-audit/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, source_table: row.source_table, state: row.state, decision: "keep" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Keep failed.");
      await Promise.all([loadAuditReview(row.state), refreshStatsAndAudit()]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Keep failed.");
    } finally {
      setKeepingAuditRow(null);
    }
  }

  async function countAuditReviewRowSeparately(row: AuditReviewRow) {
    const label = `${row.source_table === "survey_submissions" ? "current survey" : "legacy/import"} row for ${row.email || "no email"} in ${row.state}`;
    if (!window.confirm(`Count this ${label} as a separate real case/family? This will change dashboard, audit spreadsheet, and next PDF counts.`)) {
      return;
    }

    const key = auditRowKey(row);
    setCountingSeparatelyAuditRow(key);
    try {
      const res = await fetch("/api/admin/reporting-audit/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, source_table: row.source_table, state: row.state, decision: "count_separately" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Count separately failed.");
      await Promise.all([loadAuditReview(row.state), refreshStatsAndAudit()]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Count separately failed.");
    } finally {
      setCountingSeparatelyAuditRow(null);
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
    try {
      const res = await fetch("/api/admin/court-actors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert("Action failed: " + (data.error ?? res.statusText));
        return;
      }
      await refreshActors();
    } catch (err) {
      alert("Action failed: " + (err instanceof Error ? err.message : "Network error."));
    } finally {
      setActorActing(null);
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

  function nudgeFamily(a: AdminActor) {
    if (!a.reporter_email) { alert("No email on file for this reporter."); return; }
    const greeting = a.reporter_name ? `Hi ${a.reporter_name.split(" ")[0]},` : "Hi,";
    const subject = "Stand With Meg — quick court actor follow-up";
    const actorName = a.name.trim();
    const normalizedName = actorName.toLowerCase();
    const hasNamedActor = Boolean(actorName) && !["unknown", "unnamed", "n/a", "na", "none", "?"].includes(normalizedName);
    const role = a.role.trim();
    const roleIsOther = !role || role.toLowerCase() === "other";
    const hasNotes = Boolean(a.notes?.trim()) && a.notes!.trim().length >= 12;
    const location = a.state_code ? ` in ${a.state_code}` : "";
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
        backgroundImage: "url('/swm/swm-banner.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: 0.06,
        zIndex: 0,
      }} />

      {/* Gold top bar */}
      <div className="relative z-10 h-1" style={{ backgroundColor: GOLD }} />

      {/* ── Header ── */}
      <header className="relative z-10 px-6 py-5 border-b overflow-hidden" style={{ borderColor: "rgba(201,162,39,0.2)" }}>
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
            <div className="w-10 h-10 bg-red-700 rounded-lg flex items-center justify-center flex-shrink-0">
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

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8 space-y-8">


        {/* ── Stat Cards ── */}
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

        {/* ── State Breakdown Table ── */}
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
                      {row.is_us && row.total_submissions >= 30 ? (
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

        {/* ── Reporting Audit Spreadsheet ── */}
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

        {/* ── Court Actors (Admin) ── */}
        <div className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="px-6 py-4 flex items-start justify-between gap-4 flex-wrap border-b"
            style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(30,58,95,0.4)" }}>
            <div>
              <h2 className="font-black text-white text-base tracking-wide">Court Actors</h2>
              <p className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
                {adminActorAggs.length} counted names across {adminActors.length} reports · Public threshold: {COURT_ACTOR_PUBLIC_THRESHOLD} families
              </p>
              <p className="text-xs mt-1 max-w-3xl" style={{ color: "rgba(245,245,245,0.45)" }}>
                Promote means you verified an auto-extracted name and marked it counted. Once a counted name reaches the public threshold, it appears on the public dashboard automatically. Names are grouped conservatively by normalized spelling; close misspellings still need manual review before launch.
              </p>
            </div>
            {/* Segmented view selector */}
            <div className="flex items-center rounded-lg overflow-hidden"
              style={{ border: `1px solid rgba(201,162,39,0.3)`, backgroundColor: "rgba(255,255,255,0.04)" }}>
              {([
                ["by_state", "By Location"],
                ["patterns", "Patterns"],
                ["all", "All Reports"],
              ] as [ActorView, string][]).map(([val, label]) => (
                <button key={val} onClick={() => { setActorView(val); setExpandedState(null); }}
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

          {actorView === "patterns" && (
            <div>
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
              {adminActorAggs.length === 0 && (
                <div className="px-6 py-10 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                  No court actors have been reported yet.
                </div>
              )}
              {adminActorAggs.slice(0, 50).map((agg, i) => {
                const isPublic = agg.count >= COURT_ACTOR_PUBLIC_THRESHOLD;
                return (
                  <div key={i} className="px-6 py-3 flex items-center justify-between gap-4"
                    style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
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
                    <div className="flex items-center gap-2">
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
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {actorView === "all" && (
            <div>
              {adminActors.length === 0 && (
                <div className="px-6 py-10 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                  No court actor reports yet.
                </div>
              )}
              {adminActors.slice(0, 200).map((a, i) => (
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
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Recent Submissions ── */}
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

      </div>

      {/* Footer */}
      <footer className="relative z-10 text-center px-6 py-5 mt-4 text-xs border-t"
        style={{ color: "rgba(245,245,245,0.2)", borderColor: "rgba(255,255,255,0.06)" }}>
        Stand With Meg &nbsp;·&nbsp; Courage to Stand, Power to Change &nbsp;·&nbsp; standwithmeg.com
      </footer>

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
                  Same-email rows in the same state are counted as one family in dashboard/PDF totals. If a row is a real separate court matter, keep it. Delete only obvious duplicate imports, test rows, or wrong-state records.
                </div>
              </div>
              <button onClick={() => { setAuditReview(null); setAuditReviewError(null); setAuditReviewContext(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                style={{ color: "rgba(245,245,245,0.5)" }} aria-label="Close">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
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
                          {deltaCard("Δ Dashboard vs Deduped view", dashVsDeduped, "Non-zero = financial-fingerprint or count_separately divergence between the two views")}
                          {deltaCard("Δ Dashboard vs PDF index", dashVsPdf, "Non-zero = PDF was generated against an older dashboard snapshot (stale PDF)")}
                        </div>

                        <div className="rounded-xl px-4 py-3 text-xs leading-relaxed"
                          style={{ backgroundColor: "rgba(0,0,0,0.18)", color: "rgba(245,245,245,0.65)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <strong style={{ color: "rgba(245,245,245,0.85)" }}>Three independent things can cause a mismatch:</strong>
                          <ol className="list-decimal pl-5 mt-1 space-y-1">
                            <li><strong>Same-email review</strong> — two rows in this state share the same email and need a manual keep / delete / count separately decision. Shown below in <em>Rows grouped by same email and state</em>.</li>
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

                  {auditReview.duplicate_groups.length === 0 ? (
                    <div className="rounded-xl px-4 py-4 text-sm"
                      style={{ backgroundColor: "rgba(74,222,128,0.08)", color: "rgba(245,245,245,0.75)", border: "1px solid rgba(74,222,128,0.2)" }}>
                      No same-email duplicate groups were found for {auditReview.state}. If the audit table still says mismatch, the most likely cause is a stale PDF/index. Regenerate that state PDF or regenerate all 30+ PDFs.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-black text-white text-sm">Rows grouped by same email and state</h3>
                        <p className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.45)" }}>
                          The checked row is counted. Use Count separately only for a real second case or court matter; use Keep deduped when the row should stay but count with the same family.
                        </p>
                      </div>

                      {auditReview.duplicate_groups.map(group => {
                        const groupReviewed = group.rows.some(row => row.review_decision !== null);
                        const surveyRows = group.rows.filter(row => row.source_table === "survey_submissions");
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
                                      {row.review_decision === "count_separately" && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                          style={{ backgroundColor: "rgba(234,179,8,0.18)", color: "rgb(253,224,71)", border: "1px solid rgba(234,179,8,0.38)" }}>
                                          Count separately
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
                                    <button
                                      type="button"
                                      onClick={() => keepAuditReviewRow(row)}
                                      disabled={keepingAuditRow === auditRowKey(row)}
                                      className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80"
                                      style={{ backgroundColor: "rgba(74,222,128,0.08)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.22)" }}
                                      title="Keep this row in Supabase, but let the normal same-email/state dedupe rule count it with the family."
                                    >
                                      {keepingAuditRow === auditRowKey(row) ? "Saving…" : row.review_decision === "keep" ? "Kept deduped" : "Keep deduped"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => countAuditReviewRowSeparately(row)}
                                      disabled={countingSeparatelyAuditRow === auditRowKey(row)}
                                      className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80 disabled:opacity-40"
                                      style={{ backgroundColor: "rgba(234,179,8,0.12)", color: "rgb(253,224,71)", border: "1px solid rgba(234,179,8,0.35)" }}
                                      title="Use this only when the row is a real separate case or court matter that should count separately."
                                    >
                                      {countingSeparatelyAuditRow === auditRowKey(row)
                                        ? "Saving…"
                                        : row.review_decision === "count_separately"
                                          ? "Counting separately"
                                          : "Count separately"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteAuditReviewRow(row)}
                                      disabled={deletingAuditRow === row.id}
                                      className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80 disabled:opacity-40"
                                      style={{ backgroundColor: "rgba(185,28,28,0.14)", color: "rgb(252,165,165)", border: "1px solid rgba(185,28,28,0.35)" }}
                                    >
                                      {deletingAuditRow === row.id ? "Deleting…" : "Delete"}
                                    </button>
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

                  {auditReview.financial_fingerprint_groups && auditReview.financial_fingerprint_groups.length > 0 && (
                    <div className="space-y-3">
                      <div className="rounded-xl px-4 py-3"
                        style={{ backgroundColor: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.35)" }}>
                        <h3 className="font-black text-white text-sm">Financial-fingerprint candidates · {auditReview.state}</h3>
                        <p className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.7)" }}>
                          These rows share the same state + county + fee vector + months lost. Migration 020 (held)
                          would auto-collapse each group to a single counted family. <strong>Review each group with
                          case-type fields visible</strong> — identical financials can come from one person submitted
                          twice (real duplicate) OR one person with two real cases like CPS + family court (mark
                          Count separately). Same-email collisions and placeholder-email rows are excluded here so
                          you do not review them twice.
                        </p>
                      </div>

                      {auditReview.financial_fingerprint_groups.map(group => (
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
                                            Count separately
                                          </span>
                                        )}
                                        {row.review_decision === "keep" && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                            style={{ backgroundColor: "rgba(74,222,128,0.14)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.28)" }}>
                                            Kept deduped
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
                                      <button
                                        type="button"
                                        onClick={() => keepAuditReviewRow(row)}
                                        disabled={keepingAuditRow === auditRowKey(row)}
                                        className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80"
                                        style={{ backgroundColor: "rgba(74,222,128,0.08)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.22)" }}
                                        title="Keep this row in Supabase and let the financial-fingerprint dedupe rule (migration 020) collapse it with its twin."
                                      >
                                        {keepingAuditRow === auditRowKey(row) ? "Saving…" : row.review_decision === "keep" ? "Kept deduped" : "Keep deduped"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => countAuditReviewRowSeparately(row)}
                                        disabled={countingSeparatelyAuditRow === auditRowKey(row)}
                                        className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-opacity hover:opacity-80 disabled:opacity-40"
                                        style={{ backgroundColor: "rgba(234,179,8,0.12)", color: "rgb(253,224,71)", border: "1px solid rgba(234,179,8,0.35)" }}
                                        title="Use this when the rows are real separate cases (e.g. one CPS case and one family court case for the same family) and should not be collapsed."
                                      >
                                        {countingSeparatelyAuditRow === auditRowKey(row)
                                          ? "Saving…"
                                          : row.review_decision === "count_separately"
                                            ? "Counting separately"
                                            : "Count separately"}
                                      </button>
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

              {!modalLoading && modalQuotes.length === 0 && (
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
                      Pick a value per field. Defaults follow smart rules (longer text, max fee, more permissive permission).
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
