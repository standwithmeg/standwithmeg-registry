"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  GOLD,
  GOLD_BORDER,
  GOLD_WASH,
  HAIRLINE,
  RED,
  HAIRLINE_STRONG,
  INK,
  NAVY,
  SURFACE,
  SURFACE_RAISED,
} from "../theme";


// Incoming requests retain recipient_token (needed for the "Review & respond"
// link). Outgoing requests do NOT include recipient_token or any email fields.
type IncomingRequest = {
  id: string;
  status: "pending" | "accepted" | "declined" | "withdrawn" | "expired";
  actor_name: string;
  actor_state: string | null;
  actor_role: string;
  requester_handle: string;
  recipient_handle: string;
  requester_message: string | null;
  created_at: string;
  decided_at: string | null;
  intro_sent_at: string | null;
  recipient_token: string;
};

type OutgoingRequest = {
  id: string;
  status: "pending" | "accepted" | "declined" | "withdrawn" | "expired";
  actor_name: string;
  actor_state: string | null;
  actor_role: string;
  requester_handle: string;
  recipient_handle: string;
  requester_message: string | null;
  created_at: string;
  decided_at: string | null;
  intro_sent_at: string | null;
};

function statusChip(status: IncomingRequest["status"]) {
  const map: Record<IncomingRequest["status"], { bg: string; fg: string; label: string }> = {
    pending: { bg: "rgba(212,168,64,0.18)", fg: GOLD, label: "Pending" },
    accepted: { bg: "rgba(34,197,94,0.18)", fg: "#bbf7d0", label: "Accepted" },
    declined: { bg: "rgba(148,163,184,0.18)", fg: "#cbd5e1", label: "Declined" },
    withdrawn: { bg: "rgba(148,163,184,0.18)", fg: "#cbd5e1", label: "Withdrawn" },
    expired: { bg: "rgba(148,163,184,0.18)", fg: "#cbd5e1", label: "Expired" },
  };
  const s = map[status];
  return <span className="rounded-md px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: s.bg, color: s.fg }}>{s.label}</span>;
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function statusMeaning(status: IncomingRequest["status"]) {
  const map: Record<IncomingRequest["status"], string> = {
    pending: "No email has been shared. Someone still needs to respond.",
    accepted: "Both sides agreed. An introduction email is sent or already sent.",
    declined: "The request was declined. Identities stayed private.",
    withdrawn: "The sender canceled it. Identities stayed private.",
    expired: "The private response link is no longer active.",
  };
  return map[status];
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f4f1ea]/45">{label}</p>
      <p className="mt-2 text-3xl font-black" style={{ color: GOLD }}>{value}</p>
    </div>
  );
}

function ExplainerLine({ n, text }: { n: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black" style={{ backgroundColor: GOLD, color: NAVY }}>{n}</span>
      <span>{text}</span>
    </div>
  );
}

function EmptyRequestState({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-4 rounded-2xl p-5" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
      <p className="text-sm font-black">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-[#f4f1ea]/58">{text}</p>
    </div>
  );
}

function SafetyPoint({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
      <p className="text-sm font-black" style={{ color: GOLD }}>{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-[#f4f1ea]/58">{text}</p>
    </div>
  );
}

export default function RequestsPage() {
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWithdrawError(null);
    try {
      const res = await fetch("/api/connect/requests", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not load requests.");
        return;
      }
      setIncoming(data.incoming ?? []);
      setOutgoing(data.outgoing ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function withdraw(id: string) {
    if (!confirm("Withdraw this request?")) return;
    setWithdrawError(null);
    try {
      const res = await fetch(`/api/connect/requests/${id}/withdraw`, { method: "POST" });
      if (!res.ok) {
        throw new Error(`Failed to withdraw request: ${res.status}`);
      }
      await load();
    } catch (err) {
      console.error("Withdraw error:", err);
      setWithdrawError("Failed to withdraw request. Please try again.");
    }
  }

  const incomingPending = incoming.filter(r => r.status === "pending").length;
  const sentPending = outgoing.filter(r => r.status === "pending").length;
  const accepted = [...incoming, ...outgoing].filter(r => r.status === "accepted").length;

  return (
    <main className="min-h-screen" style={{ backgroundColor: NAVY, color: "white" }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-12">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="rounded-[2rem] p-6 md:p-8" style={{ background: "linear-gradient(135deg, rgba(244,241,234,0.075), rgba(244,241,234,0.025))", border: `1px solid ${HAIRLINE_STRONG}` }}>
            <p className="kicker text-xs" style={{ color: RED }}>Connection Circles</p>
            <h1 className="mt-2 text-4xl font-black md:text-6xl">Request center</h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[#f4f1ea]/70 md:text-base">
              This is where double opt-in email introductions are tracked. A request does not reveal your name, email, case story, documents, or full actor list.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <SummaryTile label="Incoming pending" value={String(incomingPending)} />
              <SummaryTile label="Sent pending" value={String(sentPending)} />
              <SummaryTile label="Accepted intros" value={String(accepted)} />
            </div>
          </div>
          <aside className="rounded-[2rem] p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${GOLD_BORDER}` }}>
            <p className="kicker text-[10px]" style={{ color: RED }}>What happens here</p>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#f4f1ea]/68">
              <ExplainerLine n="1" text="Someone asks for a private email introduction." />
              <ExplainerLine n="2" text="The other parent can accept, decline, ignore, or let it expire." />
              <ExplainerLine n="3" text="Only accepted requests send an email introduction to both sides." />
            </div>
            <Link href="/connect/circles" className="mt-5 block rounded-lg px-4 py-3 text-center text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>
              Back to your circle
            </Link>
          </aside>
        </div>

        {loading && <p className="mt-10 text-[#f4f1ea]/60">Loading...</p>}
        {error && <p className="mt-6 rounded-lg border border-red-400/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">{error}</p>}
        {withdrawError && <p className="mt-6 rounded-lg border border-red-400/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">{withdrawError}</p>}

        {!loading && !error && (
          <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl p-5 md:p-6" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
              <div className="flex items-end justify-between gap-4 border-b pb-4" style={{ borderColor: HAIRLINE }}>
                <div>
                  <h2 className="text-xl font-black">Incoming</h2>
                  <p className="mt-1 text-xs text-[#f4f1ea]/50">Parents asking to connect with you.</p>
                </div>
                <span className="rounded-xl px-3 py-2 text-sm font-black" style={{ backgroundColor: GOLD_WASH, color: GOLD, border: `1px solid ${GOLD_BORDER}` }}>{incoming.length}</span>
              </div>
              {incoming.length === 0 ? (
                <EmptyRequestState title="No incoming requests right now" text="You do not need to do anything. If another verified parent asks for an intro, it will appear here before any email is shared." />
              ) : (
                <ul className="mt-4 space-y-3">
                  {incoming.map(r => (
                    <li key={r.id} className="rounded-2xl p-4" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black" style={{ color: GOLD }}>{r.requester_handle}</span>
                        {statusChip(r.status)}
                      </div>
                      <p className="mt-2 text-xs text-[#f4f1ea]/60">{r.actor_role} · {r.actor_name}{r.actor_state ? ` · ${r.actor_state}` : ""}</p>
                      <p className="mt-1 text-[11px] text-[#f4f1ea]/38">Received {dateLabel(r.created_at)}</p>
                      {r.requester_message && <p className="mt-3 rounded-xl p-3 text-sm leading-relaxed text-[#f4f1ea]/78" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}>&ldquo;{r.requester_message}&rdquo;</p>}
                      <p className="mt-3 text-xs leading-relaxed text-[#f4f1ea]/48">{statusMeaning(r.status)}</p>
                      {r.status === "pending" && (
                        <Link href={`/connect/requests/${r.recipient_token}`} className="mt-3 inline-block rounded-lg px-4 py-2 text-xs font-black" style={{ backgroundColor: RED, color: "white" }}>
                          Review and respond
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl p-5 md:p-6" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
              <div className="flex items-end justify-between gap-4 border-b pb-4" style={{ borderColor: HAIRLINE }}>
                <div>
                  <h2 className="text-xl font-black">Sent</h2>
                  <p className="mt-1 text-xs text-[#f4f1ea]/50">Connection requests you&apos;ve made.</p>
                </div>
                <span className="rounded-xl px-3 py-2 text-sm font-black" style={{ backgroundColor: GOLD_WASH, color: GOLD, border: `1px solid ${GOLD_BORDER}` }}>{outgoing.length}</span>
              </div>
              {outgoing.length === 0 ? (
                <EmptyRequestState title="You have not sent any requests yet" text="Open a room, review the handle-only context, then request an email intro only when it makes sense." />
              ) : (
                <ul className="mt-4 space-y-3">
                  {outgoing.map(r => (
                    <li key={r.id} className="rounded-2xl p-4" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black" style={{ color: GOLD }}>{r.recipient_handle}</span>
                        {statusChip(r.status)}
                      </div>
                      <p className="mt-2 text-xs text-[#f4f1ea]/60">{r.actor_role} · {r.actor_name}{r.actor_state ? ` · ${r.actor_state}` : ""}</p>
                      <p className="mt-1 text-[11px] text-[#f4f1ea]/38">Sent {dateLabel(r.created_at)}</p>
                      {r.requester_message && <p className="mt-3 rounded-xl p-3 text-sm leading-relaxed text-[#f4f1ea]/78" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}>&ldquo;{r.requester_message}&rdquo;</p>}
                      <p className="mt-3 text-xs leading-relaxed text-[#f4f1ea]/48">{statusMeaning(r.status)}</p>
                      {r.status === "pending" && (
                        <button onClick={() => withdraw(r.id)} className="mt-3 rounded-lg px-3 py-1.5 text-xs font-bold text-[#f4f1ea]/80 hover:text-[#f4f1ea]" style={{ border: "1px solid rgba(244,241,234,0.2)" }}>
                          Withdraw
                        </button>
                      )}
                      {r.status === "accepted" && r.intro_sent_at && (
                        <p className="mt-2 text-xs text-emerald-300">Introduction email sent.</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            </div>
            <aside className="rounded-2xl p-5" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE_STRONG}` }}>
              <p className="kicker text-[10px]" style={{ color: RED }}>Safety checklist</p>
              <h2 className="mt-2 text-lg font-black">Before accepting or sending</h2>
              <div className="mt-4 space-y-3">
                <SafetyPoint title="Look for a shared actor" text="Requests should be tied to the same court actor room, not a general networking ask." />
                <SafetyPoint title="Keep messages general" text="Do not put child names, case numbers, sealed facts, or strategy in request notes." />
                <SafetyPoint title="Email is the reveal" text="Only acceptance shares email addresses. Decline or ignore if you are unsure." />
              </div>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
