"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  EVIDENCE_BORDER,
  EVIDENCE_WASH,
  GOLD,
  GOLD_BORDER,
  GOLD_SOFT,
  GOLD_WASH,
  HAIRLINE,
  RED,
  HAIRLINE_STRONG,
  INK,
  NAVY,
  SURFACE,
  SURFACE_RAISED,
} from "../theme";


type Pseudonym = { id: string; email: string; handle: string; created_at: string };

type Match = {
  actor_key: string;
  actor: { name: string; state: string | null; role: string };
  other_parents_count: number;
};

export default function CirclesIndexPage() {
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [handle, setHandle] = useState<Pseudonym | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [draftHandle, setDraftHandle] = useState("");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setAccessError(null);
    try {
      const [pseudoRes, matchesRes] = await Promise.all([
        fetch("/api/connect/pseudonym", { cache: "no-store" }),
        fetch("/api/connect/matches", { cache: "no-store" }),
      ]);
      if (pseudoRes.status === 401 || pseudoRes.status === 402 || pseudoRes.status === 403) {
        const data = await pseudoRes.json().catch(() => ({}));
        setAccessError(data?.error ?? "You don't have Circle access yet.");
        setLoading(false);
        return;
      }
      const pseudoData = await pseudoRes.json();
      setHandle(pseudoData?.pseudonym ?? null);

      if (matchesRes.ok) {
        const m = await matchesRes.json();
        setMatches(Array.isArray(m?.matches) ? m.matches : []);
      }
    } catch (err) {
      console.error(err);
      setAccessError("Something went wrong loading your circle.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onHandleSet = () => void load();
    window.addEventListener("circle-handle-set", onHandleSet);
    return () => window.removeEventListener("circle-handle-set", onHandleSet);
  }, [load]);

  async function saveHandle(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setHandleError(null);
    try {
      const res = await fetch("/api/connect/pseudonym", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: draftHandle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHandleError(data?.error ?? "Could not save handle.");
        return;
      }
      setHandle(data.pseudonym);
      setDraftHandle("");
    } finally {
      setSaving(false);
    }
  }

  const totalOtherParents = matches.reduce((sum, match) => sum + match.other_parents_count, 0);

  return (
    <main className="min-h-screen" style={{ backgroundColor: NAVY, color: "white" }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-12">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="rounded-[2rem] p-6 md:p-8" style={{ background: "linear-gradient(135deg, rgba(244,241,234,0.075), rgba(244,241,234,0.025))", border: `1px solid ${HAIRLINE_STRONG}` }}>
            <p className="kicker text-xs" style={{ color: RED }}>Connection Circles</p>
            <h1 className="mt-2 text-4xl font-black md:text-6xl">Your private <em className="gold-italic">circle</em></h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#f4f1ea]/72 md:text-base">
              This is the private side of Stand With Meg. It shows verified survey submitters who reported the same court actor as you, using handles only until both sides consent to an email introduction.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <HeroAssurance label="Verified survey email" text="Only eligible survey submitters can enter." />
              <HeroAssurance label="Handle-first rooms" text="No public directory and no exposed email." />
              <HeroAssurance label="Double opt-in contact" text="Email intro happens only after both sides agree." />
            </div>
          </div>
          <div className="rounded-[2rem] p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${GOLD_BORDER}` }}>
            <p className="kicker text-[10px]" style={{ color: RED }}>Start here</p>
            <h2 className="mt-2 text-xl font-black">Use this like a private command center.</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#f4f1ea]/66">
              Open one actor room at a time, talk by handle, and use requests only when you want a mutual email introduction.
            </p>
            <div className="mt-5 grid gap-2 text-xs text-[#f4f1ea]/68">
              <GuidePill n="1" text="Open the room for the court actor you recognize." />
              <GuidePill n="2" text="Read the room chat before sharing anything personal." />
              <GuidePill n="3" text="Send a request when you want email contact." />
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link href="/connect/requests" className="rounded-lg px-4 py-2 text-sm font-bold" style={{ border: "1px solid rgba(244,241,234,0.18)" }}>
              Review requests
            </Link>
            <Link href="/connect/account" className="rounded-lg px-4 py-2 text-sm font-bold text-[#f4f1ea]/70 hover:text-[#f4f1ea]" style={{ border: "1px solid rgba(244,241,234,0.16)" }}>
              Manage access
            </Link>
            </div>
          </div>

          <InvitePanel />
        </div>

        {loading && <p className="mt-10 text-[#f4f1ea]/60">Loading your circle...</p>}

        {!loading && accessError && (
          <div className="mt-10 grid gap-5 md:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl p-6 md:p-7" style={{ backgroundColor: EVIDENCE_WASH, border: `1px solid ${EVIDENCE_BORDER}` }}>
              <h2 className="text-2xl font-black">You&apos;re not in the circle yet</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#f4f1ea]/80">{accessError}</p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link href="/connect" className="rounded-lg px-5 py-3 text-center text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>
                  Choose how to join
                </Link>
                <Link href="/survey" className="rounded-lg px-5 py-3 text-center text-sm font-bold text-[#f4f1ea]/85" style={{ border: `1px solid ${HAIRLINE}` }}>
                  Take the survey first
                </Link>
              </div>
            </div>
            <HowItWorksPanel />
          </div>
        )}

        {!loading && !accessError && !handle && (
          <div className="mt-10 grid gap-5 md:grid-cols-[1.05fr_0.95fr]">
            <form onSubmit={saveHandle} className="rounded-2xl p-6 md:p-7" style={{ backgroundColor: GOLD_WASH, border: `1px solid ${GOLD_BORDER}` }}>
              <p className="kicker text-[10px]" style={{ color: RED }}>Step 1</p>
              <h2 className="mt-2 text-2xl font-black">Pick a private handle</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#f4f1ea]/72">
                This is the only thing other parents see before a mutual email introduction. Do not use your legal name, your child&apos;s name, your employer, a case number, or a location that identifies you.
              </p>
              <label htmlFor="handle" className="mt-6 block text-sm font-bold text-[#f4f1ea]/80">Private handle</label>
              <input
                id="handle"
                type="text"
                value={draftHandle}
                onChange={e => setDraftHandle(e.target.value)}
                placeholder="PrairieLight"
                className="mt-2 w-full rounded-lg px-4 py-3 text-[#f4f1ea] outline-none focus:ring-1 focus:ring-amber-300/50"
                style={{ backgroundColor: "rgba(244,241,234,0.07)", border: "1px solid rgba(244,241,234,0.18)" }}
                maxLength={24}
                required
              />
              <p className="mt-2 text-xs leading-relaxed text-[#f4f1ea]/50">3-24 characters. Letters, numbers, spaces, . _ - allowed. Must start with a letter.</p>
              {handleError && <p className="mt-3 rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-2 text-sm text-red-100">{handleError}</p>}
              <button type="submit" disabled={saving} className="mt-5 w-full rounded-lg px-5 py-3 font-black disabled:opacity-60 sm:w-auto" style={{ backgroundColor: RED, color: "white" }}>
                {saving ? "Saving..." : "Save handle and enter"}
              </button>
            </form>
            <HowItWorksPanel />
          </div>
        )}

        {!loading && !accessError && handle && (
          <div className="mt-8 space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <StatusTile label="Your handle" value={handle.handle} helper="Visible to other Circle members." accent />
              <StatusTile label="Matching rooms" value={String(matches.length)} helper="Court actors you and other families both reported." />
              <StatusTile label="Other parents" value={String(totalOtherParents)} helper="Visible handles across your matching rooms." />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-2xl p-5 md:p-6" style={{ backgroundColor: SURFACE, border: `1px solid ${GOLD_BORDER}` }}>
                <p className="kicker text-[10px]" style={{ color: RED }}>How to use this area</p>
                <h2 className="mt-2 text-2xl font-black">Start with the room that matches your case</h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#f4f1ea]/68">
                  Each room is built around one court actor you reported. Open a room to see handle-only conversation, invite families who have not joined yet, or request a double opt-in email introduction with a specific parent.
                </p>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <WorkflowCard step="01" title="Choose a room" text="Rooms appear only for actors you reported and another verified family also reported." />
                  <WorkflowCard step="02" title="Talk by handle" text="Post general pattern questions. Avoid names, case numbers, filings, addresses, or child details." />
                  <WorkflowCard step="03" title="Connect carefully" text="Use requests for email introductions. The other parent can accept, decline, or ignore it." />
                </div>
              </div>
              <div className="rounded-2xl p-5" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE_STRONG}` }}>
                <p className="kicker text-[10px]" style={{ color: RED }}>Privacy guardrails</p>
                <div className="mt-4 space-y-3">
                  <RuleLine good text="Use handles and general process questions." />
                  <RuleLine good text="Use requests when you want real email contact." />
                  <RuleLine text="Do not post sealed filings, child names, phone numbers, or case strategy." />
                  <RuleLine text="Do not use Circles to contact the opposing party." />
                </div>
              </div>
            </div>

            {matches.length === 0 ? (
              <div className="rounded-2xl p-6 md:p-8" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
                <p className="kicker text-[10px]" style={{ color: RED }}>No matching rooms yet</p>
                <h2 className="mt-2 text-2xl font-black">Your circle grows when more families report the same actors.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#f4f1ea]/70">
                  Nothing is broken. It means the system has not found another verified family who reported the same reviewed court actor and is safe to show to you.
                </p>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <EmptyAction href="/survey" title="Share the survey" text="Ask another family-court parent to document what happened." />
                  <EmptyAction href="/actors" title="Check the registry" text="Search the public and submitter-gated court actor index." />
                  <EmptyAction href="/connect/requests" title="Watch requests" text="See whether someone has asked to connect with you." />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="kicker text-[10px]" style={{ color: RED }}>Your matching rooms</p>
                    <h2 className="mt-1 text-2xl font-black">Pick the room you want to work in.</h2>
                  </div>
                  <p className="max-w-md text-xs leading-relaxed text-[#f4f1ea]/48">
                    Higher parent counts usually mean more chances to compare public patterns, invite people in, or request contact.
                  </p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                {matches.map((m, index) => (
                  <Link
                    key={m.actor_key}
                    href={`/connect/circles/${m.actor_key}`}
                    className="group block rounded-2xl p-5 transition hover:-translate-y-0.5 hover:bg-white/10"
                    style={{ backgroundColor: index === 0 ? GOLD_WASH : SURFACE, border: `1px solid ${index === 0 ? GOLD_BORDER : HAIRLINE}` }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="kicker text-[10px]" style={{ color: RED }}>{index === 0 ? "Suggested first room" : m.actor.role}</p>
                        <p className="mt-2 truncate text-xl font-black">{m.actor.name}</p>
                        <p className="mt-1 text-xs text-[#f4f1ea]/50">{m.actor.role} · {m.actor.state ?? "Unknown state"}</p>
                      </div>
                      <div className="rounded-xl px-3 py-2 text-center" style={{ backgroundColor: GOLD_WASH, border: `1px solid ${GOLD_BORDER}` }}>
                        <div className="text-2xl font-black leading-none" style={{ color: GOLD }}>{m.other_parents_count}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-wider text-[#f4f1ea]/45">parents</div>
                      </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4 text-sm" style={{ borderColor: HAIRLINE }}>
                      <span className="text-[#f4f1ea]/62">Open room, chat by handle, or request double opt-in contact.</span>
                      <span className="shrink-0 font-black transition group-hover:translate-x-0.5" style={{ color: GOLD }}>Open room</span>
                    </div>
                  </Link>
                ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <PrivacyPanel title="What other parents can see" items={["Your handle", "The shared court actor room", "General state or case-year context when available", "Messages you choose to post in the room"]} />
              <PrivacyPanel title="What stays private unless both sides accept" items={["Your real name", "Your email address", "Your survey answers and case story", "Your full court actor list, child details, address, or documents"]} />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function HowItWorksPanel() {
  return (
    <aside className="rounded-2xl p-6" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
      <p className="kicker text-[10px]" style={{ color: RED }}>Safety model</p>
      <h2 className="mt-2 text-xl font-black">How Connection Circles work</h2>
      <div className="mt-5 space-y-4">
        <ExplainerStep n="1" title="Verified families only" text="You enter with the email used on the Stand With Meg survey and active Circle access." />
        <ExplainerStep n="2" title="Matched by shared court actor" text="Rooms appear only when another verified family reported the same reviewed court actor." />
        <ExplainerStep n="3" title="Handles first" text="The room uses private handles, not names, emails, case numbers, or survey answers." />
        <ExplainerStep n="4" title="Double opt-in contact" text="Emails are introduced only after one parent requests and the other parent accepts." />
      </div>
      <p className="mt-5 rounded-lg p-3 text-xs leading-relaxed text-[#f4f1ea]/58" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}>
        Peer support and organizing only. This is not legal advice, emergency support, case strategy, or a way to contact the opposing party in your case.
      </p>
    </aside>
  );
}

function HeroAssurance({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}>
      <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: GOLD_SOFT }}>{label}</div>
      <p className="mt-1 text-xs leading-relaxed text-[#f4f1ea]/58">{text}</p>
    </div>
  );
}

function ExplainerStep({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black" style={{ backgroundColor: GOLD, color: NAVY }}>
        {n}
      </div>
      <div>
        <div className="text-sm font-black text-[#f4f1ea]">{title}</div>
        <p className="mt-1 text-xs leading-relaxed text-[#f4f1ea]/58">{text}</p>
      </div>
    </div>
  );
}

function WorkflowCard({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
      <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: GOLD }}>{step}</div>
      <h3 className="mt-3 text-base font-black">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-[#f4f1ea]/58">{text}</p>
    </div>
  );
}

function RuleLine({ text, good = false }: { text: string; good?: boolean }) {
  return (
    <div className="flex gap-3 text-sm leading-relaxed text-[#f4f1ea]/68">
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
        style={{ backgroundColor: good ? "rgba(34,197,94,0.16)" : EVIDENCE_WASH, color: good ? "#bbf7d0" : "#fecaca", border: `1px solid ${good ? "rgba(34,197,94,0.30)" : EVIDENCE_BORDER}` }}
      >
        {good ? "Y" : "!"}
      </span>
      <span>{text}</span>
    </div>
  );
}

function StatusTile({ label, value, helper, accent = false }: { label: string; value: string; helper: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: accent ? GOLD_WASH : SURFACE, border: `1px solid ${accent ? GOLD_BORDER : HAIRLINE}` }}>
      <p className="text-xs uppercase tracking-wider text-[#f4f1ea]/45">{label}</p>
      <p className="mt-2 break-words text-3xl font-black" style={{ color: accent ? GOLD : "#f4f1ea" }}>{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-[#f4f1ea]/52">{helper}</p>
    </div>
  );
}

function GuidePill({ n, text }: { n: string; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black" style={{ backgroundColor: GOLD, color: NAVY }}>{n}</span>
      <span>{text}</span>
    </div>
  );
}

function EmptyAction({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="rounded-xl p-4 transition hover:bg-white/10" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
      <div className="text-sm font-black" style={{ color: GOLD }}>{title}</div>
      <p className="mt-2 text-xs leading-relaxed text-[#f4f1ea]/58">{text}</p>
    </Link>
  );
}

function PrivacyPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
      <h2 className="text-lg font-black">{title}</h2>
      <ul className="mt-4 space-y-2 text-sm text-[#f4f1ea]/68">
        {items.map(item => (
          <li key={item} className="flex gap-2">
            <span style={{ color: GOLD }}>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}


type InviteLink = {
  id: string;
  token: string;
  inviter_email: string;
  remaining_uses: number | null;
  used_count: number;
  status: "active" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
};

type ReferralStats = {
  total_referrals: number;
  pending_referrals: number;
  completed_referrals: number;
  rewarded_referrals: number;
  months_earned: number;
};

function InvitePanel() {
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [stats, setStats] = useState<ReferralStats>({ total_referrals: 0, pending_referrals: 0, completed_referrals: 0, rewarded_referrals: 0, months_earned: 0 });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/connect/invite-links", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load invites.");
      setLinks(Array.isArray(data.links) ? data.links : []);
      setStats(data.stats ?? { total_referrals: 0, pending_referrals: 0, completed_referrals: 0, rewarded_referrals: 0, months_earned: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load invites.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createLink() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/invite-links", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not create invite.");
      setLinks(prev => [data.link, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invite.");
    } finally {
      setGenerating(false);
    }
  }

  async function revokeLink(id: string) {
    try {
      const res = await fetch("/api/connect/invite-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Could not revoke link.");
      setLinks(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke link.");
    }
  }

  async function copy(url: string, token: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <div className="rounded-[2rem] p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${EVIDENCE_BORDER}` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kicker text-[10px]" style={{ color: RED }}>Referral rewards</p>
          <h2 className="mt-2 text-xl font-black">Refer a family & earn free access</h2>
        </div>
        <div className="rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: EVIDENCE_WASH, color: RED, border: `1px solid ${EVIDENCE_BORDER}` }}>
          {stats.months_earned} month{stats.months_earned === 1 ? "" : "s"} earned
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[#f4f1ea]/66">
        Share your link. When they join and pay, you get one month free.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-white/70">
        <span className="rounded-full px-2.5 py-1" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>{stats.total_referrals} referrals</span>
        <span className="rounded-full px-2.5 py-1" style={{ backgroundColor: "rgba(201,162,39,0.12)", color: GOLD }}>{stats.pending_referrals} pending</span>
        <span className="rounded-full px-2.5 py-1" style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#4ade80" }}>{stats.rewarded_referrals} paid & rewarded</span>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-2 text-sm text-red-100">{error}</p>}

      <button
        onClick={createLink}
        disabled={generating}
        className="mt-4 w-full rounded-lg px-5 py-3 text-sm font-black disabled:opacity-50 sm:w-auto"
        style={{ backgroundColor: RED, color: "white" }}
      >
        {generating ? "Creating..." : "Generate invite link"}
      </button>

      {loading && <p className="mt-4 text-xs text-[#f4f1ea]/50">Loading your links...</p>}

      {!loading && links.length > 0 && (
        <div className="mt-4 space-y-2">
          {links.map(link => {
            const url = `${typeof window !== "undefined" ? window.location.origin : "https://my.standwithmeg.com"}/connect/invite/${link.token}`;
            return (
              <div key={link.id} className="rounded-xl p-3" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: `1px solid ${HAIRLINE}` }}>
                <div className="flex items-center justify-between gap-2">
                  <code className="truncate text-xs text-[#f4f1ea]/80">{url}</code>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => copy(url, link.token)}
                      className="rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide"
                      style={{ backgroundColor: GOLD, color: "#091625" }}
                    >
                      {copied === link.token ? "Copied" : "Copy"}
                    </button>
                    <button
                      onClick={() => revokeLink(link.id)}
                      className="rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide text-red-200"
                      style={{ border: "1px solid rgba(185,28,28,0.5)" }}
                    >
                      Revoke
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-[#f4f1ea]/50">
                  {link.used_count} used
                  {link.remaining_uses != null ? ` · ${link.remaining_uses} left` : " · unlimited uses"}
                  {" · expires "}{new Date(link.expires_at).toLocaleDateString()}
                </p>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
