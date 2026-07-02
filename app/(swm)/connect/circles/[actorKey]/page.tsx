"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  GOLD,
  GOLD_BORDER,
  GOLD_WASH,
  HAIRLINE,
  HAIRLINE_STRONG,
  INK,
  NAVY,
  RED,
  SURFACE,
  SURFACE_RAISED,
} from "../../theme";
import CircleChat from "./CircleChat";


type Actor = { name: string; state: string | null; role: string };

type Parent = {
  pseudonym: string;
  ref: string;
  has_handle: boolean;
  state: string | null;
  case_year: number | null;
  submission_count: number;
  outgoing_request_status: "pending" | "accepted" | "declined" | "withdrawn" | "expired" | null;
  outgoing_request_id: string | null;
  invited?: boolean;
};

export default function CircleActorDetailPage() {
  const params = useParams<{ actorKey: string }>();
  const router = useRouter();
  const actorKey = params?.actorKey;

  const [actor, setActor] = useState<Actor | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // request modal
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [invitingRef, setInvitingRef] = useState<string | null>(null);

  async function inviteToCircle(parent: Parent) {
    if (!actorKey || invitingRef) return;
    setInvitingRef(parent.ref);
    try {
      const res = await fetch(`/api/connect/matches/${actorKey}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: parent.ref }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.invited) {
        setParents(prev => prev.map(p => (p.ref === parent.ref ? { ...p, invited: true } : p)));
      } else if (data?.error) {
        setError(data.error);
      }
    } finally {
      setInvitingRef(null);
    }
  }

  const load = useCallback(async () => {
    if (!actorKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/connect/matches/${actorKey}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not load this match.");
        return;
      }
      setActor(data.actor);
      setParents(data.parents ?? []);
    } finally {
      setLoading(false);
    }
  }, [actorKey]);

  useEffect(() => { void load(); }, [load]);

  function openRequest(pseudonym: string) {
    setOpenFor(pseudonym);
    setMessage("");
    setSubmitError(null);
    setSubmitOk(null);
  }

  async function submitRequest() {
    if (!actorKey || !openFor) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitOk(null);
    try {
      const res = await fetch("/api/connect/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_key: actorKey,
          recipient_pseudonym: openFor,
          message,
          attestation: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data?.error ?? "Could not send the request.");
        return;
      }
      setSubmitOk("Request sent. They'll get a private link. We won't tell them anything about your case or identity.");
      await load();
      setTimeout(() => setOpenFor(null), 1200);
    } finally {
      setSubmitting(false);
    }
  }

  async function leaveRoom() {
    if (!actorKey || !actor) return;
    const ok = window.confirm(`Leave the ${actor.name} circle? It will be hidden from your circle list.`);
    if (!ok) return;
    setLeaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/connect/matches/${actorKey}/leave`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Could not leave this room.");
        return;
      }
      router.push("/connect/circles");
    } finally {
      setLeaving(false);
    }
  }

  const joinedParents = parents.filter(parent => parent.has_handle).length;
  const pendingRequests = parents.filter(parent => parent.outgoing_request_status === "pending").length;
  const acceptedRequests = parents.filter(parent => parent.outgoing_request_status === "accepted").length;

  return (
    <main className="min-h-screen" style={{ backgroundColor: NAVY, color: "white" }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-12">
        <Link href="/connect/circles" className="text-xs uppercase tracking-wider text-[#f4f1ea]/60 hover:text-[#f4f1ea]">&larr; Back to your circle</Link>

        {loading && <p className="mt-6 text-[#f4f1ea]/60">Loading...</p>}

        {!loading && error && (
          <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: "rgba(198,61,47,0.13)", border: "1px solid rgba(198,61,47,0.35)" }}>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && actor && (
          <>
            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div className="rounded-[2rem] p-6 md:p-8" style={{ background: "linear-gradient(135deg, rgba(244,241,234,0.075), rgba(244,241,234,0.025))", border: `1px solid ${HAIRLINE_STRONG}` }}>
                <p className="text-xs uppercase tracking-wider" style={{ color: RED }}>{actor.role}</p>
                <h1 className="mt-1 text-4xl font-black md:text-6xl">{actor.name}</h1>
                <p className="mt-2 text-sm text-[#f4f1ea]/60">{actor.state ?? "Unknown state"}</p>
                <p className="mt-5 max-w-3xl text-sm leading-relaxed text-[#f4f1ea]/70 md:text-base">
                  This room is for verified families who reported this same court actor. Use it to compare public process patterns by handle, invite eligible parents in, or request a double opt-in email introduction.
                </p>
                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  <RoomStat label="Visible parents" value={String(parents.length)} />
                  <RoomStat label="Joined handles" value={String(joinedParents)} />
                  <RoomStat label="Accepted intros" value={String(acceptedRequests)} />
                </div>
              </div>
              <aside className="rounded-[2rem] p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${GOLD_BORDER}` }}>
                <p className="kicker text-[10px]" style={{ color: RED }}>Room workflow</p>
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#f4f1ea]/68">
                  <WorkflowLine n="1" text="Read the room context before posting." />
                  <WorkflowLine n="2" text="Use the chat for general pattern support by handle." />
                  <WorkflowLine n="3" text="Invite not-yet-joined parents or request a mutual email intro." />
                </div>
                <button
                  type="button"
                  onClick={leaveRoom}
                  disabled={leaving}
                  className="mt-5 w-full rounded-lg px-4 py-3 text-sm font-bold text-[#f4f1ea]/75 hover:text-[#f4f1ea] disabled:opacity-50"
                  style={{ border: "1px solid rgba(244,241,234,0.16)" }}
                >
                  {leaving ? "Leaving..." : "Leave this room"}
                </button>
              </aside>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-4">
              <GuidanceCard title="Good room use" text="Ask general process questions, share public patterns, and keep your identity separate from your story." />
              <GuidanceCard title="Do not post" text="Case numbers, sealed details, child names, addresses, phone numbers, legal strategy, or private documents." />
              <GuidanceCard title="Invite button" text="Use this when the system sees another eligible family who has not joined the private room yet." />
              <GuidanceCard title="Request button" text="Use this only when you want a real email introduction with another parent." />
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
              <div>
                {actorKey && <CircleChat actorKey={actorKey} />}
              </div>

              <section className="rounded-2xl p-5 md:p-6" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
            <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: HAIRLINE }}>
              <div>
                <p className="kicker text-[10px]" style={{ color: RED }}>Parents in this circle</p>
                <h2 className="mt-1 text-2xl font-black">Handles and invites</h2>
              </div>
              <span className="rounded-xl px-3 py-2 text-sm font-black" style={{ backgroundColor: GOLD_WASH, color: GOLD, border: `1px solid ${GOLD_BORDER}` }}>{pendingRequests} pending</span>
            </div>
            {parents.length === 0 ? (
              <div className="mt-4 rounded-2xl p-6 text-sm text-[#f4f1ea]/70" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
                <p>No other parents are currently visible here. They may have been filtered for safety, or they haven&apos;t accepted Circle access yet.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {parents.map(p => {
                  const requested = p.outgoing_request_status === "pending";
                  const accepted = p.outgoing_request_status === "accepted";
                  return (
                    <li
                      key={p.ref}
                      className="rounded-2xl p-4"
                      style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}
                    >
                      <div className="flex flex-col gap-3">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-lg font-black" style={{ color: GOLD }}>{p.pseudonym}</p>
                          {!p.has_handle && <span className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#f4f1ea]/55" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}>not joined</span>}
                        </div>
                        <p className="mt-1 text-xs text-[#f4f1ea]/60">
                          {p.state ?? "state n/a"}{p.case_year ? ` · case ${p.case_year}` : ""}
                          {p.submission_count > 1 ? ` · ${p.submission_count} submissions` : ""}
                          {!p.has_handle ? " · hasn't joined yet" : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {accepted && (
                          <span className="rounded-md px-3 py-1.5 text-xs font-bold" style={{ backgroundColor: "rgba(34,197,94,0.18)", color: "#bbf7d0" }}>Introduced via email</span>
                        )}
                        {requested && (
                          <span className="rounded-md px-3 py-1.5 text-xs font-bold" style={{ backgroundColor: "rgba(212,168,64,0.18)", color: GOLD }}>Awaiting their reply</span>
                        )}
                        {!accepted && !p.has_handle && (
                          p.invited ? (
                            <span className="rounded-md px-3 py-1.5 text-xs font-bold" style={{ backgroundColor: "rgba(244,241,234,0.08)", color: "rgba(244,241,234,0.6)" }}>Invited ✓</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void inviteToCircle(p)}
                              disabled={invitingRef === p.ref}
                              className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
                              style={{ border: `1px solid ${GOLD}`, color: GOLD }}
                            >
                              {invitingRef === p.ref ? "Inviting..." : "Invite to the circle"}
                            </button>
                          )
                        )}
                        {!requested && !accepted && p.has_handle && (
                          <button
                            type="button"
                            onClick={() => openRequest(p.pseudonym)}
                            className="rounded-lg px-4 py-2 text-sm font-black"
                            style={{ backgroundColor: RED, color: "white" }}
                          >
                            Request to connect
                          </button>
                        )}
                      </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-5 rounded-2xl p-5 text-xs text-[#f4f1ea]/60" style={{ backgroundColor: GOLD_WASH, border: `1px solid ${GOLD_BORDER}` }}>
              <p className="font-bold text-[#f4f1ea]/80">How a connection works</p>
              <p className="mt-2">When you request, the other parent gets a private link. They never see your name, email, court actor list, or case details unless they accept. If they accept, you both get one introduction email exposing only your email addresses.</p>
              <p className="mt-2">People who appear to be tied to the same family or case are filtered out where the system can detect it. Only use requests for peer support with another family who reported the same court actor.</p>
            </div>
              </section>
            </div>
          </>
        )}

        {openFor && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: "#0a1626", border: "1px solid rgba(212,168,64,0.3)" }}>
              <p className="text-xs uppercase tracking-wider" style={{ color: RED }}>Request to connect</p>
              <h2 className="mt-1 text-xl font-black">{openFor}</h2>
              <p className="mt-3 text-sm text-[#f4f1ea]/70">
                They&apos;ll get a private link. They won&apos;t see your name, email, case details, or story unless they accept.
              </p>

              <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-[#f4f1ea]/70">Optional note (max 600 chars)</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={600}
                className="mt-2 min-h-24 w-full rounded-lg px-3 py-2 text-sm text-[#f4f1ea] outline-none focus:ring-1 focus:ring-amber-300/50"
                style={{ backgroundColor: "rgba(244,241,234,0.07)", border: "1px solid rgba(244,241,234,0.18)" }}
                placeholder="Keep it general. e.g. &quot;Would love to compare notes on the GAL&apos;s process&quot;"
              />

              <div className="mt-4 rounded-lg p-3 text-sm text-[#f4f1ea]/75" style={{ backgroundColor: "rgba(212,168,64,0.08)", border: "1px solid rgba(212,168,64,0.22)" }}>
                Only use this to contact another family who reported the same court actor. Do not use Connection Circles to contact the other party in your own case, harass anyone, or ask for private case details.
              </div>

              {submitError && <p className="mt-3 rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-2 text-sm text-red-100">{submitError}</p>}
              {submitOk && <p className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-100">{submitOk}</p>}

              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setOpenFor(null)} className="rounded-lg px-4 py-2 text-sm font-bold text-[#f4f1ea]/70 hover:text-[#f4f1ea]" style={{ border: "1px solid rgba(244,241,234,0.16)" }}>
                  Cancel
                </button>
                <button type="button" onClick={submitRequest} disabled={submitting} className="rounded-lg px-5 py-2.5 text-sm font-black disabled:opacity-50" style={{ backgroundColor: RED, color: "white" }}>
                  {submitting ? "Sending..." : "Send request"}
                </button>
              </div>
              <p className="mt-3 text-[11px] text-[#f4f1ea]/40">By sending, you agree to the safety rule above. <span style={{ color: RED }}>Misuse may end your Circle access.</span></p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function RoomStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f4f1ea]/45">{label}</p>
      <p className="mt-2 text-3xl font-black" style={{ color: GOLD }}>{value}</p>
    </div>
  );
}

function WorkflowLine({ n, text }: { n: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black" style={{ backgroundColor: GOLD, color: NAVY }}>{n}</span>
      <span>{text}</span>
    </div>
  );
}

function GuidanceCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
      <p className="text-sm font-black" style={{ color: GOLD }}>{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-[#f4f1ea]/58">{text}</p>
    </div>
  );
}
