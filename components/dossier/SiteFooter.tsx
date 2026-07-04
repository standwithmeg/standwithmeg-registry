import Link from "next/link";
import { DonateNudge } from "./DonateNudge";

export function SiteFooter() {
  return (
    <footer className="mt-16" style={{ borderTop: "1px solid var(--hairline)" }}>
      <div className="wrap py-12 flex flex-col gap-8">
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center panel p-6" style={{ borderColor: "var(--hairline-gold)" }}>
          <div className="flex items-center gap-6">
            {/* Meg's real ShoutOut art — never swap this image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/meg/shoutout-card.png" alt="ShoutOut from Meg" width={110} height={110} loading="lazy" style={{ border: "1px solid var(--hairline)", flexShrink: 0 }} />
            <div>
              <p className="display text-xl md:text-2xl" style={{ color: "var(--gold-soft)" }}>BOOK A SHOUTOUT FROM MEG</p>
              <p className="text-sm mt-2" style={{ color: "var(--ink-70)" }}>
                A personal video — encouragement before a hearing, a birthday, or just because.
              </p>
            </div>
          </div>
          <a href="https://www.shoutout.fans/standwithmeg" target="_blank" rel="noreferrer" className="icon-ring" aria-label="Book a ShoutOut from Meg (opens in a new tab)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        </div>
        <DonateNudge seed={13} compact />
        <div className="flex flex-wrap justify-between gap-8">
          <div className="max-w-sm">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="lockup-first text-lg">STAND WITH</span>
              <span className="lockup-last text-lg">MEG</span>
            </div>
            <p className="text-sm" style={{ color: "var(--ink-70)" }}>
              Investigative journalism on family-court accountability, built from
              families&rsquo; reported experiences across the country.
            </p>
          </div>
          <div className="flex gap-12">
            <nav aria-label="Footer" className="flex flex-col gap-2 text-sm">
              <Link href="/report" className="nav-link">The Report</Link>
              <Link href="/actors" className="nav-link">Court Actors</Link>
              <Link href="/connect" className="nav-link">Circles</Link>
            </nav>
            <nav aria-label="Footer actions" className="flex flex-col gap-2 text-sm">
              <Link href="/survey" className="nav-link">Share your story</Link>
              <Link href="/report" className="nav-link">State reports</Link>
              <Link href="/sponsor" className="nav-link">Become a sponsor</Link>
              <Link href="/partners" className="nav-link">State partners</Link>
              <a href="https://www.shoutout.fans/standwithmeg" target="_blank" rel="noreferrer" className="nav-link">
                📣 Book a ShoutOut from Meg
              </a>
            </nav>
          </div>
        </div>
        <hr className="hairline--accent hairline" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="disclaimer-strip">@standwithmeg · standwithmeg.com</p>
          <p className="disclaimer-strip">Family-reported submissions.</p>
        </div>
      </div>
    </footer>
  );
}
