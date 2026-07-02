"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { colors, shadows } from "../../../lib/design-tokens";
import { createBrowserClient } from "@supabase/ssr";

const GOLD = colors.gold.DEFAULT;
const RED = colors.evidence.DEFAULT;
const INK = colors.ink.DEFAULT;
const PAPER = colors.paper.DEFAULT;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({ error: "Login failed." }));
      if (!res.ok) {
        setError(data.error || "Could not sign in.");
      } else {
        const urlParams = new URLSearchParams(window.location.search);
const rawNext = urlParams.get("next") || "/report";
const safeNext = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/report";
window.location.href = safeNext;
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!email) {
      setError("Enter your email address.");
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      setError("Magic-link login is temporarily unavailable. Please use password login or contact support.");
      return;
    }

    setLoading(true);
    try {
      const supabaseBrowser = createBrowserClient(supabaseUrl, supabaseAnonKey);
      const { error: otpError } = await supabaseBrowser.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/connect/auth/callback`,
        },
      });
      if (otpError) {
        setError(otpError.message || "Could not send magic link.");
      } else {
        setMessage("Check your email for a private login link.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: INK, color: PAPER }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          {/* Left: value prop */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: RED }}>
              Welcome back
            </p>
            <h1 className="mt-4 text-4xl md:text-5xl font-black leading-tight">
              Your story. Your dashboard. Your community.
            </h1>
            <p className="mt-4 text-base leading-relaxed" style={{ color: "rgba(244,241,234,0.65)" }}>
              Sign in to track your survey submission, explore state-by-state reports, and connect
              with other families in Connection Circles.
            </p>

            <div className="mt-8 rounded-2xl p-6" style={{ backgroundColor: "rgba(198,61,47,0.10)", border: `1px solid rgba(198,61,47,0.30)` }}>
              <p className="text-sm italic leading-relaxed" style={{ color: "rgba(244,241,234,0.85)" }}>
                &ldquo;For the first time, I didn&apos;t feel alone. The report gave my experience a number and a name.&rdquo;
              </p>
              <p className="mt-3 text-xs font-bold" style={{ color: RED }}>— A parent in Texas</p>
            </div>
          </motion.div>

          {/* Right: form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <form
              onSubmit={mode === "password" ? handlePasswordLogin : handleMagicLink}
              className="rounded-2xl p-6 md:p-8 space-y-5"
              style={{
                backgroundColor: colors.surface.DEFAULT,
                border: `1px solid ${colors.hairline.DEFAULT}`,
                boxShadow: shadows.xl,
              }}
            >
              <h2 className="text-2xl font-black text-white">Sign in</h2>
              <p className="text-sm" style={{ color: "rgba(244,241,234,0.55)" }}>
                Need an account?{" "}
                <Link href="/signup" className="font-bold hover:underline" style={{ color: RED }}>
                  Create one free
                </Link>
              </p>

              {error && (
                <div className="rounded-lg px-4 py-3 text-sm font-medium" style={{ backgroundColor: "rgba(185,28,28,0.2)", border: "1px solid rgba(185,28,28,0.5)", color: "#fca5a5" }}>
                  {error}
                </div>
              )}
              {message && (
                <div className="rounded-lg px-4 py-3 text-sm font-medium" style={{ backgroundColor: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", color: "#86efac" }}>
                  {message}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(244,241,234,0.8)" }}>
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-all"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                  placeholder="you@example.com"
                />
              </div>

              {mode === "password" && (
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(244,241,234,0.8)" }}>
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-all"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                    placeholder="••••••••"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl py-3.5 font-black text-sm tracking-wide transition-opacity disabled:opacity-50"
                style={{ backgroundColor: RED, color: "white" }}
              >
                {loading
                  ? mode === "password" ? "Signing in..." : "Sending link..."
                  : mode === "password" ? "Sign in with password" : "Send magic link"}
              </button>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "password" ? "magic" : "password");
                    setError("");
                    setMessage("");
                  }}
                  className="text-xs font-bold hover:underline"
                  style={{ color: GOLD }}
                >
                  {mode === "password" ? "Use magic link instead" : "Use password instead"}
                </button>
                <Link href="/contact" className="text-xs hover:underline" style={{ color: "rgba(244,241,234,0.5)" }}>
                  Need help?
                </Link>
              </div>

              <p className="text-center text-xs" style={{ color: "rgba(244,241,234,0.4)" }}>
                By signing in, you agree to our{" "}
                <Link href="/terms" target="_blank" className="underline" style={{ color: GOLD }}>Terms</Link>
                {" "}and{" "}
                <Link href="/privacy" target="_blank" className="underline" style={{ color: GOLD }}>Privacy Policy</Link>.
              </p>
            </form>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
