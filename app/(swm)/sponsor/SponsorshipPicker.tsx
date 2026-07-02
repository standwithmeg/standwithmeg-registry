"use client";

import { useState } from "react";
import { setSponsorPrefill, type SponsorPrefill } from "./sponsor-prefill";

const GOLD = "#c9a227";
const RED = "#d8332f";

type Tier = "Flagship" | "Major" | "Standard" | "Emerging";

const TIER_PRICE: Record<Tier, { exMo: number; exQtr: number; supMo: number; supQtr: number }> = {
  Flagship: { exMo: 399, exQtr: 1099, supMo: 179, supQtr: 499 },
  Major: { exMo: 299, exQtr: 819, supMo: 149, supQtr: 399 },
  Standard: { exMo: 229, exQtr: 629, supMo: 119, supQtr: 319 },
  Emerging: { exMo: 179, exQtr: 499, supMo: 99, supQtr: 269 },
};

// region -> [name, tier]. Canada is a live Tier-3 region.
const REGIONS: Record<string, [string, Tier]> = {
  CA: ["California", "Flagship"], TX: ["Texas", "Flagship"], FL: ["Florida", "Flagship"],
  OH: ["Ohio", "Flagship"], KS: ["Kansas", "Flagship"], MO: ["Missouri", "Flagship"], NC: ["North Carolina", "Flagship"],
  MI: ["Michigan", "Major"], GA: ["Georgia", "Major"], OK: ["Oklahoma", "Major"], PA: ["Pennsylvania", "Major"],
  NY: ["New York", "Major"], IN: ["Indiana", "Major"], IL: ["Illinois", "Major"], TN: ["Tennessee", "Major"],
  VA: ["Virginia", "Major"], WA: ["Washington", "Major"], CO: ["Colorado", "Major"], MA: ["Massachusetts", "Major"], SC: ["South Carolina", "Major"],
  IA: ["Iowa", "Standard"], KY: ["Kentucky", "Standard"], AL: ["Alabama", "Standard"], AZ: ["Arizona", "Standard"],
  OR: ["Oregon", "Standard"], MN: ["Minnesota", "Standard"], WI: ["Wisconsin", "Standard"], CT: ["Connecticut", "Standard"],
  NJ: ["New Jersey", "Standard"], LA: ["Louisiana", "Standard"], UT: ["Utah", "Standard"], MT: ["Montana", "Standard"],
  WV: ["West Virginia", "Standard"], Canada: ["Canada", "Standard"],
  MS: ["Mississippi", "Emerging"], AR: ["Arkansas", "Emerging"], MD: ["Maryland", "Emerging"], NV: ["Nevada", "Emerging"],
  ID: ["Idaho", "Emerging"], NE: ["Nebraska", "Emerging"], AK: ["Alaska", "Emerging"],
};

const SORTED = Object.entries(REGIONS).sort((a, b) => a[1][0].localeCompare(b[1][0]));

interface CardProps {
  name: string;
  mo: number;
  qtr: number;
  benefits: string[];
  scarcity: string;
  ribbon?: string;
  prefill: SponsorPrefill;
}

function PriceCard({ name, mo, qtr, benefits, scarcity, ribbon, prefill }: CardProps) {
  const save = mo * 3 - qtr;
  return (
    <div
      className="relative flex flex-col rounded-2xl border p-6 transition-transform hover:-translate-y-1"
      style={{ borderColor: ribbon ? "rgba(201,162,39,0.5)" : "rgba(255,255,255,0.1)", background: "#0f2238" }}
    >
      {ribbon && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#0a1526]" style={{ background: GOLD }}>
          {ribbon}
        </div>
      )}
      <div className="text-sm font-extrabold">{name}</div>
      <div className="mt-3 text-4xl font-black" style={{ color: GOLD }}>
        ${mo.toLocaleString()}
        <span className="text-base font-bold text-white/50">/month</span>
      </div>
      <div className="text-[12px] text-white/45">
        or ${qtr.toLocaleString()}/quarter{save > 0 ? ` — save $${save.toLocaleString()}` : ""}
      </div>
      <div className="my-4 h-px bg-white/10" />
      <ul className="flex-1 space-y-2">
        {benefits.map((b) => (
          <li key={b} className="flex gap-2 text-[13px] leading-snug text-white/75">
            <span style={{ color: GOLD }}>✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 text-[12px] font-bold" style={{ color: GOLD }}>★ {scarcity}</div>
      <button
        type="button"
        onClick={() => {
          setSponsorPrefill(prefill);
          document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
        }}
        className="mt-3 rounded-xl px-5 py-2.5 text-center text-sm font-extrabold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: RED }}
      >
        Sponsor this →
      </button>
    </div>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-10 text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
      {children}
    </div>
  );
}

export function SponsorshipPicker() {
  const [region, setRegion] = useState("WA");
  const [name, tier] = REGIONS[region];
  const p = TIER_PRICE[tier];
  const placeWord = region === "Canada" ? "the Canada" : `the ${name}`;

  return (
    <section className="mt-20">
      <h2 className="text-center text-2xl font-black sm:text-3xl">Choose your sponsorship</h2>
      <p className="mt-2 text-center text-sm text-white/50">
        Pick where your brand appears. One Exclusive per region — once it&apos;s taken, it&apos;s gone.
      </p>

      <div className="mt-6 flex items-center justify-center gap-2 text-sm">
        <label htmlFor="sponsor-region" className="text-white/55">Sponsoring in:</label>
        <select
          id="sponsor-region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-bold text-[#f5f5f5] outline-none focus:border-[#c9a227]/60"
        >
          {SORTED.map(([a, [n]]) => (
            <option key={a} value={a} className="bg-[#0a1526]">{n}</option>
          ))}
        </select>
        <span className="text-[12px] text-white/35">({tier})</span>
      </div>

      <RowLabel>Your region — {name}</RowLabel>
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <PriceCard
          name="Region Exclusive"
          ribbon="Best value"
          mo={p.exMo}
          qtr={p.exQtr}
          benefits={[
            `Featured logo on ${placeWord} report page`,
            "The ONLY logo inside the PDF families send to lawmakers",
            "One business per region — total exclusivity",
          ]}
          scarcity={`Only 1 in ${name} — currently OPEN`}
          prefill={{ tier: "State Exclusive", stateAbbr: region, stateName: name, price: `$${p.exMo}/mo` }}
        />
        <PriceCard
          name="Community Supporter"
          mo={p.supMo}
          qtr={p.supQtr}
          benefits={[`Your logo on ${placeWord} report page`, "Seen by every family who opens the report"]}
          scarcity={`3 spots — open in ${name}`}
          prefill={{ tier: "Community Supporter", stateAbbr: region, stateName: name, price: `$${p.supMo}/mo` }}
        />
      </div>

      <RowLabel>National — seen on the whole country&apos;s report</RowLabel>
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <PriceCard
          name="National Presenting"
          ribbon="Premier"
          mo={2900}
          qtr={7900}
          benefits={["Top “Presented by” placement on the national report page", "Largest logo, named in press"]}
          scarcity="Only 1 in the country"
          prefill={{ tier: "National Presenting", stateAbbr: "", stateName: "", price: "$2,900/mo" }}
        />
        <PriceCard
          name="National Co-Sponsor"
          mo={1900}
          qtr={5200}
          benefits={["Featured secondary placement on the national report page"]}
          scarcity="Only 1 in the country"
          prefill={{ tier: "National Co-Sponsor", stateAbbr: "", stateName: "", price: "$1,900/mo" }}
        />
      </div>

      <RowLabel>Premium</RowLabel>
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <PriceCard
          name="Movement Partner"
          ribbon="Flagship"
          mo={4900}
          qtr={13500}
          benefits={[
            "Everything in National Presenting",
            "Your logo across ALL state PDFs",
            "A monthly sponsored reel + story shoutouts to 250K+",
            "Newsletter feature",
          ]}
          scarcity="Only 1 — the whole platform + the megaphone"
          prefill={{ tier: "Movement Partner", stateAbbr: "", stateName: "", price: "$4,900/mo" }}
        />
        <div className="flex flex-col justify-center rounded-2xl border-2 border-dashed p-6" style={{ borderColor: "rgba(201,162,39,0.4)" }}>
          <div className="text-sm font-extrabold uppercase tracking-wider" style={{ color: GOLD }}>Founding Reserve</div>
          <p className="mt-2 text-[13px] text-white/60">
            Your region&apos;s report isn&apos;t live yet? Lock your Exclusive at <b>$99/mo</b> and convert when it launches.
          </p>
          <a href="#apply" className="mt-4 self-start text-sm font-bold" style={{ color: GOLD }}>Reserve your region →</a>
        </div>
      </div>
    </section>
  );
}
