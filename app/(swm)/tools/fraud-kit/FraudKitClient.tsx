"use client";

import Link from "next/link";
import { useState } from "react";

const GOLD = "#C9A227";
const NAVY = "#0F1E30";

const MODULES = [
  { n: 1, title: "Stop saying corrupt. Start saying elements.", topic: "Wire fraud checklist in plain English" },
  { n: 2, title: "Document like an investigator", topic: "Facts vs. conclusions log" },
  { n: 3, title: "Preserve everything the right way", topic: "Backups, originals, privacy discipline" },
  { n: 4, title: "Follow the money to the right door", topic: "MFCU, FBI, HHS-OIG, AG, licensing board" },
  { n: 5, title: "What a useful complaint looks like", topic: "§1001 truthfulness + one-page summary" },
  { n: 6, title: "When and how to bring in a lawyer", topic: "Bench strength + organized packet" },
];

type Props = {
  initialEmail?: string;
  initialHasAccess?: boolean;
};

export function FraudKitClient({ initialEmail = "", initialHasAccess = false }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [hasAccess, setHasAccess] = useState(initialHasAccess);
  const [checking, setChecking] = useState(false);
  const [buying, setBuying] = useState(false);
  const [waitlisting, setWaitlisting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function checkAccess(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/report-kit/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not verify access.");
      setHasAccess(Boolean(data.hasAccess));
      if (!data.hasAccess) {
        setError("No purchase found for this email yet. Prepay below or join the free waitlist.");
      } else {
        setSuccess("Access confirmed. Your modules are below.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed.");
    } finally {
      setChecking(false);
    }
  }

  async function startCheckout() {
    if (!email) {
      setError("Enter your email first — we need it to grant access when the course goes live.");
      return;
    }
    setBuying(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/report-kit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout unavailable.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setBuying(false);
    }
  }

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    setWaitlisting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/coaching-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || "Report Kit waitlist",
          email,
          state: state || null,
          interest: "report-kit",
          message: "Report Kit waitlist — notify when live",
          source: "report_kit_waitlist",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save your spot.");
      setWaitlistDone(true);
      setSuccess("You're on the list. We'll email you the moment The Report Kit goes live.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Waitlist signup failed.");
    } finally {
      setWaitlisting(false);
    }
  }

  return (
    <div className="min-h-screen text-[#f4f1ea]" style={{ background: NAVY }}>
      <div className="mx-auto max-w-3xl px-5 py-12">
        <Link href="/tools/fraud-packet" className="text-sm font-bold hover:underline" style={{ color: GOLD }}>
          ← Free Fraud Packet
        </Link>

        <div
          className="mt-6 inline-block rounded-full border px-4 py-1.5 text-xs font-black uppercase tracking-[0.2em]"
          style={{ borderColor: `${GOLD}88`, color: GOLD }}
        >
          Coming soon
        </div>

        <h1 className="mt-4 text-4xl font-black tracking-tight text-white">The Report Kit</h1>
        <p className="mt-3 text-sm text-white/60">Reviewed for educational accuracy by Shawn Lee, Criminal Trial Attorney</p>
        <p className="mt-4 text-base leading-relaxed text-white/85">
          Shawn&apos;s full step-by-step video course is in production. The free Fraud Packet is live now. When The Report Kit
          launches, you&apos;ll get the complete course, worksheets, annotated examples, and lifetime updates —{" "}
          <strong className="text-white">$79 one-time</strong>.
        </p>

        {hasAccess ? (
          <div className="mt-8 space-y-4">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
              {success || `Access confirmed for ${email}. Course videos ship as Shawn records each module.`}
            </div>
            {MODULES.map(mod => (
              <div key={mod.n} className="rounded-xl border border-white/10 bg-black/25 p-5">
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: GOLD }}>
                  Module {mod.n}
                </div>
                <div className="mt-1 text-lg font-bold text-white">{mod.title}</div>
                <p className="mt-2 text-sm text-white/70">{mod.topic}</p>
                <p className="mt-3 text-xs text-white/45">
                  Video embeds appear here when each module is published. You already have lifetime access.
                </p>
              </div>
            ))}
            <p className="text-xs text-white/50">{SHAWN_DISCLAIMER}</p>
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-xs font-bold uppercase tracking-wider text-white/50">Option 1 — Free</div>
                <h2 className="mt-2 text-xl font-bold text-white">Be first when it&apos;s live</h2>
                <p className="mt-2 text-sm text-white/75">
                  No payment now. We&apos;ll email you the launch link before we announce it publicly.
                </p>
                {waitlistDone ? (
                  <p className="mt-4 text-sm font-semibold text-emerald-300">{success}</p>
                ) : (
                  <form onSubmit={joinWaitlist} className="mt-4 space-y-3">
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full rounded-lg border border-white/15 bg-[#050A14] px-3 py-2.5 text-sm text-white"
                    />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      className="w-full rounded-lg border border-white/15 bg-[#050A14] px-3 py-2.5 text-sm text-white"
                    />
                    <input
                      type="text"
                      value={state}
                      onChange={e => setState(e.target.value)}
                      placeholder="State (optional)"
                      className="w-full rounded-lg border border-white/15 bg-[#050A14] px-3 py-2.5 text-sm text-white"
                    />
                    <button
                      type="submit"
                      disabled={waitlisting}
                      className="w-full rounded-xl border py-3 text-sm font-bold tracking-wider disabled:opacity-60"
                      style={{ borderColor: `${GOLD}66`, color: GOLD }}
                    >
                      {waitlisting ? "Saving…" : "JOIN THE WAITLIST"}
                    </button>
                  </form>
                )}
              </div>

              <div className="rounded-2xl border p-5" style={{ borderColor: `${GOLD}55` }}>
                <div className="text-xs font-bold uppercase tracking-wider text-white/50">Option 2 — Prepay</div>
                <h2 className="mt-2 text-xl font-bold text-white">Lock in $79 now</h2>
                <p className="mt-2 text-sm text-white/75">
                  Pay once today. Access unlocks automatically when the course goes live — same price, no surprise
                  increase.
                </p>
                <div className="mt-4 text-3xl font-black text-white">$79</div>
                <p className="text-xs text-white/55">One-time · lifetime access when published</p>
                <ul className="mt-4 space-y-2 text-sm text-white/85">
                  <li>• 6-module video course (Shawn teaches, Meg translates)</li>
                  <li>• Printable worksheets + state door directory</li>
                  <li>• Annotated complaint examples</li>
                </ul>
                <button
                  type="button"
                  onClick={() => void startCheckout()}
                  disabled={buying}
                  className="mt-5 w-full rounded-xl py-4 text-sm font-bold tracking-wider text-[#050A14] disabled:opacity-50"
                  style={{ background: GOLD }}
                >
                  {buying ? "Redirecting to checkout…" : "PREPAY — GET ACCESS WHEN LIVE"}
                </button>
                <p className="mt-3 text-center text-xs text-white/45">
                  Can&apos;t afford $79? Use the Contact form on the Shawn Lee Report site — hardship access available.
                </p>
              </div>
            </div>

            <form onSubmit={checkAccess} className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
              <label className="block text-xs font-bold uppercase tracking-wider text-white/50">
                Already prepaid? Check access
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="flex-1 rounded-lg border border-white/15 bg-[#050A14] px-3 py-2.5 text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={checking}
                  className="rounded-lg px-5 py-2.5 text-sm font-bold text-[#050A14] disabled:opacity-60"
                  style={{ background: GOLD }}
                >
                  {checking ? "Checking…" : "Unlock"}
                </button>
              </div>
            </form>
          </>
        )}

        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
        {success && !hasAccess && !waitlistDone && <p className="mt-4 text-sm text-emerald-300">{success}</p>}

        <p className="mt-8 text-xs text-white/50">{SHAWN_DISCLAIMER}</p>
      </div>
    </div>
  );
}

const SHAWN_DISCLAIMER =
  "General legal education — not legal advice. No attorney-client relationship. Consult a licensed attorney in your state.";