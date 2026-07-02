"use client";

import { useState } from "react";
import { ConnectionCirclesCta } from "../../ConnectionCirclesCta";

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
      const data = await res.json().catch(() => ({})) as { error?: string; matched?: boolean; submission_id?: string; first_name?: string };
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
      if (!data.submission_id) {
        setError("Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      onComplete({ email: trimmed, submission_id: data.submission_id, first_name: data.first_name ?? "" });
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
        className="w-full max-w-3xl rounded-2xl p-8 md:p-10"
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
          <p className="author text-xs font-semibold text-white/70 mb-3">
            By <a href="/about" rel="author" className="underline underline-offset-2">Stand With Meg</a>
          </p>
          <p className="text-white/80 text-sm md:text-base leading-relaxed">
            This is a list of judges, GALs, attorneys, evaluators, and CPS workers named by Stand With Meg families. To protect the families in the registry, access is limited to people who have shared their own story.
          </p>
        </div>

        {!showRecovery ? (
          <div className="space-y-6">
            {/* First-time visitor: prominent survey CTA */}
            <div
              className="rounded-xl p-5"
              style={{
                backgroundColor: "rgba(201,162,39,0.10)",
                border: `1px solid ${GOLD}`,
              }}
            >
              <div
                className="text-xs font-bold uppercase tracking-widest mb-2"
                style={{ color: GOLD }}
              >
                First time here?
              </div>
              <p className="text-white text-base font-semibold leading-snug mb-2">
                Someone shared this page with you?
              </p>
              <p className="text-white/80 text-sm leading-relaxed mb-4">
                The registry is built from real family-court stories. To see it, please take the free 5-minute Stand With Meg survey first. As soon as you submit, you&apos;ll get immediate access.
              </p>
              <p className="text-white/80 text-sm leading-relaxed mb-4">
                Public actor pages are threshold-gated. Names are shown only after repeated trusted family reports meet
                the registry rules, and submitter identities are not published with actor records.
              </p>
              <a
                href="/survey"
                className="block w-full py-3 rounded-lg font-bold text-base text-center"
                style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
              >
                Take the 5-Minute Survey →
              </a>
            </div>

            <ConnectionCirclesCta placement="actors" />

            {/* Returning submitter: email lookup */}
            <div className="pt-2">
              <div className="mb-5 rounded-xl p-4"
                style={{ backgroundColor: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.14)" }}>
                <h2 className="text-sm font-black text-white">How the registry is used</h2>
                <p className="mt-2 text-xs leading-relaxed text-white/75">
                  Families use the registry to see whether the same court actor, agency, county, or role appears in
                  more than one report. Advocates use the public pattern pages to show repeated concerns without
                  exposing one parent&apos;s private case file, child details, address, or email.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-white/75">
                  Records here are family-submitted experiences and allegations unless a separate public source says
                  otherwise. Stand With Meg keeps extracted or unreviewed rows inside the admin workflow until they
                  are ready for public use.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-white/75">
                  The review process looks for consistent spelling, role, court, county, state, and separate reporter
                  signals before a name becomes part of the visible pattern pages. This helps reduce duplicate rows,
                  protects people who supplied details, and makes the search tool more useful for advocacy and media
                  review.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-white/75">
                  The registry is not a public accusation board. It is a pattern index built from submitter reports,
                  threshold rules, and review notes, with private rows kept out of public search until they have enough
                  support to be useful and fair.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-white/75">
                  If a name, role, court, or county looks wrong, families can submit corrections through the actor
                  update form so review stays tied to records instead of screenshots or social-media comments.
                </p>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-px bg-white/10" />
                <div className="text-white/50 text-xs font-semibold uppercase tracking-widest">
                  Already shared your story?
                </div>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-white/90 text-sm font-semibold mb-2">
                    Enter the email you used on your survey
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
                  style={{
                    backgroundColor: "rgba(255,255,255,0.10)",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.25)",
                  }}
                >
                  {loading ? "Checking…" : "Enter Registry"}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowRecovery(true)}
                    className="text-white/50 hover:text-white text-xs underline underline-offset-2"
                  >
                    Forgot which email you used?
                  </button>
                </div>
              </form>
            </div>
          </div>
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
