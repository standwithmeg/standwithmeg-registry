"use client";

import { useState } from "react";

// Brand colors — not in Tailwind defaults
const GOLD  = "#C9A227";
const LOGIN_TIMEOUT_MS = 17_000;

export default function SwmLogin() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { setError("Email and password are required."); return; }
    setLoading(true);
    setError("");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({ error: "Login failed." }));
      if (!res.ok) {
        setError(data.error || "Login failed.");
      } else {
        // Validate ?next= is same-origin to prevent open-redirect attacks.
        // Allowed: "/admin", "/admin/queue"  |  Blocked: "//evil.com", "https://evil.com", "/\\evil.com"
        const params = new URLSearchParams(window.location.search);
        const rawNext = params.get("next");
        const safeNext = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
          ? rawNext
          : null;
        window.location.href = safeNext || data.redirectTo || "/admin";
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Admin authentication is temporarily unavailable because Supabase Auth is not responding.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Meg portrait — full viewport background */}
      <div
        className="fixed inset-0"
        style={{
          backgroundImage: "url('/swm/meg-portrait.png')",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          zIndex: 0,
        }}
      />
      {/* Deep navy overlay — keeps image cinematic, text readable */}
      <div
        className="fixed inset-0"
        style={{ backgroundColor: "rgba(15,30,50,0.82)", zIndex: 1 }}
      />

      {/* Gold top accent bar */}
      <div className="relative z-20 h-1 w-full" style={{ backgroundColor: GOLD }} />

      {/* Header */}
      <header className="relative z-20 px-6 py-5 border-b" style={{ borderColor: "rgba(201,162,39,0.25)" }}>
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-700 rounded flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <div className="text-white font-black text-base tracking-wide leading-none">STAND WITH MEG</div>
              <div className="text-xs font-semibold uppercase tracking-widest mt-0.5" style={{ color: GOLD }}>
                Admin Portal
              </div>
            </div>
          </div>
          <a href="/survey" className="text-xs transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
          >
            ← Public submission form
          </a>
        </div>
      </header>

      {/* Main */}
      <div className="relative z-20 flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">

          {/* Brand block */}
          <div className="text-center mb-10">
            <p className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: GOLD }}>
              Courage to Stand. Power to Change.
            </p>
            <h1 className="text-4xl font-black text-white leading-tight mb-3">
              Admin Access
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(245,245,245,0.55)" }}>
              Authorized administrators only. This portal grants access to the<br />
              Stand With Meg national survey data and advocacy dashboard.
            </p>
          </div>

          {/* Gold divider */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1 h-px" style={{ backgroundColor: "rgba(201,162,39,0.3)" }} />
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GOLD }} />
            <div className="flex-1 h-px" style={{ backgroundColor: "rgba(201,162,39,0.3)" }} />
          </div>

          {/* Form card */}
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl p-8 space-y-5"
            style={{
              backgroundColor: "rgba(255,255,255,0.05)",
              border: `1px solid rgba(201,162,39,0.3)`,
              backdropFilter: "blur(4px)",
            }}
          >
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(245,245,245,0.8)" }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-all"
                style={{
                  backgroundColor: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
                onFocus={e => (e.currentTarget.style.border = `1px solid ${GOLD}`)}
                onBlur={e => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.15)")}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(245,245,245,0.8)" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-all"
                style={{
                  backgroundColor: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
                onFocus={e => (e.currentTarget.style.border = `1px solid ${GOLD}`)}
                onBlur={e => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.15)")}
              />
            </div>

            {error && (
              <div className="rounded-lg px-4 py-3 text-sm font-medium text-red-300"
                style={{ backgroundColor: "rgba(185,28,28,0.25)", border: "1px solid rgba(185,28,28,0.5)" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-700 hover:bg-red-600 text-white py-3.5 rounded-lg font-bold text-sm tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Access Dashboard →"}
            </button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: "rgba(245,245,245,0.3)" }}>
            Unauthorized access attempts are logged.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-20 text-center px-6 py-5 text-xs border-t"
        style={{ color: "rgba(245,245,245,0.3)", borderColor: "rgba(255,255,255,0.08)" }}>
        Stand With Meg &nbsp;·&nbsp; Courage to Stand, Power to Change &nbsp;·&nbsp; standwithmeg.com
      </footer>
    </div>
  );
}
