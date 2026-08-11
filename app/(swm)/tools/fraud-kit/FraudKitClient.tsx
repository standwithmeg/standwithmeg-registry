"use client";

import Link from "next/link";
import { useState } from "react";
import { ReportKitWorkspace } from "./ReportKitWorkspace";

const GOLD = "#C9A227";
const NAVY = "#0F1E30";

type Props = {
  initialEmail?: string;
  initialHasAccess?: boolean;
  authenticated?: boolean;
  canManageTesterAccess?: boolean;
};

export function FraudKitClient({
  initialEmail = "",
  initialHasAccess = false,
  authenticated = false,
  canManageTesterAccess = false,
}: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [buying, setBuying] = useState(false);
  const [waitlisting, setWaitlisting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testerEmail, setTesterEmail] = useState("");
  const [grantingTester, setGrantingTester] = useState(false);
  const [testerStatus, setTesterStatus] = useState<string | null>(null);

  async function grantTesterAccess(event: React.FormEvent) {
    event.preventDefault();
    setGrantingTester(true);
    setTesterStatus(null);
    try {
      const response = await fetch("/api/report-kit/tester-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testerEmail }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not grant tester access.");
      setTesterStatus(`Access is active for ${result.email}. They can sign in now.`);
      setTesterEmail("");
    } catch (grantError) {
      setTesterStatus(grantError instanceof Error ? grantError.message : "Could not grant tester access.");
    } finally {
      setGrantingTester(false);
    }
  }

  async function startCheckout() {
    if (!authenticated) {
      window.location.href = "/login?next=%2Ftools%2Ffraud-kit";
      return;
    }
    setBuying(true);
    setError(null);
    try {
      const res = await fetch("/api/report-kit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout unavailable.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setBuying(false);
    }
  }

  async function joinWaitlist(event: React.FormEvent) {
    event.preventDefault();
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
          message: "Report Kit waitlist - notify when live",
          source: "report_kit_waitlist",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save your spot.");
      setWaitlistDone(true);
      setSuccess("You're on the list. We'll email you with Report Kit updates.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Waitlist signup failed.");
    } finally {
      setWaitlisting(false);
    }
  }

  return (
    <div className="min-h-screen text-[#f4f1ea]" style={{ background: NAVY }}>
      <div className="mx-auto max-w-5xl px-5 py-12">
        <Link href="/tools/fraud-packet" className="inline-flex min-h-11 items-center text-sm font-bold hover:underline focus:outline-none focus:ring-2 focus:ring-[#C9A227]" style={{ color: GOLD }}>
          ← Free Fraud Packet
        </Link>

        <div className="mt-6 inline-block rounded-full border px-4 py-1.5 text-xs font-black uppercase tracking-[0.2em]" style={{ borderColor: `${GOLD}88`, color: GOLD }}>
          Private beta · Updated August 11, 2026
        </div>

        <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">The Report Kit</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-white/78">
          Learn Shawn&apos;s evidence-first framework, organize your own facts and records, map the money to the right jurisdiction, and create a careful documentation packet for the current FBI, DOJ-directed, HHS OIG, USPIS, IC3, FTC, IRS, Inspector General, or state route that fits.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
          Built from Shawn Lee&apos;s public educational teaching. New material is source-labeled and legally bounded; no case-specific review or attorney-client relationship is created.
        </p>

        {initialHasAccess ? (
          <>
            <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100" role="status">
              Access confirmed for {initialEmail}. Your private workspace is below; drafts stay in this browser.
            </div>
            <ReportKitWorkspace email={initialEmail} />
            {canManageTesterAccess ? (
              <section className="mt-6 rounded-2xl border border-[#C9A227]/35 bg-black/20 p-5" aria-labelledby="tester-access-heading">
                <h2 id="tester-access-heading" className="text-lg font-black text-white">Founder tester access</h2>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Enter Mandy&apos;s exact sign-in email. This creates account-based access; it does not send or expose any case records.
                </p>
                <form onSubmit={grantTesterAccess} className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <label className="flex-1 text-xs font-bold text-white/70">
                    Tester email
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={testerEmail}
                      onChange={event => setTesterEmail(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-[#050A14] px-3 py-2.5 text-sm text-white outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/40"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={grantingTester}
                    className="min-h-11 self-end rounded-lg bg-[#C9A227] px-5 py-2.5 text-sm font-black text-[#050A14] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-white"
                  >
                    {grantingTester ? "GRANTING..." : "GRANT ACCESS"}
                  </button>
                </form>
                {testerStatus ? <p className="mt-3 text-sm text-white/80" role="status" aria-live="polite">{testerStatus}</p> : null}
              </section>
            ) : null}
          </>
        ) : (
          <div className="mt-8">
            {authenticated ? (
              <div className="rounded-xl border border-amber-400/30 bg-amber-950/25 px-4 py-3 text-sm leading-6 text-amber-100">
                Signed in as <strong>{initialEmail}</strong>, but this email does not have active Report Kit access yet. If Mandy&apos;s access was granted to a different email, sign out and use that exact email.
              </div>
            ) : (
              <div className="rounded-xl border border-sky-400/30 bg-sky-950/25 px-4 py-3 text-sm leading-6 text-sky-100">
                Already have access? <Link href="/login?next=%2Ftools%2Ffraud-kit" className="font-black underline underline-offset-4">Sign in with the exact email that was granted access.</Link> Magic-link or password login proves the email belongs to you.
              </div>
            )}

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-xs font-bold uppercase tracking-wider text-white/50">Free updates</div>
                <h2 className="mt-2 text-xl font-bold text-white">Join the Report Kit list</h2>
                <p className="mt-2 text-sm text-white/75">No payment. Get source and module updates as the course expands.</p>
                {waitlistDone ? <p className="mt-4 text-sm font-semibold text-emerald-300" role="status">{success}</p> : (
                  <form onSubmit={joinWaitlist} className="mt-4 space-y-3">
                    <label className="block text-xs font-bold text-white/70">Your name
                      <input type="text" value={name} onChange={event => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-[#050A14] px-3 py-2.5 text-sm text-white outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/40" />
                    </label>
                    <label className="block text-xs font-bold text-white/70">Email
                      <input type="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-[#050A14] px-3 py-2.5 text-sm text-white outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/40" />
                    </label>
                    <label className="block text-xs font-bold text-white/70">State (optional)
                      <input type="text" value={state} onChange={event => setState(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-[#050A14] px-3 py-2.5 text-sm text-white outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/40" />
                    </label>
                    <button type="submit" disabled={waitlisting} className="min-h-11 w-full rounded-xl border py-3 text-sm font-bold tracking-wider disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#C9A227]" style={{ borderColor: `${GOLD}66`, color: GOLD }}>
                      {waitlisting ? "SAVING..." : "JOIN THE WAITLIST"}
                    </button>
                  </form>
                )}
              </section>

              <section className="rounded-2xl border p-5" style={{ borderColor: `${GOLD}55` }}>
                <div className="text-xs font-bold uppercase tracking-wider text-white/50">One-time access</div>
                <h2 className="mt-2 text-xl font-bold text-white">Full private workspace</h2>
                <p className="mt-2 text-sm leading-6 text-white/75">Written lessons, source-status intake, evidence and money mapping, current official routing, autosave, text/RTF/JSON export, and print-to-PDF.</p>
                <div className="mt-4 text-3xl font-black text-white">$79</div>
                <p className="text-xs text-white/55">One-time · lifetime module updates</p>
                <button type="button" onClick={() => void startCheckout()} disabled={buying} className="mt-5 min-h-12 w-full rounded-xl py-4 text-sm font-bold tracking-wider text-[#050A14] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-white" style={{ background: GOLD }}>
                  {buying ? "REDIRECTING..." : authenticated ? "BUY REPORT KIT" : "SIGN IN TO BUY"}
                </button>
                <p className="mt-3 text-center text-xs text-white/45">Hardship access remains available through the Contact form.</p>
              </section>
            </div>
          </div>
        )}

        {error ? <p className="mt-4 rounded-lg border border-red-400/35 bg-red-950/30 p-3 text-sm text-red-200" role="alert">{error}</p> : null}
        <p className="mt-8 text-xs leading-5 text-white/50">General legal education only - not legal advice. No outcome is promised. Do not upload private family or child records to public AI systems.</p>
      </div>
    </div>
  );
}
