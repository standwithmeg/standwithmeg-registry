"use client";

import { useEffect, useState } from "react";

interface Placement {
  img: string;
  w: number;
  h: number;
  title: string;
  body: string;
  tierLabel: string;
}

// Order: National → State → PDF (lead with the most impressive — it anchors the rest).
const PLACEMENTS: Placement[] = [
  {
    img: "/sponsor/example-report-page.jpg",
    w: 1200,
    h: 825,
    title: "On the national report page",
    body: "The whole country's report — your logo in the Presenting or Co-Sponsor slot, seen by every family nationwide.",
    tierLabel: "National · from $1,900/mo",
  },
  {
    img: "/sponsor/example-state-page.jpg",
    w: 1200,
    h: 1050,
    title: "On your state's report page",
    body: "Your logo at the top of the report families in your state actually read — geo-targeted to the people near you.",
    tierLabel: "State Exclusive or Supporter · from $99/mo",
  },
  {
    img: "/sponsor/example-pdf-cover.jpg",
    w: 854,
    h: 1200,
    title: "Inside the state PDF",
    body: "A clean strip on the report families download and hand to their legislators. Your brand travels where it goes.",
    tierLabel: "State Exclusive only · from $179/mo",
  },
];

const GOLD = "#c9a227";

export function PlacementGallery() {
  const [active, setActive] = useState<Placement | null>(null);

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActive(null);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [active]);

  return (
    <>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {PLACEMENTS.map((p, index) => (
          <button
            key={p.title}
            type="button"
            onClick={() => setActive(p)}
            className="group cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left transition-colors hover:border-[#c9a227]/50"
          >
            <div className="relative bg-black/30 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.img}
                alt={p.title}
                width={p.w}
                height={p.h}
                loading={index < 2 ? "eager" : "lazy"}
                fetchPriority={index < 2 ? "high" : "auto"}
                className="block h-44 w-full rounded-lg object-cover object-top transition-opacity group-hover:opacity-90"
              />
              <span className="absolute right-4 top-4 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-sm">
                🔍 Click to enlarge
              </span>
            </div>
            <div className="p-5">
              <h3 className="text-xl font-black leading-tight">{p.title}</h3>
              <div className="mt-1.5 text-xs font-extrabold uppercase tracking-wider" style={{ color: GOLD }}>
                {p.tierLabel}
              </div>
              <p className="mt-2.5 text-[15px] leading-relaxed text-white/70">{p.body}</p>
              <span className="mt-3 inline-block text-sm font-bold" style={{ color: GOLD }}>
                See it full-size →
              </span>
            </div>
          </button>
        ))}
      </div>

      {active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Example: ${active.title}`}
          onClick={() => setActive(null)}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/85 p-4 backdrop-blur-sm"
        >
          <div onClick={(e) => e.stopPropagation()} className="relative my-auto w-full max-w-4xl">
            {/* Title bar — says exactly what you're looking at */}
            <div className="flex items-center justify-between rounded-t-2xl border border-white/10 bg-[#0f2238] px-5 py-3">
              <div>
                <div className="text-lg font-black">{active.title}</div>
                <div className="text-xs font-extrabold uppercase tracking-wider" style={{ color: GOLD }}>
                  {active.tierLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label="Close example"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm font-bold text-white/80 hover:text-white"
              >
                ✕ Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.img}
              alt={active.title}
              width={active.w}
              height={active.h}
              className="mx-auto block max-h-[78vh] w-auto max-w-full rounded-b-2xl object-contain shadow-2xl"
            />
            <p className="mt-3 text-center text-sm text-white/65">{active.body}</p>
          </div>
        </div>
      )}
    </>
  );
}
