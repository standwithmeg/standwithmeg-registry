"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GOLD, NAVY, RED } from "../../theme";


type RequestView = {
  id: string;
  status: "pending" | "accepted" | "declined" | "withdrawn" | "expired";
  actor_name: string;
  actor_state: string | null;
  actor_role: string;
  requester_handle: string;
  requester_message: string | null;
  created_at: string;
  expires_at: string;
};

export default function RecipientRequestPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [expired, setExpired] = useState(false);
  const [req, setReq] = useState<RequestView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<null | "accepted" | "declined">(null);
  const [acceptWarning, setAcceptWarning] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/connect/requests/by-token/${token}`, { cache: "no-store" });
      const data = await res.json();
      setValid(Boolean(data?.valid));
      setExpired(Boolean(data?.expired));
      setReq(data?.request ?? null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function accept() {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/connect/requests/by-token/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attestation: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          setError(data?.error ?? "You need active Circle access before accepting. Go to Connection Circles to choose monthly, yearly, sponsored, or hardship access.");
        } else {
          setError(data?.error ?? "Could not accept.");
        }
        return;
      }
      setAcceptWarning(typeof data?.warning === "string" ? data.warning : null);
      setResult("accepted");
    } finally {
      setSubmitting(false);
    }
  }

  async function decline() {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/connect/requests/by-token/${token}/decline`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? "Could not decline."); return; }
      setResult("declined");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: NAVY, color: "white" }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="mx-auto max-w-2xl px-6 py-12">
        <p className="kicker text-xs" style={{ color: RED }}>Connection Circles</p>

        {loading && <p className="mt-6 text-[#f4f1ea]/60">Loading...</p>}

        {!loading && (!valid || !req) && (
          <div className="mt-6 rounded-2xl p-6" style={{ backgroundColor: "rgba(198,61,47,0.13)", border: "1px solid rgba(198,61,47,0.35)" }}>
            <h1 className="text-2xl font-black">{expired ? "This request expired" : "This link isn&apos;t valid"}</h1>
            <p className="mt-2 text-sm text-[#f4f1ea]/80">
              {expired
                ? "Connection requests expire after a set window. Ask the other parent to send a new request from Connection Circles."
                : "We couldn&apos;t find this connection request. It may have been withdrawn or already decided."}
            </p>
            <Link href="/connect" className="mt-5 inline-block rounded-lg px-4 py-2 text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>Go to Connection Circles</Link>
          </div>
        )}

        {!loading && valid && req && req.status === "withdrawn" && (
          <div className="mt-6 rounded-2xl p-6" style={{ backgroundColor: "rgba(148,163,184,0.12)", border: "1px solid rgba(148,163,184,0.3)" }}>
            <h1 className="text-2xl font-black">Request withdrawn</h1>
            <p className="mt-2 text-sm text-[#f4f1ea]/80">The other parent withdrew this connection request before you responded. No action is needed.</p>
            <Link href="/connect/circles" className="mt-5 inline-block rounded-lg px-4 py-2 text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>Back to your circle</Link>
          </div>
        )}

        {!loading && valid && req && req.status === "expired" && (
          <div className="mt-6 rounded-2xl p-6" style={{ backgroundColor: "rgba(198,61,47,0.13)", border: "1px solid rgba(198,61,47,0.35)" }}>
            <h1 className="text-2xl font-black">This request expired</h1>
            <p className="mt-2 text-sm text-[#f4f1ea]/80">This connection request is no longer active. If you still want to connect, ask them to send a new request.</p>
            <Link href="/connect" className="mt-5 inline-block rounded-lg px-4 py-2 text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>Go to Connection Circles</Link>
          </div>
        )}

        {!loading && valid && req && result === null && req.status === "pending" && (
          <>
            <h1 className="mt-2 text-3xl font-black md:text-4xl">Another parent wants to connect</h1>
            <p className="mt-3 text-sm text-[#f4f1ea]/70">
              {req.requester_handle} also reported <span className="font-bold text-[#f4f1ea]">{req.actor_role} {req.actor_name}</span>{req.actor_state ? ` in ${req.actor_state}` : ""} and would like to talk to you. Stand With Meg hasn&apos;t shared any of your identity, case, or story with them.
            </p>

            {req.requester_message && (
              <div className="mt-5 rounded-2xl p-4 text-sm" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(244,241,234,0.12)" }}>
                <p className="text-xs uppercase tracking-wider text-[#f4f1ea]/50">Note from {req.requester_handle}</p>
                <p className="mt-2 italic text-[#f4f1ea]/85">&ldquo;{req.requester_message}&rdquo;</p>
              </div>
            )}

            <div className="mt-6 rounded-2xl p-4 text-sm text-[#f4f1ea]/70" style={{ backgroundColor: "rgba(212,168,64,0.08)", border: "1px solid rgba(212,168,64,0.22)" }}>
              <p className="font-bold text-[#f4f1ea]">What happens if you accept</p>
              <p className="mt-2">You&apos;ll both get one introduction email exposing only your email addresses. From there it&apos;s up to you. Stand With Meg isn&apos;t in the middle.</p>
              <p className="mt-2 text-[#f4f1ea]/55">If you decline or ignore, they are not told who you are.</p>
            </div>

            <div className="mt-6 rounded-lg p-3 text-sm text-[#f4f1ea]/75" style={{ backgroundColor: "rgba(212,168,64,0.08)", border: "1px solid rgba(212,168,64,0.22)" }}>
              Only accept if this is another family who reported the same court actor. Do not use Connection Circles to contact the other party in your own case, harass anyone, or ask for private case details.
            </div>

            {error && (
              <div className="mt-3 rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-2 text-sm text-red-100">
                <p>{error}</p>
                {error.includes("Circle access") && (
                  <Link href="/connect" className="mt-2 inline-block font-bold underline underline-offset-2" style={{ color: GOLD }}>
                    Get Circle access →
                  </Link>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 md:flex-row">
              <button onClick={accept} disabled={submitting} className="rounded-lg px-5 py-3 font-black disabled:opacity-50" style={{ backgroundColor: RED, color: "white" }}>
                {submitting ? "Accepting..." : "Accept and share email"}
              </button>
              <button onClick={decline} disabled={submitting} className="rounded-lg px-5 py-3 font-bold text-[#f4f1ea]/80 hover:text-[#f4f1ea] disabled:opacity-50" style={{ border: "1px solid rgba(244,241,234,0.2)" }}>
                Decline
              </button>
            </div>
            <p className="mt-3 text-[11px] text-[#f4f1ea]/40">By accepting, you agree to the safety rule above. <span style={{ color: RED }}>Misuse may end your Circle access.</span></p>
          </>
        )}

        {!loading && valid && req && (result === "accepted" || req.status === "accepted") && (
          <div className="mt-6 rounded-2xl p-6" style={{ backgroundColor: "rgba(34,197,94,0.13)", border: "1px solid rgba(34,197,94,0.35)" }}>
            <h1 className="text-2xl font-black">You&apos;re connected</h1>
            <p className="mt-2 text-sm text-[#f4f1ea]/80">
              {acceptWarning ?? "We've sent an introduction email to both of you. From here, the conversation is between the two of you."}
            </p>
            <Link href="/connect/requests" className="mt-5 inline-block rounded-lg px-4 py-2 text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>View all requests</Link>
          </div>
        )}

        {!loading && valid && req && (result === "declined" || req.status === "declined") && (
          <div className="mt-6 rounded-2xl p-6" style={{ backgroundColor: "rgba(148,163,184,0.12)", border: "1px solid rgba(148,163,184,0.3)" }}>
            <h1 className="text-2xl font-black">Declined</h1>
            <p className="mt-2 text-sm text-[#f4f1ea]/80">No problem. They won&apos;t be told who you are.</p>
            <Link href="/connect/circles" className="mt-5 inline-block rounded-lg px-4 py-2 text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>Back to your circle</Link>
          </div>
        )}
      </section>
    </main>
  );
}
