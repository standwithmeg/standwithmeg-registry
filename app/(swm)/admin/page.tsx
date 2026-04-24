"use client";

import { useState, useEffect, useCallback } from "react";

const GOLD  = "#C9A227";
const BG    = "#0F1E30";  // deep dark navy for page background

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
    notes: string | null;
    source: string;
    created_at: string;
    submission_id: string;
    reporter_email: string | null;
    reporter_name: string | null;
  };
  type AdminActorAgg = {
    role: string;
    name: string;
    state_code: string | null;
    court_or_county: string | null;
    count: number;
  };
  const [adminActors, setAdminActors] = useState<AdminActor[]>([]);
  const [adminActorAggs, setAdminActorAggs] = useState<AdminActorAgg[]>([]);
  type ActorView = "by_state" | "patterns" | "all";
  const [actorView, setActorView] = useState<ActorView>("by_state");
  const [expandedState, setExpandedState] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, actorsRes] = await Promise.all([
        fetch("/api/admin/survey-stats"),
        fetch("/api/admin/court-actors"),
      ]);
      const statsData = await statsRes.json();
      if (!statsRes.ok) { setError(statsData.error || "Failed to load stats."); return; }
      setStats(statsData);

      const actorsData = await actorsRes.json().catch(() => ({ actors: [], aggregates: [] }));
      setAdminActors(actorsData.actors ?? []);
      setAdminActorAggs(actorsData.aggregates ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Promote an extracted actor row to form_direct (counts toward public
  // 5-family threshold). Demote reverses it. Delete removes bogus rows.
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
      await load();
    } finally {
      setActorActing(null);
    }
  }

  // "Nudge" modal state — shows a pre-written email the admin can copy
  // and paste into Gmail, Outlook, or whatever mail tool they use. We
  // avoid mailto: because it's flaky (requires a default mail client set
  // up and Chrome sometimes blocks it silently).
  const [nudgeTarget, setNudgeTarget] = useState<{
    email: string; name: string; subject: string; body: string; html: string;
  } | null>(null);
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
          html: nudgeTarget.html,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNudgeSending("error");
        setNudgeSendError(json.error || "Send failed.");
        return;
      }
      setNudgeSending("sent");
    } catch (e) {
      setNudgeSending("error");
      setNudgeSendError(e instanceof Error ? e.message : "Network error.");
    }
  }

  function nudgeFamily(a: { reporter_email: string | null; reporter_name: string | null; role: string; name: string; state_code: string | null }) {
    if (!a.reporter_email) { alert("No email on file for this reporter."); return; }
    const greeting = a.reporter_name ? `Hi ${a.reporter_name.split(" ")[0]},` : "Hi,";
    const subject = "Stand With Meg — Quick follow-up on your submission";
    const actorLine = `${a.role} ${a.name}${a.state_code ? ` in ${a.state_code}` : ""}`;
    const body = [
      greeting,
      "",
      `Thank you again for sharing your story with Stand With Meg. When we read through your submission, you mentioned ${actorLine}.`,
      "",
      "We recently added a dedicated Court Actors section to the survey so families can clearly name the judges, attorneys, GALs, and other officials involved in their case. We only publish a name once 5 different families have independently named that same person — your input helps us reach that threshold and surface real patterns.",
      "",
      "Would you be willing to re-submit just the Court Actors section here? **You don't need to redo the whole survey** — you can skip the sections you've already filled.",
      "https://my.standwithmeg.com/survey",
      "",
      "Any court actors you add will be linked to this round of reporting.",
      "",
      "Thank you for everything you've already contributed. Your voice is part of a national record that's building real momentum.",
      "",
      "— Meg",
      "Stand With Meg · standwithmeg.com",
    ].join("\n");

    // HTML version — used when sending via SMTP. Bolded call-to-action
    // sits right next to the link so it's impossible to miss.
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:600px;">
      <p>${greeting}</p>
      <p>Thank you again for sharing your story with Stand With Meg. When we read through your submission, you mentioned <strong>${actorLine}</strong>.</p>
      <p>We recently added a dedicated Court Actors section to the survey so families can clearly name the judges, attorneys, GALs, and other officials involved in their case. We only publish a name once 5 different families have independently named that same person — your input helps us reach that threshold and surface real patterns.</p>
      <p>Would you be willing to re-submit just the Court Actors section?<br>
      <strong style="color:#B91C1C;">You don't need to redo the whole survey</strong> — you can skip the sections you've already filled.</p>
      <p><a href="https://my.standwithmeg.com/survey" style="display:inline-block;background:#C9A227;color:#0F1E30;padding:10px 20px;border-radius:6px;font-weight:bold;text-decoration:none;">Re-submit Court Actors →</a></p>
      <p>Any court actors you add will be linked to this round of reporting.</p>
      <p>Thank you for everything you've already contributed. Your voice is part of a national record that's building real momentum.</p>
      <p>— Meg<br>
      <span style="color:#666;font-size:13px;">Stand With Meg · <a href="https://standwithmeg.com" style="color:#666;">standwithmeg.com</a></span></p>
    </div>`;

    setNudgeCopied("none");
    setNudgeTarget({ email: a.reporter_email, name: a.reporter_name || "", subject, body, html });
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

  function SortHeader({ field, label }: { field: keyof StateRow; label: string }) {
    const active = sortField === field;
    return (
      <th
        className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap transition-colors"
        style={{ color: active ? GOLD : "rgba(245,245,245,0.45)" }}
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

          {/* States / Countries — white number */}
          <div className="rounded-2xl p-6"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(245,245,245,0.45)" }}>
              States Represented
            </div>
            <div className="text-4xl font-black text-white leading-none">
              {stats.by_state.filter(r => r.is_us).length}
            </div>
            <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>
              of 50 states
              {stats.by_state.filter(r => !r.is_us).length > 0 &&
                ` · ${stats.by_state.filter(r => !r.is_us).length} ${stats.by_state.filter(r => !r.is_us).length === 1 ? "country" : "countries"}`}
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
              <h2 className="font-black text-white text-base tracking-wide">Submissions by State</h2>
              <p className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
                Click column headers to sort. {stats.by_state.filter(r => r.is_us).length} US states · {stats.by_state.filter(r => !r.is_us).length} international · Latest in State shows the most recent submission from that location.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "rgba(30,58,95,0.6)", borderBottom: `1px solid rgba(201,162,39,0.2)` }}>
                  <SortHeader field="state" label="State" />
                  <SortHeader field="total_submissions" label="Total" />
                  <SortHeader field="approved_count" label="Approved" />
                  <SortHeader field="avg_financial_loss" label="Avg Loss" />
                  <SortHeader field="total_financial_loss" label="Total Loss" />
                  <SortHeader field="avg_months_lost" label="Avg Mos. Lost" />
                  <SortHeader field="total_loss_count" label="No Contact" />
                  <SortHeader field="pro_se_count" label="Pro Se" />
                  <SortHeader field="last_submission_at" label="Latest in State" />
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
                    <td className="px-3 py-3 font-black text-sm" style={{ color: GOLD }}>{row.state}</td>
                    <td className="px-3 py-3 text-sm font-bold text-white">{row.total_submissions}</td>
                    <td className="px-3 py-3 text-sm">
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
                    <td className="px-3 py-3 text-sm" style={{ color: "rgba(245,245,245,0.6)" }}>{fmt$(row.avg_financial_loss)}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-red-400">{fmt$(row.total_financial_loss)}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: "rgba(245,245,245,0.6)" }}>{row.avg_months_lost ?? "—"}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: "rgba(245,245,245,0.6)" }}>{row.total_loss_count}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: "rgba(245,245,245,0.6)" }}>{row.pro_se_count}</td>
                    <td
                      className="px-3 py-3 text-xs font-semibold tabular-nums"
                      style={{ color: "rgba(245,245,245,0.4)" }}
                      title={exactTimestamp(row.last_submission_at)}
                    >
                      {latestInState(row.last_submission_at)}
                    </td>
                  </tr>
                ))}
                {sortedStates().length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                      No submissions yet. Share /survey to start collecting data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Court Actors (Admin) ── */}
        <div className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="px-6 py-4 flex items-start justify-between gap-4 flex-wrap border-b"
            style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(30,58,95,0.4)" }}>
            <div>
              <h2 className="font-black text-white text-base tracking-wide">Court Actors</h2>
              <p className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
                {adminActorAggs.length} unique names across {adminActors.length} reports · Public threshold: 5 families
              </p>
            </div>
            {/* Segmented view selector */}
            <div className="flex items-center rounded-lg overflow-hidden"
              style={{ border: `1px solid rgba(201,162,39,0.3)`, backgroundColor: "rgba(255,255,255,0.04)" }}>
              {([
                ["by_state", "By State"],
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

          {/* ── By State ── */}
          {actorView === "by_state" && (() => {
            // Build { stateCode: { total: number, actors: AdminActor[] } } from flat list
            const byState = new Map<string, AdminActor[]>();
            for (const a of adminActors) {
              const s = a.state_code ?? "—";
              if (!byState.has(s)) byState.set(s, []);
              byState.get(s)!.push(a);
            }
            const rows = [...byState.entries()]
              .map(([state, list]) => ({ state, list }))
              .sort((a, b) => b.list.length - a.list.length);

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
                  const isExpanded = expandedState === row.state;
                  // Group expanded state's actors by county
                  const byCounty = new Map<string, AdminActor[]>();
                  if (isExpanded) {
                    for (const a of row.list) {
                      const c = a.court_or_county || "(no county listed)";
                      if (!byCounty.has(c)) byCounty.set(c, []);
                      byCounty.get(c)!.push(a);
                    }
                  }
                  const countyGroups = [...byCounty.entries()].sort((a, b) => b[1].length - a[1].length);

                  return (
                    <div key={row.state} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                      {/* State row — click to expand */}
                      <button
                        onClick={() => setExpandedState(isExpanded ? null : row.state)}
                        className="w-full px-6 py-3 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors text-left">
                        <div className="flex items-center gap-3">
                          <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            style={{ color: "rgba(245,245,245,0.4)" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="font-black text-base" style={{ color: GOLD }}>{row.state}</span>
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
                                          title="Confirm this is a real named actor — counts toward public 5-family threshold"
                                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors disabled:opacity-40"
                                          style={{ backgroundColor: "rgba(74,222,128,0.15)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.3)" }}>
                                          {isActing ? "…" : "✓ Promote"}
                                        </button>
                                      )}
                                      {!isExtracted && (
                                        <button onClick={() => patchActor(a.id, "demote")} disabled={isActing}
                                          title="Undo promotion — revert to extracted (won't count publicly)"
                                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors disabled:opacity-40"
                                          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.5)", border: "1px solid rgba(255,255,255,0.12)" }}>
                                          {isActing ? "…" : "↶ Demote"}
                                        </button>
                                      )}
                                      {a.reporter_email && (
                                        <button onClick={() => nudgeFamily(a)}
                                          title="Email this family and ask them to re-submit via the Court Actors form"
                                          className="text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide transition-colors"
                                          style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: "1px solid rgba(201,162,39,0.3)" }}>
                                          ✉ Nudge
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
              {adminActorAggs.length === 0 && (
                <div className="px-6 py-10 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                  No court actors have been reported yet.
                </div>
              )}
              {adminActorAggs.slice(0, 50).map((agg, i) => {
                const isPublic = agg.count >= 5;
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
                        {agg.state_code && (
                          <span className="text-xs" style={{ color: GOLD }}>{agg.state_code}</span>
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
                      {a.state_code && <span className="text-xs" style={{ color: GOLD }}>{a.state_code}</span>}
                      {a.court_or_county && <span className="text-xs" style={{ color: "rgba(245,245,245,0.4)" }}>· {a.court_or_county}</span>}
                    </div>
                    <span className="text-[11px]" style={{ color: "rgba(245,245,245,0.35)" }}>
                      {timeAgo(a.created_at)}
                    </span>
                  </div>
                  <div className="text-[11px]" style={{ color: "rgba(245,245,245,0.4)" }}>
                    Reported by {a.reporter_name || "—"} ({a.reporter_email || "no email"})
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
              Click any submission to view full details. Approve to make quotes eligible for public display.
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
                  Copy this message into Gmail, Outlook, iMessage, or anywhere else.
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
                <div className="rounded-lg px-4 py-2.5 text-sm text-white"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  {nudgeTarget.email}
                </div>
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
                <div className="rounded-lg px-4 py-2.5 text-sm text-white"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  {nudgeTarget.subject}
                </div>
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
                <div className="rounded-lg px-4 py-3 text-sm whitespace-pre-wrap"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(245,245,245,0.8)", maxHeight: "300px", overflowY: "auto" }}>
                  {nudgeTarget.body}
                </div>
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
                disabled={nudgeSending === "sending" || nudgeSending === "sent"}
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
    </div>
  );
}
