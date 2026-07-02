"use client";

import { useId, useState } from "react";

const GOLD = "#c9a227";

// Commission model (matches the partner specs):
//   monthly recurring = sponsors × avg slot price × 20%
//   fast-start bonus  = sponsors × avg slot price × 10% (one-time, first payment)
const AVG_SLOT = 160;
const RECURRING_RATE = 0.2;
const FAST_START_RATE = 0.1;
const MIN_SPONSORS = 1;
const MAX_SPONSORS = 50;

const PRESETS = [
  { label: "10 sponsors → $320/mo", sponsors: 10 },
  { label: "30 → $960/mo", sponsors: 30 },
  { label: "1 Movement Partner → $980/mo", sponsors: 0, fixedMonthly: 980 },
];

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

/**
 * Live earnings calculator. The big gold $/mo figure is the visual peak of the
 * partner pages — it updates as the slider moves and is announced via aria-live.
 * Reused on both /partners and /partners/how-to-sell.
 */
export function EarningsCalculator() {
  const [sponsors, setSponsors] = useState(18);
  const [fixedMonthly, setFixedMonthly] = useState<number | null>(null);
  const sliderId = useId();

  const monthly = fixedMonthly ?? sponsors * AVG_SLOT * RECURRING_RATE;
  // First-payment bonus is 10% vs the 20% recurring rate — always half the
  // monthly figure, whether driven by the slider or a fixed preset.
  const bonus = (monthly * FAST_START_RATE) / RECURRING_RATE;
  const annual = monthly * 12;

  function applyPreset(preset: (typeof PRESETS)[number]) {
    if (preset.fixedMonthly) {
      setFixedMonthly(preset.fixedMonthly);
      setSponsors(1);
    } else {
      setFixedMonthly(null);
      setSponsors(preset.sponsors);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <label htmlFor={sliderId} className="block text-sm font-extrabold text-white/80">
        How many sponsors will you sign?
      </label>

      <div className="mt-4 flex items-center gap-4">
        <input
          id={sliderId}
          type="range"
          min={MIN_SPONSORS}
          max={MAX_SPONSORS}
          value={fixedMonthly ? MIN_SPONSORS : sponsors}
          onChange={(e) => {
            setFixedMonthly(null);
            setSponsors(Number(e.target.value));
          }}
          className="swm-range h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15"
          aria-valuetext={fixedMonthly ? "1 Movement Partner" : `${sponsors} sponsors`}
        />
        <div className="min-w-[5.5rem] text-right">
          <div className="text-2xl font-black" style={{ color: GOLD }}>
            {fixedMonthly ? "1" : sponsors}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            {fixedMonthly ? "Movement Partner" : sponsors === 1 ? "sponsor" : "sponsors"}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[12px] text-white/40">Avg slot ~{money(AVG_SLOT)}/mo · you earn 20% recurring.</p>

      <div className="mt-6 rounded-2xl border border-[#c9a227]/30 bg-[#c9a227]/[0.06] p-6 text-center" aria-live="polite">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/55">You earn</div>
        <div className="mt-1 text-5xl font-black leading-none sm:text-6xl" style={{ color: GOLD }}>
          {money(monthly)}
          <span className="text-2xl font-black text-white/60"> / mo</span>
        </div>
        <div className="mt-1 text-sm font-bold text-white/70">recurring — every month they stay</div>
        <div className="mt-3 text-[13px] text-white/55">
          + about <b className="text-white/80">{money(bonus)}</b> in first-payment bonuses
        </div>
        <div className="mt-2 text-[13px] font-semibold" style={{ color: GOLD }}>
          That&apos;s {money(annual)}+ a year — and it grows every month you add a sponsor.
        </div>
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            className="rounded-full border border-[#c9a227]/40 px-3.5 py-1.5 text-[12px] font-bold text-white/75 transition-colors hover:bg-[#c9a227]/10"
            style={{ color: GOLD }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="mt-4 text-center text-[11px] text-white/35">
        Estimates based on average slot price. Bigger states and national sponsors pay more.
      </p>

      <style>{`
        .swm-range::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          height: 24px; width: 24px; border-radius: 9999px;
          background: ${GOLD}; border: 3px solid #0a1526; cursor: pointer;
          box-shadow: 0 0 0 1px ${GOLD};
        }
        .swm-range::-moz-range-thumb {
          height: 24px; width: 24px; border-radius: 9999px;
          background: ${GOLD}; border: 3px solid #0a1526; cursor: pointer;
        }
        .swm-range:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 4px; }
      `}</style>
    </div>
  );
}
