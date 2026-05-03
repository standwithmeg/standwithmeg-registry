"use client";

import { useState } from "react";

const GOLD = "#C9A227";
const NAVY = "#0F1E30";
const NAVY_DEEP = "#091625";

type Props = {
  onComplete: (data: { email: string; submission_id: string; first_name: string }) => void;
};

export function SubmitterGate({ onComplete }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/actors/verify-submitter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      if (!data.matched) {
        setError("");
        setLoading(false);
        // Show "no submission found" branch
        setShowRecovery(true);
        return;
      }
      onComplete({ email: trimmed, submission_id: data.submission_id, first_name: data.first_name });
    } catch (err) {
      console.error("Gate error:", err);
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-16"
      style={{ background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)` }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-8 md:p-10"
        style={{
          backgroundColor: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(201,162,39,0.22)",
        }}
      >
        <div className="text-center mb-6">
          <div
            className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest mb-4"
            style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
          >
            REGISTRY ACCESS
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white mb-3">
            Welcome to the Court Actor Registry
          </h1>
          <p className="text-white/80 text-sm md:text-base leading-relaxed">
            This page lists every court actor named by Stand With Meg families. To browse it, please confirm the email you used on your registry submission.
          </p>
        </div>

        {!showRecovery ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-white/90 text-sm font-semibold mb-2">
                Your registry submission email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-lg text-base"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "white",
                }}
                disabled={loading}
                required
              />
            </div>

            {error && (
              <div
                className="text-sm px-4 py-3 rounded-lg"
                style={{ backgroundColor: "rgba(185,28,28,0.18)", color: "#FCA5A5", border: "1px solid rgba(185,28,28,0.5)" }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-bold text-base transition-opacity disabled:opacity-50"
              style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
            >
              {loading ? "Checking…" : "Enter Registry"}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setShowRecovery(true)}
                className="text-white/60 hover:text-white text-xs underline underline-offset-2"
              >
                Haven&apos;t shared your story yet, or forgot which email you used?
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 text-white/90">
            <div
              className="px-4 py-4 rounded-lg text-sm"
              style={{ backgroundColor: "rgba(201,162,39,0.10)", border: "1px solid rgba(201,162,39,0.32)" }}
            >
              <p className="font-semibold text-white mb-2">No submission found with that email yet.</p>
              <p className="leading-relaxed">
                The Court Actor Registry is built from family stories — to access it, please share yours first. The survey takes about 5 minutes, and submitting it grants you immediate registry access.
              </p>
            </div>

            <a
              href="/survey"
              className="block w-full py-3 rounded-lg font-bold text-base text-center"
              style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
            >
              Take the 5-Minute Survey
            </a>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setShowRecovery(false); setError(null); }}
                className="text-white/60 hover:text-white text-xs underline underline-offset-2"
              >
                Try a different email instead
              </button>
            </div>

            <div className="text-white/60 text-xs leading-relaxed pt-2">
              <p className="mb-1">
                <span className="font-semibold text-white/80">Forgot which email you used?</span> Try the most likely one — we&apos;ll let you know if it doesn&apos;t match. If you&apos;re stuck, email{" "}
                <a href="mailto:founder@standwithmeg.com" className="underline" style={{ color: GOLD }}>
                  founder@standwithmeg.com
                </a>{" "}
                and we&apos;ll help you find your submission.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
