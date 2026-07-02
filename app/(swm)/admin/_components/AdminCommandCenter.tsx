"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";

const GOLD = "#C9A227";

export type AdminSection = {
  id: string;
  label: string;
  description: string;
  href?: string;
  accent?: string;
};

const DEFAULT_SECTIONS: AdminSection[] = [
  { id: "admin-gmail", label: "Gmail", description: "Send & draft from info@", accent: "#60a5fa" },
  { id: "admin-photo-intake", label: "Photo Intake", description: "Incoming actor photos", accent: "#a78bfa" },
  { id: "admin-social-queue", label: "Blotato Queue", description: "Stage, approve, publish", accent: GOLD },
  { id: "admin-court-actors", label: "Court Actors", description: "Promote, deploy, repair", accent: "#34d399" },
  { id: "admin-stats", label: "Movement Stats", description: "Totals & reach", accent: "#f472b6" },
  { id: "admin-submissions-location", label: "By Location", description: "State breakdown table", accent: "#38bdf8" },
  { id: "admin-reporting-audit", label: "Reporting Audit", description: "Mismatch review", accent: "#fb923c" },
  { id: "admin-photo-requests", label: "Photo Requests", description: "Auto-email workflow", accent: "#c084fc" },
  { id: "admin-recent-submissions", label: "Recent Surveys", description: "Latest families", accent: "#4ade80" },
  { id: "admin-circles", label: "Connection Circles", description: "Rooms, invites, billing", href: "/admin/circles", accent: "#f87171" },
  { id: "admin-shawn-lee", label: "Shawn Lee Leads", description: "Coaching, Q&A, Report Kit", href: "/admin/shawn-lee", accent: "#C9A227" },
];

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  // Offset to clear the sticky "Where do you want to work?" command bar
  const headerOffset = 90;
  const rect = el.getBoundingClientRect();
  const absoluteTop = rect.top + window.scrollY;
  window.scrollTo({ top: Math.max(0, absoluteTop - headerOffset), behavior: "smooth" });
}

function IconMail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function IconCamera({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h3l2-3h6l2 3h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function IconShare({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V8m0 0l-3 3m3-3l3 3m7 5v-8m0 0l-3 3m3-3l3 3" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H2v-2a4 4 0 014-4h1m8-4a4 4 0 11-8 0 4 4 0 018 0zm6 8a4 4 0 00-4-4H9a4 4 0 00-4 4" />
    </svg>
  );
}

function IconChart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h16M8 17V9m4 8V7m4 10v-4" />
    </svg>
  );
}

function IconGlobe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M3 12h18M12 3c2.5 2.8 4 6 4 9s-1.5 6.2-4 9M12 3c-2.5 2.8-4 6-4 9s1.5 6.2 4 9" />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 4v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" />
    </svg>
  );
}

function IconInbox({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v12H4zM4 10h4l2 3h4l2-3h4" />
    </svg>
  );
}

function IconList({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function IconLink({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14a5 5 0 007 0l1-1a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-1 1a5 5 0 007 7l1-1" />
    </svg>
  );
}

const SECTION_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "admin-gmail": IconMail,
  "admin-photo-intake": IconCamera,
  "admin-social-queue": IconShare,
  "admin-court-actors": IconUsers,
  "admin-stats": IconChart,
  "admin-submissions-location": IconGlobe,
  "admin-reporting-audit": IconShield,
  "admin-photo-requests": IconInbox,
  "admin-recent-submissions": IconList,
  "admin-circles": IconLink,
  "admin-shawn-lee": IconLink,
};

type Props = {
  sections?: AdminSection[];
};

export function AdminCommandCenter({ sections = DEFAULT_SECTIONS }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const observeSections = useCallback(() => {
    const ids = sections.filter(s => !s.href).map(s => s.id);
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const next = visible[0]?.target.id ?? null;
        if (next && next !== activeIdRef.current) {
          activeIdRef.current = next;
          setActiveId(next);
        }
      },
      { rootMargin: "-12% 0px -60% 0px", threshold: [0.15, 0.35] },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    return observeSections();
  }, [observeSections]);

  return (
    <div
      className="sticky top-0 z-30 py-3"
      style={{
        background: "linear-gradient(180deg, rgba(9,22,37,0.97) 0%, rgba(9,22,37,0.9) 100%)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(201,162,39,0.12)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: GOLD }}>
              Command Center
            </p>
            <h2 className="mt-1 text-xl md:text-2xl font-black text-white tracking-tight">
              Where do you want to work?
            </h2>
          </div>
        </div>

        <div className="grid gap-2 grid-cols-2 sm:grid-cols-5 lg:grid-cols-10">
          {sections.map(section => {
            const Icon = SECTION_ICONS[section.id] ?? IconList;
            const isActive = activeId === section.id;
            const accent = section.accent ?? GOLD;
            const baseClass = "flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-xl text-center min-h-[56px] transition-colors duration-150";

            const inner = (
              <>
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                  style={{
                    backgroundColor: `${accent}18`,
                    border: `1px solid ${accent}44`,
                    color: accent,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="text-[10px] font-black text-white leading-tight truncate max-w-[72px]">
                  {section.label}
                </div>
              </>
            );

            const style = {
              backgroundColor: isActive ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${isActive ? `${accent}66` : "rgba(255,255,255,0.1)"}`,
            };

            if (section.href) {
              return (
                <a
                  key={section.id}
                  href={section.href}
                  className={baseClass}
                  style={style}
                >
                  {inner}
                </a>
              );
            }

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  setActiveId(section.id);
                  activeIdRef.current = section.id;
                  scrollToSection(section.id);
                }}
                className={baseClass}
                style={style}
                aria-current={isActive ? "true" : undefined}
              >
                {inner}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AdminSectionShell({
  id,
  children,
  className = "",
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 ${className}`}
    >
      {children}
    </section>
  );
}