"use client";

import { useCallback, useState } from "react";
import type { FraudDoor, FraudVerificationStatus } from "@/lib/complaint-routing/fraudDoorConfig";
import { whichDoorTree } from "@/lib/complaint-routing/fraudDoorConfig";

const GOLD = "#C9A227";
const NAVY = "#0F1E30";

function statusLabel(status: FraudVerificationStatus) {
  if (status === "verified") return "Verified routing";
  if (status === "unavailable") return "Unavailable";
  return "Needs review";
}

type DoorGuideProps = {
  doors: FraudDoor[];
  hasNeedsReview: boolean;
};

export function DoorGuide({ doors, hasNeedsReview }: DoorGuideProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [licensingNote, setLicensingNote] = useState(false);

  const scrollToDoor = useCallback((doorKey: string) => {
    setLicensingNote(false);
    setActiveKey(doorKey);
    const el = document.getElementById(`door-${doorKey}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  function handleBranchClick(doorKey: string | null) {
    if (!doorKey) {
      setActiveKey(null);
      setLicensingNote(true);
      return;
    }
    scrollToDoor(doorKey);
  }

  return (
    <aside
      className="print-card rounded-2xl border p-6"
      style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(201,162,39,0.28)" }}
    >
      <h2 className="print-dark text-lg font-black" style={{ color: GOLD }}>
        Which door?
      </h2>
      <p className="mt-2 text-xs leading-5 text-white/62">
        Route by whose money was touched — not by who you think is responsible. Tap a situation to jump to the right filing link.
      </p>
      <div className="mt-4 space-y-2">
        {whichDoorTree.map(branch => {
          const isActive = branch.doorKey !== null && activeKey === branch.doorKey;
          return (
            <button
              key={branch.when}
              type="button"
              onClick={() => handleBranchClick(branch.doorKey)}
              className="w-full rounded-lg border p-3 text-left text-xs leading-5 transition hover:border-[#C9A227]/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A227]"
              style={{
                borderColor: isActive ? "rgba(201,162,39,0.65)" : "rgba(255,255,255,0.12)",
                backgroundColor: isActive ? "rgba(201,162,39,0.12)" : "rgba(15,30,48,0.55)",
                cursor: "pointer",
              }}
            >
              <span className="font-black text-white/85">{branch.when}</span>
              <span className="text-white/50"> → {branch.route}</span>
            </button>
          );
        })}
      </div>

      {licensingNote && (
        <p
          className="mt-3 rounded-lg border p-3 text-xs leading-5"
          style={{ borderColor: "rgba(201,162,39,0.4)", color: "rgba(255,255,255,0.82)" }}
        >
          Licensing boards are a <strong>separate parallel track</strong> — psychologist, social worker, attorney, GAL, etc. Find the board that licenses the profession in your state and file your documented facts there. This packet does not route licensing complaints automatically yet.
        </p>
      )}

      <div className="mt-5 space-y-4">
        {doors.map(door => {
          const highlighted = activeKey === door.key;
          return (
            <div
              key={door.key}
              id={`door-${door.key}`}
              className="scroll-mt-24 rounded-lg border p-4 transition"
              style={{
                borderColor: highlighted ? "rgba(201,162,39,0.65)" : "rgba(255,255,255,0.12)",
                backgroundColor: highlighted ? "rgba(201,162,39,0.08)" : "rgba(15,30,48,0.55)",
                boxShadow: highlighted ? "0 0 0 1px rgba(201,162,39,0.35)" : undefined,
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="print-dark text-sm font-black">{door.name}</h3>
                <span
                  className="rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide"
                  style={{
                    backgroundColor: door.verificationStatus === "verified" ? "rgba(34,197,94,0.18)" : "rgba(201,162,39,0.16)",
                    color: door.verificationStatus === "verified" ? "#86EFAC" : GOLD,
                  }}
                >
                  {statusLabel(door.verificationStatus)}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/72">
                <span className="font-bold text-white/85">Use when:</span> {door.whenToUse}
              </p>
              <p className="mt-1 text-xs leading-5 text-white/55">{door.description}</p>
              <a
                href={door.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex rounded-md px-3 py-2 text-xs font-black uppercase tracking-wide transition hover:opacity-90"
                style={{ backgroundColor: GOLD, color: NAVY }}
              >
                Open this door
              </a>
              {door.key === "fbi_tips" && (
                <p className="mt-2 text-[11px] leading-5 text-white/50">
                  Also consider your{" "}
                  <button
                    type="button"
                    onClick={() => scrollToDoor("usao")}
                    className="font-bold underline"
                    style={{ color: GOLD }}
                  >
                    U.S. Attorney&apos;s Office
                  </button>{" "}
                  for the same situation.
                </p>
              )}
            </div>
          );
        })}
      </div>
      {hasNeedsReview && (
        <p className="mt-4 rounded-lg border p-3 text-xs leading-5" style={{ borderColor: "rgba(201,162,39,0.4)", color: GOLD }}>
          A door marked &quot;needs review&quot; is a pending placeholder. Confirm the exact office before filing.
        </p>
      )}
    </aside>
  );
}