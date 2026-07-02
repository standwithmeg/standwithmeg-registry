"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import InstallBanner from "@/components/InstallBanner";
import { GOLD, NAVY, RED } from "./theme";

// Browser-only Supabase client. Imported directly from @supabase/ssr (not from
// lib/supabase.ts, which also pulls in next/headers and would break this client
// component's build).
function browserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}


type AccessRow = {
  id: string;
  access_type: string;
  status: string;
  granted_at: string;
  expires_at: string | null;
};

type MeResponse = {
  authenticated: boolean;
  email?: string;
  first_name?: string;
  submitter?: boolean;
  access?: AccessRow[];
  has_full_access?: boolean;
  can_manage_billing?: boolean;
  hardship_request?: {
    id: string;
    status: string;
    requested_at: string;
  } | null;
  stripe_ready?: boolean;
};

type SponsorLink = {
  token: string;
  url: string;
  requester_note: string | null;
  status: string;
  expires_at: string;
};

type ReportActorContext = {
  name: string;
  role: string | null;
  state: string | null;
};

function accessLabel(row: AccessRow): string {
  const labels: Record<string, string> = {
    supporter_monthly: "Circle Supporter monthly",
    supporter_annual: "Circle Supporter annual",
    hardship: "Sponsored hardship access",
    sponsored_month: "Sponsored month",
    sponsored_year: "Sponsored year",
    sponsor_pool: "Sponsor pool access",
  };
  return labels[row.access_type] ?? row.access_type;
}

export default function ConnectPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [hardshipNote, setHardshipNote] = useState("");
  const [sponsorLink, setSponsorLink] = useState<SponsorLink | null>(null);
  const [hardshipSponsorNote, setHardshipSponsorNote] = useState("");
  const [hardshipSponsorLink, setHardshipSponsorLink] = useState<SponsorLink | null>(null);
  const [reportActor, setReportActor] = useState<ReportActorContext | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refToken, setRefToken] = useState<string | null>(null);
  const [copiedSponsor, setCopiedSponsor] = useState(false);
  const [copiedHardship, setCopiedHardship] = useState(false);

  const [checkingSession, setCheckingSession] = useState(true);

  async function refreshMe() {
    try {
      const res = await fetch("/api/connect/me", { cache: "no-store" });
      const data = await res.json().catch(() => ({ authenticated: false }));
      setMe(data);
    } catch {
      setMe({ authenticated: false });
    } finally {
      setCheckingSession(false);
    }
  }

  // Server-initiated magic links return the session in the URL hash
  // (#access_token=...&refresh_token=...), not as a ?code= query param. Consume
  // it client-side: write the session to cookies (so the server /me route sees
  // it), strip the hash, then load the signed-in state. Also surfaces an expired
  // or already-used link instead of silently bouncing back to the login form.
  useEffect(() => {
    const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const actorName = query?.get("actor")?.trim() ?? "";
    if (actorName) {
      setReportActor({
        name: actorName,
        role: query?.get("role")?.trim() || null,
        state: query?.get("state")?.trim() || null,
      });
    }
    const ref = query?.get("ref_token")?.trim() ?? null;
    if (ref) setRefToken(ref);

    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash && hash.length > 1) {
      const params = new URLSearchParams(hash.slice(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const errDesc = params.get("error_description");
      const returnPath = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/connect";
      if (errDesc) {
        setError(errDesc.replace(/\+/g, " "));
        window.history.replaceState(null, "", returnPath);
        const supabase = browserSupabase();
        supabase.auth.signOut()
          .catch(() => undefined)
          .finally(() => {
            void fetch("/api/connect/sign-out", { method: "POST" })
              .catch(() => undefined)
              .finally(() => {
                setMe({ authenticated: false });
                setCheckingSession(false);
              });
          });
        return;
      }
      if (accessToken && refreshToken) {
        const supabase = browserSupabase();
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(() => {
            window.history.replaceState(null, "", returnPath);
            // Hard navigation after writing cookies ensures the server-side
            // /api/connect/me (and any future server reads) reliably see the
            // session. Without it the immediate fetch can race the cookie write.
            window.location.replace(returnPath);
          })
          .catch(() => {
            setError("That login link could not be completed. Please request a new one.");
            window.history.replaceState(null, "", returnPath);
            void refreshMe();
          });
        return;
      }
    }
    void refreshMe();
  }, []);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Enter a valid email address, like name@example.com.");
      setMessage("");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("Checking that email and sending the private login link...");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/connect/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          returnTo: `${window.location.pathname}${window.location.search}`,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage("");
        setError(data.error || "Could not send the login link.");
      } else {
        setMessage("If that exact email is attached to a Stand With Meg survey, a private login link is on its way. If nothing arrives, take the survey first or try the email you used on the survey.");
      }
    } catch (err) {
      setMessage("");
      if (err instanceof Error && err.name === "AbortError") {
        setError("The login-link request timed out. Check your connection and try again.");
      } else {
        setError("The login-link request did not finish. Check your connection and try again.");
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  async function startCheckout(kind: string, extra: Record<string, unknown> = {}) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const payload: Record<string, unknown> = { kind, ...extra };
      if (refToken) payload.ref_token = refToken;
      const res = await fetch("/api/connect/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Checkout is not configured yet.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  async function requestHardshipAccess() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/connect/hardship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: hardshipNote }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not submit hardship request.");
        return;
      }
      setMessage(data.already_has_access
        ? "You already have active Circle access."
        : "Your request has been submitted. We'll review it as soon as sponsor funds are available.");
      await refreshMe();
    } finally {
      setLoading(false);
    }
  }

  async function createHardshipSponsorLink() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/connect/sponsor-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: hardshipSponsorNote }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create a sponsor link.");
        return;
      }
      setHardshipSponsorLink(data.link);
      setCopiedHardship(false);
      setMessage("Private sponsor link created. If someone pays through it, your Circle access is extended automatically.");
    } finally {
      setLoading(false);
    }
  }

  async function createSponsorLink() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/connect/sponsor-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create sponsor link.");
        return;
      }
      setSponsorLink(data.link);
      setCopiedSponsor(false);
      setMessage("Private sponsor link created. If that person pays through this link, Circle access is added to your survey email automatically.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await fetch("/api/connect/sign-out", { method: "POST" });
    try {
      const s = browserSupabase();
      await s.auth.signOut();
    } catch {}
    setMe({ authenticated: false });
    setCheckingSession(false);
  }

  function fallbackCopy(text: string): boolean {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fall through to fallback
      }
    }
    return fallbackCopy(text);
  }

  function openMailto(url: string) {
    if (typeof window !== "undefined") {
      window.location.href = url;
    }
  }

  function requireSurveyLogin(planLabel: string) {
    setError("");
    setMessage(`To pay for ${planLabel}, log in first with the exact email you used on the Stand With Meg survey. After the magic link opens, choose the plan again and Stripe will finish checkout.`);
    window.setTimeout(() => {
      document.getElementById("connect-email")?.focus();
      document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  const isAuthed = Boolean(me?.authenticated);
  const isVerifiedSubmitter = Boolean(me?.submitter);
  const access = me?.access ?? [];

  return (
    <main className="min-h-screen" style={{ backgroundColor: NAVY, color: "white" }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="kicker text-xs" style={{ color: RED }}>Stand With Meg — est. 2024</p>
            <h1 className="mt-2 text-4xl md:text-6xl">Connection <em>Circles</em></h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#f4f1ea]/70 md:text-base">
              Private rooms for verified Stand With Meg survey submitters who reported the same court actor.
              Join with your survey email, choose access, and stay anonymous unless both sides agree to an email introduction.
            </p>
            <p className="author mt-3 text-xs font-semibold text-[#f4f1ea]/70">
              By <Link href="/about" rel="author" className="underline underline-offset-2">Stand With Meg</Link>
            </p>
          </div>
          {isAuthed && (
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg px-4 py-2 text-sm font-bold text-[#f4f1ea]/70 hover:text-[#f4f1ea]"
              style={{ border: "1px solid rgba(244,241,234,0.16)" }}
            >
              Sign out
            </button>
          )}
        </div>

        {message && <div className="mt-6 rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{message}</div>}
        {error && <div className="mt-6 rounded-lg border border-red-400/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">{error}</div>}

        {checkingSession && me === null ? (
          <div className="mt-10 rounded-2xl p-8 text-center" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(244,241,234,0.14)" }}>
            <p className="text-[#f4f1ea]/70">Checking your Connection Circles access...</p>
          </div>
        ) : !isAuthed ? (
          <div className="mt-10 space-y-6">
            <div id="how-it-works" className="scroll-mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
              <form noValidate onSubmit={requestLink} className="rounded-2xl p-6 md:p-7" style={{ backgroundColor: "rgba(244,241,234,0.055)", border: "1px solid rgba(212,168,64,0.30)", boxShadow: "0 24px 70px rgba(0,0,0,0.22)" }}>
                {reportActor && (
                  <div className="mb-5 rounded-xl p-4" style={{ backgroundColor: "rgba(212,168,64,0.10)", border: "1px solid rgba(212,168,64,0.28)" }}>
                    <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: GOLD }}>
                      Join this connection circle
                    </div>
                    <div className="mt-1 text-base font-black text-[#f4f1ea]">
                      {reportActor.name}
                    </div>
                    <div className="mt-1 text-xs text-[#f4f1ea]/55">
                      {[reportActor.role, reportActor.state].filter(Boolean).join(" · ")}
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-[#f4f1ea]/70">
                      Use the same email you used on the Stand With Meg survey. If you have not taken the survey with this email yet, the login email will not be sent.
                    </p>
                  </div>
                )}
                <p className="kicker text-[10px]" style={{ color: RED }}>Start here</p>
                <h2 className="mt-2 text-2xl font-black">
                  Sign up or log in with your survey email
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#f4f1ea]/66">
                  Enter the exact email you used on the Stand With Meg survey. We&apos;ll send a private magic link. After you open it, you can pay, request sponsored access, or go straight into your circle if access is already active.
                </p>
                <label className="mt-5 block text-sm font-bold text-[#f4f1ea]/80" htmlFor="connect-email">Survey email</label>
                <input
                  id="connect-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="mt-2 w-full rounded-lg px-4 py-3 text-[#f4f1ea] outline-none focus:ring-1 focus:ring-amber-300/50"
                  style={{ backgroundColor: "rgba(244,241,234,0.07)", border: "1px solid rgba(244,241,234,0.18)" }}
                  placeholder="you@example.com"
                  required
                />
                <button type="submit" disabled={loading} className="mt-4 w-full rounded-lg px-5 py-3 font-black disabled:opacity-60" style={{ backgroundColor: RED, color: "white" }}>
                  {loading ? "Sending..." : "Send private login link"}
                </button>
                <div className="mt-4 rounded-xl p-4" style={{ backgroundColor: "rgba(185,28,28,0.10)", border: "1px solid rgba(185,28,28,0.32)" }}>
                  <p className="text-sm font-black text-[#f4f1ea]">New here?</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#f4f1ea]/62">
                    Connection Circles are for verified survey submitters. Take the free survey first, then come back and use the same email here.
                  </p>
                  <Link href="/survey" className="mt-3 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-black text-white" style={{ backgroundColor: RED }}>
                    Take the survey first →
                  </Link>
                </div>
              </form>

              <div className="space-y-4">
                <div className="rounded-2xl p-6 md:p-7" style={{ background: "linear-gradient(135deg, rgba(212,168,64,0.16), rgba(244,241,234,0.055))", border: "1px solid rgba(212,168,64,0.36)", boxShadow: "0 24px 70px rgba(0,0,0,0.22)" }}>
                  <p className="kicker text-[10px]" style={{ color: RED }}>Pricing</p>
                  <h2 className="mt-2 text-2xl font-black">Choose your access</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[#f4f1ea]/66">
                    Parents can pay for their own Circle access after logging in. If they can&apos;t pay, they can request sponsored access or ask someone close to sponsor their seat.
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => requireSurveyLogin("$6 monthly parent access")} className="rounded-xl p-4 text-left transition hover:bg-white/10" style={{ backgroundColor: "rgba(198,61,47,0.16)", border: "1px solid rgba(198,61,47,0.46)" }}>
                      <span className="block text-[11px] font-black uppercase tracking-widest" style={{ color: RED }}>Parent access</span>
                      <span className="mt-2 block text-3xl font-black text-white">$6</span>
                      <span className="block text-sm text-[#f4f1ea]/62">per month</span>
                      <span className="mt-3 block rounded-lg px-3 py-2 text-center text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>Log in, then pay</span>
                    </button>
                    <button type="button" onClick={() => requireSurveyLogin("$50 annual parent access")} className="rounded-xl p-4 text-left transition hover:bg-white/10" style={{ backgroundColor: "rgba(212,168,64,0.16)", border: "1px solid rgba(212,168,64,0.46)" }}>
                      <span className="block text-[11px] font-black uppercase tracking-widest" style={{ color: GOLD }}>Best value</span>
                      <span className="mt-2 block text-3xl font-black text-white">$50</span>
                      <span className="block text-sm text-[#f4f1ea]/62">per year</span>
                      <span className="mt-3 block rounded-lg px-3 py-2 text-center text-sm font-black" style={{ backgroundColor: GOLD, color: NAVY }}>Log in, then pay</span>
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl p-5" style={{ backgroundColor: "rgba(198,61,47,0.13)", border: "1px solid rgba(198,61,47,0.35)" }}>
                    <h3 className="text-lg font-black">Need help paying?</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#f4f1ea]/68">
                      Log in with your survey email, then choose sponsored access. Stand With Meg admits parents as sponsor funds are available.
                    </p>
                    <button type="button" onClick={() => requireSurveyLogin("sponsored access")} className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-black text-white" style={{ backgroundColor: RED }}>
                      Log in to request sponsored access
                    </button>
                  </div>
                  <div className="rounded-2xl p-5" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(244,241,234,0.14)" }}>
                    <h3 className="text-lg font-black">Sponsor another parent</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#f4f1ea]/62">
                      Sponsors do not see who receives access, what they reported, or any case details.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => startCheckout("sponsor_pool_month")} className="rounded-lg px-3 py-2.5 text-sm font-black" style={{ backgroundColor: "white", color: NAVY }}>$6/mo</button>
                      <button type="button" onClick={() => startCheckout("sponsor_pool_year")} className="rounded-lg px-3 py-2.5 text-sm font-black" style={{ backgroundColor: GOLD, color: NAVY }}>$50/yr</button>
                    </div>
                    <Link href="/connect/sponsor" className="mt-2 block rounded-lg px-3 py-2.5 text-center text-sm font-bold text-[#f4f1ea]/82 hover:text-[#f4f1ea]" style={{ border: "1px solid rgba(244,241,234,0.18)" }}>
                      Custom sponsor amount
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div id="circle-explainer" className="scroll-mt-8 rounded-2xl p-6" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(198,61,47,0.22)" }}>
              <h2 className="text-xl font-black">How Connection Circles work</h2>
              <div className="mt-4 grid gap-3 text-sm leading-relaxed text-[#f4f1ea]/75 md:grid-cols-2">
                <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: RED }}>1. Take the survey</div>
                  <p className="mt-2">Circles are only for verified survey submitters. Use the same email you used on the Stand With Meg survey.</p>
                </div>
                <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: RED }}>2. Choose access</div>
                  <p className="mt-2">Access is $6/month or $50/year. If you can&apos;t pay, use sponsored access. Another person can sponsor you without seeing your identity.</p>
                </div>
                <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: RED }}>3. Find shared court actors</div>
                  <p className="mt-2">You can see other anonymous parents who reported the same public court actor. There is no public member directory.</p>
                </div>
                <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: RED }}>4. Double opt-in only</div>
                  <p className="mt-2">Names and emails are only shared after both parents agree. If either person declines or ignores the request, identity stays private.</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[#f4f1ea]/65">
                This is for peer support, organizing, and pattern documentation. It is not legal advice, case strategy, emergency help, or a way to contact the opposing party in your case.
              </p>
            </div>
          </div>
        ) : !isVerifiedSubmitter ? (
          <div className="mt-10 space-y-6">
            <div className="rounded-2xl p-6 md:p-7" style={{ backgroundColor: "rgba(198,61,47,0.13)", border: "1px solid rgba(198,61,47,0.35)" }}>
              <p className="kicker text-[10px]" style={{ color: RED }}>Survey required</p>
              <h2 className="mt-2 text-2xl font-black">This email is not connected to a Stand With Meg survey.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#f4f1ea]/72">
                Signed in as {me?.email}. Connection Circles are only for verified survey submitters because rooms are matched from the court actors reported in the survey.
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(10,15,26,0.55)", border: "1px solid rgba(244,241,234,0.12)" }}>
                  <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: GOLD }}>Option 1</div>
                  <p className="mt-2 text-sm font-black">Use the survey email</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#f4f1ea]/58">Sign out, then request a login link with the exact email used on your survey.</p>
                </div>
                <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(10,15,26,0.55)", border: "1px solid rgba(244,241,234,0.12)" }}>
                  <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: GOLD }}>Option 2</div>
                  <p className="mt-2 text-sm font-black">Take the survey first</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#f4f1ea]/58">After submitting, come back here and use that same email for Circle access.</p>
                </div>
                <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(10,15,26,0.55)", border: "1px solid rgba(244,241,234,0.12)" }}>
                  <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: GOLD }}>What is blocked</div>
                  <p className="mt-2 text-sm font-black">Pricing and sponsor paths</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#f4f1ea]/58">Payment cannot open Circle access until the email is tied to a survey submission.</p>
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={signOut} className="rounded-lg px-5 py-3 text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>
                  Sign out and use my survey email
                </button>
                <Link href="/survey" className="rounded-lg px-5 py-3 text-center text-sm font-black text-white" style={{ backgroundColor: RED }}>
                  Take the survey first
                </Link>
              </div>
            </div>
            <div className="rounded-2xl p-6" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(212,168,64,0.22)" }}>
              <h2 className="text-xl font-black">Why this matters</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#f4f1ea]/66">
                Connection Circles are matched from survey records. Without a survey tied to this email, the system has no verified court actors to match and no safe way to place the account in a private room.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-10 space-y-8">
            <div className="rounded-2xl p-6" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(212,168,64,0.22)" }}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-black">Choose what works today</h2>
                  <p className="mt-1 text-sm text-[#f4f1ea]/60">
                    Signed in as {me?.email}. {me?.has_full_access ? "You have full Circle access." : "Pick a supporter path, create a private sponsor link, or join the sponsored-access waitlist."}
                  </p>
                </div>
                {access.length > 0 && (
                  <div className="rounded-lg px-3 py-2 text-xs font-bold" style={{ backgroundColor: "rgba(198,61,47,0.15)", color: RED }}>
                    {accessLabel(access[0])}{access[0].expires_at ? ` through ${new Date(access[0].expires_at).toLocaleDateString()}` : ""}
                  </div>
                )}
              </div>
            </div>

            {me?.has_full_access && (
              <div className="rounded-2xl p-6" style={{ backgroundColor: "rgba(198,61,47,0.10)", border: "1px solid rgba(198,61,47,0.35)" }}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-black">Open your circle</h2>
                    <p className="mt-1 text-sm text-[#f4f1ea]/70">See the parents who reported the same court actors as you and send a private connection request.</p>
                  </div>
                  <div className="flex gap-3">
                    <Link href="/connect/circles" className="rounded-lg px-5 py-3 text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>
                      Go to my circle
                    </Link>
                    <Link href="/connect/requests" className="rounded-lg px-4 py-3 text-sm font-bold text-[#f4f1ea]/85" style={{ border: "1px solid rgba(244,241,234,0.2)" }}>
                      Requests
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {me?.can_manage_billing && (
              <div className="rounded-2xl p-6" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(244,241,234,0.12)" }}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-black">Manage access</h2>
                    <p className="mt-1 text-sm text-[#f4f1ea]/70">Update your handle, leave chat rooms, or cancel your Stripe subscription.</p>
                  </div>
                  <Link href="/connect/account" className="rounded-lg px-5 py-3 text-sm font-black" style={{ backgroundColor: "white", color: NAVY }}>
                    Manage access
                  </Link>
                </div>
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-3">
              <div className="rounded-2xl p-6" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(244,241,234,0.12)" }}>
                <h3 className="text-lg font-black">Pay for myself</h3>
                <p className="mt-2 text-sm text-[#f4f1ea]/60">Circle Supporter access funds moderation, emails, hosting, and parent access.</p>
                <div className="mt-5 space-y-3">
                  <button onClick={() => startCheckout("supporter_monthly")} className="w-full rounded-lg px-4 py-3 font-black" style={{ backgroundColor: RED, color: "white" }}>$6 / month</button>
                  <button onClick={() => startCheckout("supporter_annual")} className="w-full rounded-lg px-4 py-3 font-black" style={{ backgroundColor: GOLD, color: NAVY }}>$50 / year</button>
                </div>
              </div>

              <div className="rounded-2xl p-6" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(244,241,234,0.12)" }}>
                <h3 className="text-lg font-black">Ask someone to sponsor me</h3>
                <p className="mt-2 text-sm text-[#f4f1ea]/60">Create a private link for a friend or family member. If they pay through it, your survey email gets Circle access automatically.</p>
                <p className="mt-2 text-xs leading-relaxed text-[#f4f1ea]/50">Sponsors do not see your court actor, case details, email, or story.</p>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  maxLength={600}
                  className="mt-4 min-h-24 w-full rounded-lg px-3 py-2 text-sm text-[#f4f1ea] outline-none"
                  style={{ backgroundColor: "rgba(244,241,234,0.07)", border: "1px solid rgba(244,241,234,0.18)" }}
                  placeholder="Optional note for the person you ask. Keep it general."
                />
                <button onClick={createSponsorLink} disabled={loading} className="mt-3 w-full rounded-lg px-4 py-3 font-black disabled:opacity-60" style={{ backgroundColor: GOLD, color: NAVY }}>
                  Create private sponsor link
                </button>
                {sponsorLink && (
                  <div className="mt-4 rounded-lg bg-black/25 p-3 text-xs text-[#f4f1ea]/75">
                    <div className="mb-2 break-all">{sponsorLink.url}</div>
                    <p className="mb-2 text-[11px] leading-relaxed text-[#f4f1ea]/60">
                      This link is tied to your survey email. If someone pays through it, your access is added automatically.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyToClipboard(sponsorLink.url);
                        setCopiedSponsor(ok);
                        window.setTimeout(() => setCopiedSponsor(false), 2000);
                      }}
                      className="rounded-md px-3 py-2 font-bold"
                      style={{ backgroundColor: "rgba(244,241,234,0.1)" }}
                    >
                      {copiedSponsor ? "Copied!" : "Copy link"}
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl p-6" style={{ backgroundColor: "rgba(198,61,47,0.13)", border: "1px solid rgba(198,61,47,0.35)" }}>
                <h3 className="text-lg font-black">I need free access now</h3>
                <p className="mt-2 text-sm text-[#f4f1ea]/70">
                  Can&apos;t pay right now? Request free access and we&apos;ll review it as soon as sponsor funds are available. Or ask one person to sponsor your $6/month seat (or $50/year). The link lets them pay privately without seeing your identity or story.
                </p>

                {hardshipSponsorLink ? (
                  <div className="mt-4 rounded-lg bg-black/25 p-3 text-xs text-[#f4f1ea]/75">
                    <div className="mb-2 break-all">{hardshipSponsorLink.url}</div>
                    <p className="mb-2 text-[11px] leading-relaxed text-[#f4f1ea]/60">
                      This private link is tied to your survey email. If someone pays through it, your access is added automatically. It asks them to sponsor your $6/month seat (or $50/year).
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await copyToClipboard(hardshipSponsorLink.url);
                          setCopiedHardship(ok);
                          window.setTimeout(() => setCopiedHardship(false), 2000);
                        }}
                        className="rounded-md px-3 py-2 font-bold"
                        style={{ backgroundColor: "rgba(244,241,234,0.1)" }}
                      >
                        {copiedHardship ? "Copied!" : "Copy link"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openMailto(
                            `mailto:?subject=${encodeURIComponent("Can you help me join Stand With Meg Connection Circles?")}&body=${encodeURIComponent(`Hi — I’m trying to join Stand With Meg Connection Circles, a private space for parents who’ve been through the same courtroom. It costs $6/month or $50/year. Would you sponsor my seat? This link keeps my story private: ${hardshipSponsorLink.url}`)}`
                          )
                        }
                        className="rounded-md px-3 py-2 font-bold"
                        style={{ backgroundColor: "rgba(244,241,234,0.1)" }}
                      >
                        Email
                      </button>
                      {typeof navigator !== "undefined" && "share" in navigator && (
                        <button
                          type="button"
                          onClick={() =>
                            (navigator as Navigator & { share?: (opts: ShareData) => Promise<void> }).share?.({
                              title: "Sponsor my Connection Circles access",
                              text: "Would you cover my seat on Stand With Meg Connection Circles? It costs $6/month or $50/year. This link keeps my story private.",
                              url: hardshipSponsorLink.url,
                            })
                          }
                          className="rounded-md px-3 py-2 font-bold"
                          style={{ backgroundColor: "rgba(244,241,234,0.1)" }}
                        >
                          Share
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={hardshipSponsorNote}
                      onChange={e => setHardshipSponsorNote(e.target.value)}
                      maxLength={600}
                      className="mt-4 min-h-20 w-full rounded-lg px-3 py-2 text-sm text-[#f4f1ea] outline-none"
                      style={{ backgroundColor: "rgba(244,241,234,0.07)", border: "1px solid rgba(244,241,234,0.18)" }}
                      placeholder="Optional note for the person you ask. Keep it general."
                    />
                    <button onClick={createHardshipSponsorLink} disabled={loading} className="mt-3 w-full rounded-lg px-4 py-3 font-black disabled:opacity-60" style={{ backgroundColor: GOLD, color: NAVY }}>
                      Create a private sponsor link to share
                    </button>
                  </>
                )}

                <textarea
                  value={hardshipNote}
                  onChange={e => setHardshipNote(e.target.value)}
                  maxLength={600}
                  className="mt-4 min-h-16 w-full rounded-lg px-3 py-2 text-sm text-[#f4f1ea] outline-none"
                  style={{ backgroundColor: "rgba(244,241,234,0.07)", border: "1px solid rgba(244,241,234,0.18)" }}
                  placeholder="Optional note for Stand With Meg. Keep it general."
                />
                {me?.hardship_request?.status === "pending" && (
                  <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                    Your free access request is pending review. We&apos;ll email you when a sponsor seat opens up.
                  </div>
                )}
                <button onClick={requestHardshipAccess} disabled={loading || me?.has_full_access || me?.hardship_request?.status === "pending"} className="mt-3 w-full rounded-lg px-4 py-3 font-black disabled:opacity-60" style={{ backgroundColor: RED }}>
                  {me?.has_full_access
                    ? "You already have access"
                    : me?.hardship_request?.status === "pending"
                      ? "Request pending review"
                      : "Request free access"}
                </button>
                <p className="mt-3 text-xs leading-relaxed text-[#f4f1ea]/50">
                  Free access requests are reviewed when sponsor funds are available.
                </p>
              </div>
            </div>

            <div className="rounded-2xl p-6" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(244,241,234,0.12)" }}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-black">Sponsor another parent</h2>
                  <p className="mt-1 text-sm text-[#f4f1ea]/70">
                    Pool donations fund the waitlist. Sponsors do not see who receives access or what they reported.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button onClick={() => startCheckout("sponsor_pool_month")} className="rounded-lg px-5 py-3 text-sm font-black" style={{ backgroundColor: "white", color: NAVY }}>
                    $6 / month
                  </button>
                  <button onClick={() => startCheckout("sponsor_pool_year")} className="rounded-lg px-5 py-3 text-sm font-black" style={{ backgroundColor: GOLD, color: NAVY }}>
                    $50 / year
                  </button>
                  <Link href="/connect/sponsor" className="rounded-lg px-5 py-3 text-center text-sm font-bold text-[#f4f1ea]/85" style={{ border: "1px solid rgba(244,241,234,0.2)" }}>
                    Custom amount
                  </Link>
                </div>
              </div>
            </div>

            <div className="rounded-2xl p-6" style={{ backgroundColor: "rgba(212,168,64,0.08)", border: "1px solid rgba(212,168,64,0.22)" }}>
              <h2 className="text-xl font-black">Privacy rules</h2>
              <div className="mt-4 grid gap-3 text-sm text-[#f4f1ea]/70 md:grid-cols-2">
                <p>No sponsor sees your court actor, case details, survey, email, phone, or real identity.</p>
                <p>No family sees your identity unless both sides consent to connect.</p>
                <p>No member directory. No public list of who reported whom.</p>
                <p>Connection Circles are peer support and organizing, not legal advice or case strategy.</p>
              </div>
            </div>
          </div>
        )}
      </section>
      <nav className="mx-auto flex max-w-5xl flex-wrap justify-center gap-x-4 gap-y-2 px-6 pb-8 text-xs font-semibold text-[#f4f1ea]/70">
        <Link href="/report" className="hover:text-[#f4f1ea]">Report</Link>
        <Link href="/survey" className="hover:text-[#f4f1ea]">Survey</Link>
        <Link href="/actors" className="hover:text-[#f4f1ea]">Actors</Link>
        <Link href="/connect/sponsor" className="hover:text-[#f4f1ea]">Sponsor Access</Link>
        <Link href="/connect/help" className="hover:text-[#f4f1ea]">Help</Link>
        <Link href="/privacy" className="hover:text-[#f4f1ea]">Privacy</Link>
        <Link href="/contact" className="hover:text-[#f4f1ea]">Contact</Link>
      </nav>
      <InstallBanner />
    </main>
  );
}
