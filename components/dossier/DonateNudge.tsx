"use client";

import { useState } from "react";
import LINES from "@/fixtures/donate-lines.json";

/**
 * Rotating donate interstitial — dark-funny, never guilt-trippy.
 * `seed` keeps SSR deterministic (each placement starts on a different line);
 * the refresh control cycles through the rest.
 */
export function DonateNudge({ seed = 0, compact = false, withEmail = false }: { seed?: number; compact?: boolean; withEmail?: boolean }) {
  const [i, setI] = useState(seed % LINES.length);
  const [joined, setJoined] = useState(false);

  return (
    <aside className="donate-nudge" aria-label="Support Stand With Meg">
      <div className="flex-1 min-w-60">
        <p className={`serif-note ${compact ? "text-base" : "text-lg"}`} style={{ color: "var(--ink)" }}>
          {LINES[i]}
        </p>
        <button
          className="disclaimer-strip mt-2 bg-transparent border-0 cursor-pointer p-0"
          style={{ color: "var(--ink-30)" }}
          onClick={() => setI((i + 1) % LINES.length)}
          aria-label="Show another line"
        >
          ↻ another one
        </button>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {withEmail && !joined && (
          <>
            <input
              type="email"
              aria-label="Your email address"
              placeholder="Your email address"
              className="px-4 py-2.5 bg-transparent text-sm min-w-52"
              style={{ border: "1px solid var(--hairline)", color: "var(--ink)" }}
            />
            <button className="action-pill" style={{ padding: "0.65rem 1.4rem", fontSize: "0.85rem" }} onClick={() => setJoined(true)}>
              I&rsquo;m in
            </button>
          </>
        )}
        {withEmail && joined && <span className="badge badge--ok" style={{ padding: "0.6rem 1rem" }}>You&rsquo;re in ✓ (mock)</span>}
        {!withEmail && (
          <>
            <a href="https://standwithmeg.com/donate" className="action-pill" style={compact ? { padding: "0.65rem 1.3rem", fontSize: "0.85rem" } : {}}>
              Donate
            </a>
            <a href="https://standwithmeg.com/donate" className="btn-quiet">Give monthly</a>
          </>
        )}
      </div>
    </aside>
  );
}
