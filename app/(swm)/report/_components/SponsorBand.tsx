"use client";

import { useEffect, useState } from "react";

const GOLD = "#C9A227";
const RED = "#d8332f";

interface Sponsor {
  id: string;
  business_name: string;
  website_url?: string | null;
  phone?: string | null;
  services?: string | null;
  tagline?: string | null;
  location_label?: string | null;
  brand_color?: string | null;
  logo_url?: string | null;
  slot?: string | null;
}

interface SponsorBandProps {
  placement?: "main_page" | "state_page";
  state?: string;
  stateName?: string;
  variant?: "national" | "state" | "default";
  showPromoWhenEmpty?: boolean;
}

function domainLabel(url?: string | null): string {
  if (!url) return "Visit website";
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

const BAND_CLASS = "rounded-2xl border p-5 sm:p-6";
const BAND_STYLE = { borderColor: "rgba(245,245,245,0.10)", backgroundColor: "rgba(255,255,255,0.03)" };

function SponsorCard({ s, tag, tagBorder }: { s: Sponsor; tag: string; tagBorder: string }) {
  const accent = s.brand_color || "#1f93c7";
  return (
    <div
      className="relative rounded-xl p-5 text-[#15202b]"
      style={{ background: "linear-gradient(180deg,#ffffff,#f4f6f9)", boxShadow: "0 16px 36px -16px rgba(0,0,0,0.55)" }}
    >
      <span
        className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider"
        style={{ color: "#8a6d10", background: "rgba(201,162,39,0.16)", border: `1px solid ${tagBorder}` }}
      >
        {tag}
      </span>
      {s.logo_url && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={s.logo_url} alt={`${s.business_name} — sponsor`} className="mb-3 block h-12 w-auto" loading="lazy" decoding="async" />
      )}
      {s.services && <div className="text-sm font-extrabold">{s.services}</div>}
      {s.location_label && <div className="mt-1 text-xs" style={{ color: "#5b6675" }}>{s.location_label}</div>}
      <div className="my-3 h-px" style={{ background: "#e6e9ee" }} />
      <div className="flex items-center justify-between gap-3">
        <div>
          {s.phone && <div className="text-sm font-extrabold">{s.phone}</div>}
          {s.tagline && <div className="mt-0.5 text-[11px] italic" style={{ color: "#7a8493" }}>{s.tagline}</div>}
        </div>
        {s.website_url && (
          <a
            href={s.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-extrabold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            {domainLabel(s.website_url)}
          </a>
        )}
      </div>
    </div>
  );
}

function EmptySlot({ tag, minH = "min-h-[150px]" }: { tag: string; minH?: string }) {
  return (
    <a
      href="/sponsor"
      target="_blank"
      rel="noopener noreferrer"
      className={`flex ${minH} flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition-colors hover:bg-white/[0.03]`}
      style={{ borderColor: "rgba(201,162,39,0.4)" }}
    >
      <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "rgba(245,245,245,0.45)" }}>
        {tag}
      </span>
      <span className="mt-2 text-sm font-extrabold" style={{ color: GOLD }}>Your business here</span>
      <span className="mt-1 text-[11px]" style={{ color: "rgba(245,245,245,0.5)" }}>Become a sponsor →</span>
    </a>
  );
}

function useSponsors(placement: string, state?: string): Sponsor[] {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  useEffect(() => {
    const params = new URLSearchParams({ placement });
    if (state) params.set("state", state);
    let cancelled = false;
    fetch(`/api/sponsors?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSponsors(Array.isArray(d?.sponsors) ? d.sponsors : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [placement, state]);
  return sponsors;
}

export function SponsorBand({
  placement = "main_page",
  state,
  stateName,
  variant = "default",
  showPromoWhenEmpty = false,
}: SponsorBandProps) {
  const sponsors = useSponsors(placement, state);

  // ── National: 1 Presenting (larger) + 1 Co-Sponsor (smaller) ──
  if (variant === "national") {
    const presenting = sponsors.find((s) => s.slot === "presenting" || s.slot === "movement_partner");
    const co = sponsors.find((s) => s.slot === "co_sponsor");
    return (
      <section aria-label="National sponsors" className={BAND_CLASS} style={BAND_STYLE}>
        <div className="text-[11px] font-extrabold uppercase tracking-[0.18em]" style={{ color: GOLD }}>Presented by</div>
        <h3
          className="mt-2 text-base sm:text-lg font-bold leading-snug"
          style={{ color: "#F5F5F5", textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}
        >
          This national report is brought to you by —
        </h3>
        <div className="mt-5 grid gap-4 md:grid-cols-5">
          <div className="md:col-span-3">
            {presenting ? <SponsorCard s={presenting} tag="Presenting Sponsor" tagBorder="rgba(201,162,39,0.5)" /> : <EmptySlot tag="Presenting sponsor" />}
          </div>
          <div className="md:col-span-2">
            {co ? <SponsorCard s={co} tag="Co-Sponsor" tagBorder="rgba(201,162,39,0.35)" /> : <EmptySlot tag="Co-sponsor" />}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12px]" style={{ color: GOLD }}>★ Only two national sponsors in the country.</span>
          <a href="/sponsor" target="_blank" rel="noopener noreferrer" className="rounded-xl px-5 py-2.5 text-sm font-extrabold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: RED }}>
            Become a Sponsor →
          </a>
        </div>
      </section>
    );
  }

  // ── State: 1 Exclusive (large) + up to 3 Community Supporters ──
  if (variant === "state") {
    const exclusive = sponsors.find((s) => s.slot === "state_exclusive");
    const supporters = sponsors.filter((s) => s.slot === "community_supporter").slice(0, 3);
    return (
      <section aria-label="State sponsors" className={BAND_CLASS} style={BAND_STYLE}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
            {stateName ? `${stateName}'s report is supported by` : "Supported by local sponsors"}
          </div>
          <span className="text-[11px]" style={{ color: "rgba(245,245,245,0.4)" }}>Local sponsors keep this free</span>
        </div>
        <div className="mt-4">
          {exclusive ? (
            <SponsorCard s={exclusive} tag="State Exclusive" tagBorder="rgba(201,162,39,0.5)" />
          ) : (
            <EmptySlot tag="State Exclusive — be the only business on this report" />
          )}
        </div>
        <div className="mt-5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "rgba(245,245,245,0.45)" }}>
          Community supporters
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => {
            const sup = supporters[i];
            if (!sup) {
              return (
                <a key={i} href="/sponsor" target="_blank" rel="noopener noreferrer" className="flex min-h-[70px] flex-col items-center justify-center rounded-lg border border-dashed p-3 text-center hover:bg-white/[0.03]" style={{ borderColor: "rgba(201,162,39,0.35)" }}>
                  <span className="text-[10px] font-bold" style={{ color: GOLD }}>Your logo here</span>
                </a>
              );
            }
            return (
              <a key={sup.id} href={sup.website_url ?? "/sponsor"} target="_blank" rel="noopener noreferrer" className="flex min-h-[70px] items-center justify-center rounded-lg bg-white p-3">
                {sup.logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={sup.logo_url} alt={`${sup.business_name} — supporter`} className="max-h-10 w-auto" />
                ) : (
                  <span className="text-xs font-bold text-[#15202b]">{sup.business_name}</span>
                )}
              </a>
            );
          })}
        </div>
      </section>
    );
  }

  // ── Default (fallback) ──
  if (sponsors.length === 0) {
    if (!showPromoWhenEmpty) return null;
    return (
      <section aria-label="Sponsorship opportunity" className={BAND_CLASS} style={BAND_STYLE}>
        <div className="text-[11px] font-extrabold uppercase tracking-[0.18em]" style={{ color: GOLD }}>Made possible by local sponsors</div>
        <h3 className="mt-2 text-xl sm:text-2xl font-black leading-tight">Local businesses keep this report free for families</h3>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <EmptySlot key={i} tag="Open slot" />)}
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Local sponsors" className={BAND_CLASS} style={BAND_STYLE}>
      <div className="text-[11px] font-extrabold uppercase tracking-[0.18em]" style={{ color: GOLD }}>Made possible by local sponsors</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {sponsors.map((s) => <SponsorCard key={s.id} s={s} tag="Sponsor" tagBorder="rgba(201,162,39,0.4)" />)}
      </div>
    </section>
  );
}
