"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/report", label: "The Report" },
  { href: "/actors", label: "Court Actors" },
  { href: "/connect", label: "Circles" },
  { href: "/sponsor", label: "Sponsor" },
  { href: "/survey", label: "Share your story" },
  { href: "/admin", label: "Admin" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="site-header">
      <div className="wrap flex items-center justify-between gap-4 py-3.5 flex-wrap">
        <Link href="/" className="no-underline flex items-baseline gap-2.5">
          <span className="lockup-first text-xl">STAND WITH</span>
          <span className="lockup-last text-xl">MEG</span>
        </Link>
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-6">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="nav-link" data-active={path.startsWith(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <a href="#" className="action-pill" style={{ padding: "0.55rem 1.15rem", fontSize: "0.8rem" }}>
            Donate
          </a>
          <a href="#" className="btn-quiet hidden sm:inline-flex" style={{ padding: "0.5rem 1rem", fontSize: "0.72rem" }}>
            Give monthly
          </a>
        </div>
      </div>
      <nav aria-label="Main navigation mobile" className="md:hidden wrap flex gap-4 pb-3 overflow-x-auto">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="nav-link whitespace-nowrap" data-active={path.startsWith(l.href)}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
