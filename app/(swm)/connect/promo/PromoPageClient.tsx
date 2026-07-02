"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { GOLD, NAVY, RED } from "../theme";

function browserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

type MeResponse = {
  authenticated: boolean;
  email?: string;
  first_name?: string;
};

export default function PromoPageClient() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code")?.trim().toUpperCase() || "";
  const [me, setMe] = useState<MeResponse | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [enteredCode, setEnteredCode] = useState("");
  const effectiveCode = code || enteredCode.trim().toUpperCase();

  async function refreshMe() {
    const res = await fetch("/api/connect/me", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    setMe(data ?? { authenticated: false });
  }

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      const params = new URLSearchParams(hash.slice(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const errDesc = params.get("error_description");
      const returnPath = `${window.location.pathname}${window.location.search}`;
      if (errDesc) {
        setError(errDesc.replace(/\+/g, " "));
        window.history.replaceState(null, "", returnPath);
        return;
      }
      if (accessToken && refreshToken) {
        browserSupabase()
          .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(() => {
            window.history.replaceState(null, "", returnPath);
            void refreshMe();
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
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("Sending your private login link...");
    try {
      const res = await fetch("/api/connect/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          returnTo: `${window.location.pathname}${window.location.search}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage("");
        setError(data.error || "Could not send the login link.");
      } else {
        setMessage("If that email is attached to a Stand With Meg survey, a private login link is on its way.");
      }
    } catch {
      setMessage("");
      setError("The login-link request did not finish. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function claim() {
    if (!effectiveCode) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/connect/apply-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: effectiveCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not apply promo code.");
        return;
      }
      if (data.pending) {
        setMessage(data.message || "Your promo request is pending approval.");
        return;
      }
      setMessage(data.alreadyActive ? "You already have active access." : "Your free month is active!");
      setTimeout(() => {
        window.location.href = "/connect/circles";
      }, 1200);
    } catch {
      setError("Could not apply promo code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen px-6 py-16" style={{ backgroundColor: NAVY }}>
      <div className="relative z-10 mx-auto max-w-xl rounded-[2rem] p-8 text-center" style={{ backgroundColor: "rgba(15,28,41,0.85)", border: `1px solid ${GOLD}` }}>
        <div className="relative -mt-2 mb-6 aspect-[1731/909] w-full overflow-hidden rounded-xl border border-white/10">
          <Image
            src="/swm/Thumbnail_court_circle.png"
            alt="Stand With Meg Connection Circles — join the circle"
            fill
            priority
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 576px"
          />
        </div>
        {effectiveCode ? (
          <>
            <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: RED }}>Limited-time offer</p>
            <h1 className="mt-3 text-3xl font-black text-white">You get 1 month FREE</h1>
            <p className="mt-3 text-lg text-white/80">
              because you&apos;re part of the Stand With Meg community.
            </p>
            <div className="mt-4 inline-block rounded-full px-4 py-2 text-sm font-black" style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: `1px solid ${GOLD}` }}>
              Code: {effectiveCode}
            </div>
          </>
        ) : (
          <>
            <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: RED }}>Promo access</p>
            <h1 className="mt-3 text-3xl font-black text-white">Have a promo code?</h1>
            <p className="mt-3 text-lg text-white/80">
              Enter the code you were given to claim your Connection Circles access.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={enteredCode}
                onChange={e => setEnteredCode(e.target.value)}
                placeholder="Enter code"
                className="flex-1 rounded-xl px-4 py-3 text-center uppercase text-white outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                maxLength={24}
              />
            </div>
          </>
        )}

        {message && <p className="mt-4 rounded-lg px-4 py-3 text-sm font-bold text-white" style={{ backgroundColor: "rgba(34,197,94,0.15)" }}>{message}</p>}
        {error && <p className="mt-4 rounded-lg px-4 py-3 text-sm text-red-100" style={{ backgroundColor: "rgba(185,28,28,0.25)" }}>{error}</p>}

        {me?.authenticated ? (
          <div className="mt-8">
            <p className="mb-4 text-sm text-white/70">Signed in as {me.email}</p>
            <button
              type="button"
              onClick={claim}
              disabled={loading || !effectiveCode}
              className="w-full rounded-xl px-6 py-4 text-lg font-black disabled:opacity-50"
              style={{ backgroundColor: GOLD, color: NAVY }}
            >
              {loading ? "Claiming..." : "Claim My Free Month"}
            </button>
          </div>
        ) : (
          <form onSubmit={requestLink} className="mt-8 space-y-4">
            <p className="text-sm text-white/70">Enter the email you used on the Stand With Meg survey to claim your free month.</p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full rounded-xl px-4 py-3 text-white outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl px-6 py-4 text-lg font-black disabled:opacity-50"
              style={{ backgroundColor: GOLD, color: NAVY }}
            >
              {loading ? "Sending..." : "Send My Login Link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
