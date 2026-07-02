"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { CourtActorPanel, CourtActorListModal, type PublicActor } from "./CourtActorPanel";
import { DonateBand, FEATURED_DONATE_LINE } from "./DonateBand";
import { SponsorCtaButton } from "../../SponsorCtaButton";
import type { ReportInitialCourtActors } from "../../../../lib/report-initial-court-actors";
import { DONATION_URL, HOW_TO_USE_VIDEO_EMBED_URL } from "../../../../lib/site-links";
import { GOLD, BG, colors, shadows } from "../../../../lib/design-tokens";
import { Skeleton } from "@/components/ui/Skeleton";

const StateTable = dynamic(() => import("./StateTable").then(m => ({ default: m.StateTable })), { loading: () => <SectionSkeleton /> });
const InviteFriendModal = dynamic(() => import("./InviteFriendModal").then(m => ({ default: m.InviteFriendModal })), { loading: () => null });
const SponsorBand = dynamic(() => import("./SponsorBand").then(m => ({ default: m.SponsorBand })), { loading: () => <SectionSkeleton /> });
const PrintKitBand = dynamic(() => import("./PrintKitBand").then(m => ({ default: m.PrintKitBand })), { loading: () => <SectionSkeleton /> });
const ConnectionCirclesCta = dynamic(() => import("../../ConnectionCirclesCta").then(m => ({ default: m.ConnectionCirclesCta })), { loading: () => <SectionSkeleton /> });

const REQUIRED_API_TIMEOUT_MS = 10000;
const OPTIONAL_API_TIMEOUT_MS = 8000;
const COURT_ACTORS_API_TIMEOUT_MS = 15000;
const ACTOR_PAGE_SIZE = 50;

type StateRow = {
  state: string;
  is_us: boolean;
  total_submissions: number;
  approved_count: number;
  avg_financial_loss: number | null;
  total_financial_loss: number | null;
  avg_months_lost: number | null;
  total_loss_count: number;
  pro_se_count: number;
  last_submission_at: string;
};

type PublicQuote = {
  id: string;
  quote: string;
  attribution: string;
  state: string | null;
  county: string | null;
  created_at: string;
};

type StateResource = {
  state_code: string;
  state_name: string;
  drive_folder_url: string;
  report_available: boolean;
  report_title: string | null;
};

type OptionalApiResult<T> = {
  data: T | null;
  warning: string | null;
};

type ApiWarning = {
  key: string;
  message: string;
};

function SectionSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-3 rounded-2xl p-5" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,245,245,0.08)" }}>
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

function LazyInView({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { rootMargin: "200px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return <div ref={ref}>{visible ? children : (fallback ?? <SectionSkeleton />)}</div>;
}

type StatsResponse = {
  total?: number;
  by_state?: StateRow[];
  warning?: string;
  data_mode?: "live" | "snapshot";
  snapshot_generated_at?: string;
  snapshot_rows_total?: number;
  snapshot_unallocated_submissions?: number;
  snapshot_total_financial_loss?: number;
};

// ============================================================================
// AnimatedCounter - counts up from 0 to target value
// ============================================================================

function AnimatedCounter({ 
  value, 
  duration = 1500, 
  prefix = "",
  suffix = "",
  formatFn,
}: { 
  value: number; 
  duration?: number;
  prefix?: string;
  suffix?: string;
  formatFn?: (n: number) => string;
}) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.floor(easeOut * value);

      if (currentValue !== countRef.current) {
        countRef.current = currentValue;
        setCount(currentValue);
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else if (countRef.current !== value) {
        setCount(value);
      }
    };

    countRef.current = 0;
    startTimeRef.current = null;
    requestAnimationFrame(animate);
  }, [value, duration]);

  const displayValue = formatFn ? formatFn(count) : count.toLocaleString();
  return <>{prefix}{displayValue}{suffix}</>;
}

// ============================================================================
// Loading spinner
// ============================================================================

function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ============================================================================
// DashboardSkeleton - loading state that matches the real layout
// ============================================================================

function DashboardSkeleton() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: BG }}>
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "url('/swm/swm-banner.webp')",
        backgroundSize: "cover", backgroundPosition: "center", opacity: 0.06, zIndex: 0,
      }} />

      {/* Gold top bar */}
      <div className="relative z-10 h-1" style={{ backgroundColor: GOLD }} />

      {/* Sticky top bar skeleton */}
      <div className="sticky top-0 z-40 px-6 py-3 flex items-center justify-between backdrop-blur"
        style={{
          backgroundColor: "rgba(15,30,48,0.85)",
          borderBottom: "1px solid rgba(201,162,39,0.15)",
        }}>
        <div className="flex items-center gap-2">
          <Skeleton variant="rectangular" width={28} height={28} />
          <Skeleton variant="text" width={120} height={14} className="hidden sm:block" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton variant="rectangular" width={120} height={36} />
        </div>
      </div>

      {/* Header skeleton */}
      <header className="relative z-10 px-6 py-8 border-b" style={{ borderColor: "rgba(201,162,39,0.2)" }}>
        <div className="max-w-5xl mx-auto text-center">
          <div className="mb-4 flex items-center justify-center gap-3 text-white">
            <Spinner className="w-5 h-5" />
            <span className="text-sm font-black uppercase tracking-wide">Loading report data...</span>
          </div>
          <Skeleton variant="text" width="60%" height={36} className="mx-auto mb-3" />
          <Skeleton variant="text" width="80%" height={16} className="mx-auto mb-2" />
          <Skeleton variant="text" width="70%" height={16} className="mx-auto mb-6" />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Skeleton variant="rectangular" width={140} height={44} />
            <Skeleton variant="rectangular" width={180} height={44} />
            <Skeleton variant="rectangular" width={200} height={44} />
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Data ownership banner skeleton */}
        <Skeleton variant="rectangular" width="100%" height={60} />

        {/* Stat Cards Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl p-6"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <Skeleton variant="text" width="70%" height={12} className="mb-4" />
              <Skeleton variant="text" width="50%" height={40} className="mb-2" />
              <Skeleton variant="text" width="60%" height={12} />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="rounded-2xl p-6" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <Skeleton variant="text" width={200} height={24} className="mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton variant="text" width="15%" height={20} />
                <Skeleton variant="text" width="20%" height={20} />
                <Skeleton variant="text" width="25%" height={20} />
                <Skeleton variant="text" width="20%" height={20} />
                <Skeleton variant="text" width="20%" height={20} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Motion variants for card hover effects
// ============================================================================

const cardHoverVariants = {
  initial: { 
    y: 0,
    boxShadow: "0 0 0 rgba(201,162,39,0)",
  },
  hover: { 
    y: -4,
    boxShadow: shadows.goldGlow,
    transition: { duration: 0.2, ease: [0, 0, 0.2, 1] as const },
  },
};

const staggerContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const staggerItemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.4, ease: [0, 0, 0.2, 1] as const },
  },
};

function isGeneratedSnapshotWarning(message: string | null | undefined) {
  if (!message) return false;
  return /showing the latest generated public .*snapshot/i.test(message);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

type DashboardViewProps = {
  initialCourtActors: ReportInitialCourtActors;
};

export function DashboardView({ initialCourtActors }: DashboardViewProps) {
  const [total, setTotal] = useState(0);
  const [byState, setByState] = useState<StateRow[]>([]);
  const [quotes, setQuotes] = useState<PublicQuote[]>([]);
  const [resources, setResources] = useState<StateResource[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [courtActorCounts, setCourtActorCounts] = useState<Record<string, number>>(
    initialCourtActors.counts,
  );
  const [publicActors, setPublicActors] = useState<PublicActor[]>(initialCourtActors.actors);
  const [actorThreshold, setActorThreshold] = useState(initialCourtActors.threshold);
  const [actorOffset, setActorOffset] = useState(initialCourtActors.actors.length);
  const [actorTotal, setActorTotal] = useState(initialCourtActors.total);
  const [loadingMoreActors, setLoadingMoreActors] = useState(false);
  const [warnings, setWarnings] = useState<ApiWarning[]>([]);
  const [dataMode, setDataMode] = useState<"live" | "snapshot">("live");
  const [snapshotUnallocatedSubmissions, setSnapshotUnallocatedSubmissions] = useState(0);
  const [snapshotTotalLoss, setSnapshotTotalLoss] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actorListState, setActorListState] = useState<string | null>(null);

  const hasMoreActors = actorOffset < actorTotal;

  const loadMoreActors = useCallback(async () => {
    if (loadingMoreActors || !hasMoreActors) return;
    setLoadingMoreActors(true);
    try {
      const res = await fetchWithTimeout(
        `/api/survey/court-actors?limit=${ACTOR_PAGE_SIZE}&offset=${actorOffset}&v=2`,
        COURT_ACTORS_API_TIMEOUT_MS,
      );
      const data = await res.json().catch(() => null) as { actors?: PublicActor[]; total?: number; threshold?: number; pagination?: { has_more?: boolean } } | null;
      if (res.ok && data) {
        const actors = data.actors ?? [];
        setPublicActors(prev => [...prev, ...actors]);
        setActorOffset(prev => prev + actors.length);
        setActorTotal(data.total ?? actorTotal);
        if (typeof data.threshold === "number") setActorThreshold(data.threshold);
      } else {
        setWarnings(prev => [...prev, { key: "court-actors-more", message: "Could not load more court actor patterns. Try again." }]);
      }
    } catch {
      setWarnings(prev => [...prev, { key: "court-actors-more", message: "Court actor patterns took too long to load. Try again." }]);
    } finally {
      setLoadingMoreActors(false);
    }
  }, [actorOffset, actorTotal, hasMoreActors, loadingMoreActors]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const statsRes = await fetchWithTimeout("/api/survey", REQUIRED_API_TIMEOUT_MS);
      const statsData = await statsRes.json().catch(() => null) as StatsResponse | null;
      const optionalWarnings: ApiWarning[] = [];
      if (!statsRes.ok || !statsData) {
        // Degraded: continue rendering everything else; top stats will show 0 + warning.
        optionalWarnings.push({ key: "movement-stats", message: "Movement totals are temporarily unavailable. Other data below is live." });
      } else if (statsData.warning && !isGeneratedSnapshotWarning(statsData.warning)) {
        optionalWarnings.push({ key: "movement-stats", message: statsData.warning });
      }
      // Do NOT early-return on stats failure — render the rest of the dashboard (court actors etc.).
      async function readOptional<T>(
        url: string,
        key: string,
        label: string,
        timeoutMs = OPTIONAL_API_TIMEOUT_MS,
      ): Promise<OptionalApiResult<T>> {
        let res: Response;
        try {
          res = await fetchWithTimeout(url, timeoutMs);
        } catch {
          optionalWarnings.push({ key, message: `${label} took too long to load. The dashboard is showing the rest of the data.` });
          return { data: null, warning: null };
        }
        let data: T | null = null;
        try {
          data = await res.json();
        } catch {
          optionalWarnings.push({ key, message: `${label} could not be read. The dashboard is showing the rest of the data.` });
          return { data: null, warning: null };
        }
        const warning = typeof (data as { warning?: unknown })?.warning === "string"
          ? (data as { warning: string }).warning
          : null;
        if (!res.ok) {
          optionalWarnings.push({ key, message: `${label} could not load. The dashboard is showing the rest of the data.` });
          return { data: null, warning };
        }
        if (warning && !isGeneratedSnapshotWarning(warning)) {
          optionalWarnings.push({ key, message: warning });
        }
        return { data, warning };
      }

      const [quotesData, resourcesData, countsData, actorCountsData, actorsData] = await Promise.all([
        readOptional<{ quotes?: PublicQuote[] }>("/api/survey/quotes", "quotes", "Public quotes"),
        readOptional<{ resources?: StateResource[] }>("/api/state-resources", "resources", "State report links"),
        readOptional<{ counts?: Record<string, number> }>("/api/survey/quote-counts", "quote-counts", "Quote counts"),
        readOptional<{ counts?: Record<string, number> }>(
          "/api/survey/court-actors?counts_only=1&v=2",
          "court-actor-counts",
          "Court actor counts",
          COURT_ACTORS_API_TIMEOUT_MS,
        ),
        readOptional<{ actors?: PublicActor[]; total?: number; threshold?: number; pagination?: { has_more?: boolean } }>(
          `/api/survey/court-actors?limit=${ACTOR_PAGE_SIZE}&offset=0&v=2`,
          "court-actors",
          "Court actor patterns",
          COURT_ACTORS_API_TIMEOUT_MS,
        ),
      ]);
      setTotal((statsData?.total ?? 0) || 0);
      setByState(statsData?.by_state ?? []);
      setDataMode(statsData && statsData.data_mode === "snapshot" ? "snapshot" : "live");
      setSnapshotUnallocatedSubmissions(Number(statsData?.snapshot_unallocated_submissions ?? 0) || 0);
      setSnapshotTotalLoss(Number(statsData?.snapshot_total_financial_loss ?? 0) || 0);
      setQuotes(quotesData.data?.quotes ?? []);
      setResources(resourcesData.data?.resources ?? []);
      setCommentCounts(countsData.data?.counts ?? {});
      if (actorCountsData.data?.counts) {
        setCourtActorCounts(actorCountsData.data.counts);
      }
      const actors = actorsData.data?.actors ?? [];
      if (actors.length > 0) {
        setPublicActors(actors);
        setActorOffset(actors.length);
        setActorTotal(actorsData.data?.total ?? actors.length);
        if (typeof actorsData.data?.threshold === "number") {
          setActorThreshold(actorsData.data.threshold);
        }
      } else if (actorsData.data === null) {
        optionalWarnings.push({
          key: "court-actors",
          message: "Court actor patterns could not refresh live. Showing the latest server snapshot.",
        });
      }
      setWarnings(optionalWarnings);
    } catch {
      // Soft fail: still show court actors and other sections with a warning instead of a blocking error screen.
      setWarnings(prev => [...prev, { key: "dashboard", message: "Some dashboard data could not load right now." }]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const usStates = byState.filter(r => r.is_us);
  const intlCountries = byState.filter(r => !r.is_us);
  const rowsLoss = byState.reduce((sum, r) => sum + (Number(r.total_financial_loss) || 0), 0);
  const statesOver30 = usStates.filter(r => r.total_submissions >= 30).length;
  const isSnapshot = dataMode === "snapshot";
  // In snapshot mode the per-row totals can be incomplete, so prefer the
  // pre-aggregated capped total the fallback carries. Live mode always sums
  // the rows it received.
  const totalLoss = isSnapshot && snapshotTotalLoss > 0 ? snapshotTotalLoss : rowsLoss;
  const hasSnapshotOnlyLoss = isSnapshot && totalLoss === 0;

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: BG }}>
        <div className="w-full max-w-sm rounded-2xl p-8 text-center"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(185,28,28,0.4)" }}>
          <div className="font-black text-white text-lg mb-2">Something went wrong</div>
          <div className="text-sm mb-4" style={{ color: "rgba(245,245,245,0.5)" }}>{error}</div>
          <button onClick={load}
            className="px-6 py-2 rounded-lg font-bold text-sm"
            style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: `1px solid rgba(201,162,39,0.3)` }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG }}>
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "url('/swm/swm-banner.webp')",
        backgroundSize: "cover", backgroundPosition: "center", opacity: 0.06, zIndex: 0,
      }} />

      {/* Gold top bar */}
      <div className="relative z-10 h-1" style={{ backgroundColor: GOLD }} />

      {/* Sticky top bar — always-visible "Share Your Story" CTA */}
      <div className="sticky top-0 z-40 px-6 py-3 flex items-center justify-between backdrop-blur"
        style={{
          backgroundColor: "rgba(15,30,48,0.85)",
          borderBottom: "1px solid rgba(201,162,39,0.15)",
        }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-red-700 rounded-md flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-white font-black text-sm tracking-wide hidden sm:inline">STAND WITH MEG</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <a href="/connect"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline text-xs font-semibold tracking-wide transition-opacity hover:opacity-80"
            style={{ color: "rgba(201,162,39,0.85)" }}>
            Connect
          </a>
          <a href="/partners"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline text-xs font-semibold tracking-wide transition-opacity hover:opacity-80"
            style={{ color: "rgba(201,162,39,0.85)" }}>
            Partner with us
          </a>
          <a href="/survey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs md:text-sm px-4 py-2 rounded-lg font-bold tracking-wide transition-colors hover:opacity-90"
            style={{ backgroundColor: "#B91C1C", color: "white" }}>
            Share Your Story →
          </a>
        </div>
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-8 border-b" style={{ borderColor: "rgba(201,162,39,0.2)" }}>
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-black text-white leading-tight mb-3">
            The Impact of Family Court
          </h1>
          <p className="text-sm md:text-base max-w-2xl mx-auto mb-6" style={{ color: "rgba(245,245,245,0.55)" }}>
            Real data from real families documenting what is happening inside our family court
            and child welfare systems across the country.
          </p>

          {/* Hero CTAs: share personally, browse the registry, donate, or invite someone else */}
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3">
            <a href="/survey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-bold text-sm transition-colors hover:opacity-90"
              style={{ backgroundColor: "#B91C1C", color: "white" }}>
              Share Your Story →
            </a>
            <a href="/actors"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-bold text-sm transition-colors hover:opacity-90"
              style={{
                backgroundColor: "rgba(201,162,39,0.18)",
                color: GOLD,
                border: `1px solid ${GOLD}`,
              }}>
              Track the Court Actors →
            </a>
            <a href={DONATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-bold text-sm transition-colors hover:opacity-90"
              style={{ backgroundColor: GOLD, color: BG }}>
              Donate to Keep This Public →
            </a>
            <SponsorCtaButton newTab />
            <button onClick={() => setInviteOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-bold text-sm transition-colors"
              style={{
                backgroundColor: "rgba(201,162,39,0.12)",
                color: GOLD,
                border: `1px solid rgba(201,162,39,0.4)`,
              }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Know Someone Affected? Invite Them
            </button>
          </div>

          {/* Mini donate ask — primes the gold Donate button above */}
          <p className="text-xs md:text-sm mt-5 max-w-lg mx-auto italic leading-relaxed"
            style={{ color: "rgba(201,162,39,0.7)" }}>
            Donations help keep the Stand With Meg registry, public dashboard, state reports, and family-submitted documentation online, searchable, and free for the families who need it.
          </p>
        </div>
      </header>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Data ownership banner */}
        <div className="rounded-xl px-5 py-3"
          style={{ backgroundColor: "rgba(201,162,39,0.08)", border: `1px solid rgba(201,162,39,0.2)` }}>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(201,162,39,0.8)" }}>
            Stand With Meg data and reports are compiled from submitted family experiences in the family court
            and child welfare system. This data belongs to the families who shared it and to Stand With Meg.
            Unauthorized reproduction, scraping, or commercial use is prohibited.
          </p>
        </div>

        {/* How to use this page — small click-to-play short for first-time visitors */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-4 sm:flex-row sm:items-center"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,162,39,0.22)" }}
        >
          <div
            className="w-40 sm:w-44 flex-shrink-0 aspect-[9/16] rounded-xl overflow-hidden mx-auto sm:mx-0"
            style={{ border: "1px solid rgba(201,162,39,0.25)" }}
          >
            <iframe
              className="w-full h-full"
              src={HOW_TO_USE_VIDEO_EMBED_URL}
              title="How to use the Stand With Meg report page"
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: GOLD }}>
              New here?
            </p>
            <h2 className="text-base md:text-lg font-black text-white mb-1.5">
              How to use this page
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(245,245,245,0.65)" }}>
              A quick walkthrough &mdash; under a minute &mdash; of what you can see here and how to put
              it in front of your state legislators.
            </p>
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="rounded-xl px-5 py-3"
            style={{ backgroundColor: "rgba(201,162,39,0.10)", border: "1px solid rgba(201,162,39,0.28)" }}>
            <div className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: GOLD }}>
              {isSnapshot ? "Live data unavailable" : "Partial data loaded"}
            </div>
            <ul className="space-y-1">
              {warnings.map(w => (
                <li key={w.key} className="text-xs leading-relaxed" style={{ color: "rgba(245,245,245,0.65)" }}>
                  {w.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Stat Cards */}
        <motion.div 
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          variants={staggerContainerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div 
            className="rounded-2xl p-6 cursor-default"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.gold.border}` }}
            variants={staggerItemVariants}
            whileHover="hover"
            initial="initial"
            animate="initial"
            custom={0}
          >
            <motion.div
              variants={cardHoverVariants}
              className="h-full"
            >
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(201,162,39,0.7)" }}>
                Families Documented
              </div>
              <div className="text-4xl font-black leading-none" style={{ color: GOLD }}>
                <AnimatedCounter value={total} />
              </div>
              <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>
                {isSnapshot ? "latest generated report snapshot" : "and counting"}
              </div>
            </motion.div>
          </motion.div>

          <motion.div 
            className="rounded-2xl p-6 cursor-default"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            variants={staggerItemVariants}
            whileHover={{ y: -4, boxShadow: "0 0 20px rgba(255,255,255,0.1)" }}
            transition={{ duration: 0.2 }}
            custom={1}
          >
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(245,245,245,0.45)" }}>
              {isSnapshot ? "Known Report Reach" : "Global Reach"}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-4xl font-black text-white leading-none">
                  <AnimatedCounter value={usStates.length} />
                </div>
                <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>
                  {isSnapshot && snapshotUnallocatedSubmissions > 0 ? "US states shown" : "US states"}
                </div>
              </div>
              <div>
                <div className="text-4xl font-black text-white leading-none">
                  <AnimatedCounter value={intlCountries.length} />
                </div>
                <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>
                  {isSnapshot && snapshotUnallocatedSubmissions > 0
                    ? `${intlCountries.length === 1 ? "country" : "countries"} shown`
                    : `${intlCountries.length === 1 ? "country" : "countries"} worldwide`}
                </div>
              </div>
            </div>
            {isSnapshot && snapshotUnallocatedSubmissions > 0 && (
              <div className="text-xs mt-3" style={{ color: "rgba(245,245,245,0.35)" }}>
                {snapshotUnallocatedSubmissions.toLocaleString()} submissions are outside the static location snapshot.
              </div>
            )}
          </motion.div>

          <motion.div 
            className="rounded-2xl p-6 relative overflow-hidden cursor-default"
            style={{ backgroundColor: "rgba(185,28,28,0.12)", border: "1px solid rgba(185,28,28,0.35)" }}
            variants={staggerItemVariants}
            whileHover={{ y: -4, boxShadow: shadows.evidenceGlow }}
            transition={{ duration: 0.2 }}
            custom={2}
          >
            <div className="text-xs font-bold uppercase tracking-widest mb-2 text-red-400">
              Total Reported Loss
            </div>
            <div className="text-2xl md:text-4xl font-black text-red-400 leading-none break-all">
              {hasSnapshotOnlyLoss ? "In state reports" : (
                <AnimatedCounter 
                  value={Math.round(totalLoss)} 
                  prefix="$" 
                  duration={2000}
                />
              )}
            </div>
            <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>
              {hasSnapshotOnlyLoss ? "generated snapshot excludes live totals" : "dollars reported by families"}
            </div>
          </motion.div>

          <motion.div 
            className="rounded-2xl p-6 cursor-default"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.gold.border}` }}
            variants={staggerItemVariants}
            whileHover="hover"
            initial="initial"
            animate="initial"
            custom={3}
          >
            <motion.div
              variants={cardHoverVariants}
              className="h-full"
            >
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(201,162,39,0.7)" }}>
                Report-Eligible States
              </div>
              <div className="text-4xl font-black leading-none" style={{ color: GOLD }}>
                <AnimatedCounter value={statesOver30} />
              </div>
              <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>states with 30+ families</div>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Donate band — sits between the headline stats and the actor list */}
        <DonateBand line={FEATURED_DONATE_LINE} className="rounded-2xl" />

        {/* National sponsors — lazy loaded below the fold */}
        <LazyInView>
          <SponsorBand placement="main_page" variant="national" />
        </LazyInView>

        {/* Print & Share kit — lazy loaded below the fold */}
        <LazyInView>
          <PrintKitBand />
        </LazyInView>

        {/* Connection Circles CTA — lazy loaded below the fold */}
        <LazyInView>
          <ConnectionCirclesCta placement="report" />
        </LazyInView>

        {/* Named Court Actor Patterns — loaded immediately after paint; pagination + sort live here */}
        <div id="court-actors">
          <CourtActorPanel
            actors={publicActors}
            threshold={actorThreshold}
            totalCount={actorTotal}
            stateCounts={courtActorCounts}
          />
        </div>
        {hasMoreActors && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={loadMoreActors}
              disabled={loadingMoreActors}
              className="rounded-xl px-6 py-3 text-sm font-black transition-opacity disabled:opacity-50"
              style={{ backgroundColor: GOLD, color: BG }}
            >
              {loadingMoreActors ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Loading...
                </span>
              ) : (
                `Load more patterns (${actorOffset.toLocaleString()} of ${actorTotal.toLocaleString()})`
              )}
            </button>
          </div>
        )}

        {/* State Table — loaded immediately after paint */}
        <div id="state-reports" className="scroll-mt-20">
          <StateTable
            byState={byState}
            resources={resources}
            commentCounts={commentCounts}
            courtActorCounts={courtActorCounts}
            actorThreshold={actorThreshold}
            onCourtActorsClick={state => setActorListState(state)}
          />
        </div>

        {/* Voices Section */}
        {quotes.length > 0 && (
          <div className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="px-6 py-4 border-b"
              style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(30,58,95,0.4)" }}>
              <h2 className="font-black text-white text-base tracking-wide">Voices From the Movement</h2>
              <p className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
                In their own words — families speaking out about what they experienced.
              </p>
            </div>
            <motion.div 
              className="grid md:grid-cols-2 gap-px" 
              style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
              variants={staggerContainerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
            >
              {quotes.slice(0, 12).map((q, index) => (
                <motion.div 
                  key={q.id} 
                  className="px-6 py-5" 
                  style={{ backgroundColor: BG }}
                  variants={staggerItemVariants}
                  custom={index}
                >
                  <blockquote className="text-sm italic pl-3"
                    style={{ borderLeft: `2px solid rgba(201,162,39,0.4)`, color: "rgba(245,245,245,0.7)" }}>
                    &ldquo;{q.quote && q.quote.length > 200 ? q.quote.slice(0, 200) + "…" : q.quote}&rdquo;
                  </blockquote>
                  <div className="mt-2 flex items-center gap-2 pl-3 flex-wrap">
                    <span className="text-xs font-semibold" style={{ color: GOLD }}>— {q.attribution}</span>
                    {q.state && (
                      <span className="text-xs" style={{ color: "rgba(245,245,245,0.3)" }}>· {q.state}</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}

        {/* Survey CTA */}
        <div className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(185,28,28,0.4)" }}>
          <div className="p-8 md:p-10 text-center"
            style={{ backgroundColor: "rgba(185,28,28,0.12)" }}>
            <h3 className="text-2xl font-black text-white mb-3">Take the Survey</h3>
            <p className="text-sm mb-3 max-w-xl mx-auto" style={{ color: "rgba(245,245,245,0.6)" }}>
              Your story matters. Every submission adds to the national evidence base.
              Takes about 5 minutes. You choose how your story is shared.
            </p>
            <a href="/survey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-base px-8 py-4 rounded-xl font-black tracking-wide transition-colors"
              style={{ backgroundColor: "#B91C1C", color: "white" }}>
              Share Your Story Now →
            </a>
          </div>
          <div className="px-6 py-3 flex items-center justify-center gap-6"
            style={{ backgroundColor: "rgba(185,28,28,0.06)", borderTop: "1px solid rgba(185,28,28,0.2)" }}>
            <div className="text-center">
              <div className="text-lg font-black" style={{ color: GOLD }}>{total.toLocaleString()}</div>
              <div className="text-xs" style={{ color: "rgba(245,245,245,0.4)" }}>families have shared</div>
            </div>
            <div className="w-px h-8" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
            <div className="text-center">
              <div className="text-lg font-black text-white">{usStates.length}</div>
              <div className="text-xs" style={{ color: "rgba(245,245,245,0.4)" }}>states</div>
            </div>
            <div className="w-px h-8" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
            <div className="text-center">
              <div className="text-lg font-black text-green-400">{quotes.length}+</div>
              <div className="text-xs" style={{ color: "rgba(245,245,245,0.4)" }}>public voices</div>
            </div>
          </div>
        </div>

        {/* Court Actor Registry CTA — every actor named, gated for survey-takers */}
        <div className="rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${GOLD}` }}>
          <div className="p-8 md:p-10 text-center"
            style={{
              background:
                "linear-gradient(180deg, rgba(201,162,39,0.14) 0%, rgba(201,162,39,0.06) 100%)",
            }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-3"
              style={{ color: "rgba(201,162,39,0.85)" }}>
              Court Actor Registry
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-white mb-4 max-w-2xl mx-auto leading-tight">
              Track the Court Actors
            </h3>
            <p className="text-sm mb-2 max-w-xl mx-auto leading-relaxed"
              style={{ color: "rgba(245,245,245,0.75)" }}>
              Every judge, attorney, GAL, evaluator, and caseworker named by Stand With Meg
              families. When <strong className="text-white">{actorThreshold} or more families</strong>{" "}
              independently name the same person, their name goes public.
            </p>
            <p className="text-sm mb-6 max-w-xl mx-auto leading-relaxed"
              style={{ color: "rgba(245,245,245,0.6)" }}>
              See if anyone on your case is here. If you&rsquo;ve already taken the survey,
              you&rsquo;re already in.
            </p>
            <a href="/actors"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-base px-8 py-4 rounded-xl font-black tracking-wide transition-colors hover:opacity-90"
              style={{ backgroundColor: GOLD, color: BG }}>
              Track the Court Actors →
            </a>
            <p className="text-xs mt-5 max-w-md mx-auto leading-relaxed italic"
              style={{ color: "rgba(245,245,245,0.4)" }}>
              Access is limited to survey-takers. Haven&rsquo;t taken it yet? Start with{" "}
              <a href="/survey" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "rgba(201,162,39,0.85)" }}>
                Share Your Story
              </a>
              .
            </p>
          </div>
        </div>

        {/* Donate */}
        <div className="rounded-2xl overflow-hidden"
          style={{ border: `1px solid rgba(201,162,39,0.4)` }}>
          <div className="p-8 md:p-10 text-center"
            style={{ backgroundColor: "rgba(201,162,39,0.10)" }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-3"
              style={{ color: "rgba(201,162,39,0.7)" }}>
              Why donations matter
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-white mb-4 max-w-2xl mx-auto leading-tight">
              Keep this record public and free.
            </h3>
            <p className="text-sm mb-4 max-w-xl mx-auto leading-relaxed" style={{ color: "rgba(245,245,245,0.7)" }}>
              Donations help keep the Stand With Meg registry, public dashboard, state reports, and family-submitted documentation online, searchable, and free for the families who need it.
            </p>
            <p className="text-sm mb-6 max-w-xl mx-auto leading-relaxed" style={{ color: "rgba(245,245,245,0.75)" }}>
              Stand With Meg runs on hosting, document storage, and the platform powering the state reports and public dashboard. Recurring contributions are what keep this record online and accessible to the families who come after.
            </p>
            <a href={DONATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-base px-8 py-4 rounded-xl font-black tracking-wide transition-colors hover:opacity-90"
              style={{ backgroundColor: GOLD, color: BG }}>
              Support the Registry →
            </a>
            <p className="text-xs mt-5 max-w-md mx-auto leading-relaxed"
              style={{ color: "rgba(245,245,245,0.4)" }}>
              PayPal and major cards accepted. Worldwide donors welcome &mdash; works in 200+ countries.
              Recurring monthly donations supported. Donations are not yet tax-deductible.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 text-center px-6 py-5 mt-4 text-xs border-t"
        style={{ color: "rgba(245,245,245,0.2)", borderColor: "rgba(255,255,255,0.06)" }}>
        <div>Stand With Meg &nbsp;·&nbsp; Courage to Stand, Power to Change &nbsp;·&nbsp; standwithmeg.com</div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <a href="/partners" target="_blank" rel="noopener noreferrer" className="font-semibold transition-opacity hover:opacity-80"
            style={{ color: "rgba(201,162,39,0.6)" }}>
            Partner with us — earn by signing sponsors →
          </a>
          <a href="/about" target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-80">About</a>
          <a href="/contact" target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-80">Contact</a>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-80">Privacy</a>
        </div>
      </footer>

      {inviteOpen && <InviteFriendModal onClose={() => setInviteOpen(false)} />}

      {actorListState && (
        <CourtActorListModal
          key={actorListState}
          state={actorListState}
          threshold={actorThreshold}
          onClose={() => setActorListState(null)}
        />
      )}
    </div>
  );
}
