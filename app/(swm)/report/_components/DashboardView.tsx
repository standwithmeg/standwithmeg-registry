"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { CourtActorPanel, CourtActorListModal, type PublicActor } from "./CourtActorPanel";
import { SponsorCtaButton } from "../../SponsorCtaButton";
import type { ReportInitialCourtActors } from "../../../../lib/report-initial-court-actors";
import { DONATION_URL } from "../../../../lib/site-links";
import { GOLD, BG } from "../../../../lib/design-tokens";
import { Skeleton } from "@/components/ui/Skeleton";
import { DonateNudge } from "@/components/dossier/DonateNudge";
import { CirclesBand } from "@/components/dossier/CirclesBand";
import { VideoWalkthroughCard } from "@/components/dossier/VideoWalkthroughCard";

const StateTable = dynamic(() => import("./StateTable").then(m => ({ default: m.StateTable })), { loading: () => <SectionSkeleton /> });
const InviteFriendModal = dynamic(() => import("./InviteFriendModal").then(m => ({ default: m.InviteFriendModal })), { loading: () => null });
const SponsorBand = dynamic(() => import("./SponsorBand").then(m => ({ default: m.SponsorBand })), { loading: () => <SectionSkeleton /> });
const PrintKitBand = dynamic(() => import("./PrintKitBand").then(m => ({ default: m.PrintKitBand })), { loading: () => <SectionSkeleton /> });

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
// Snapshot detection
// ============================================================================

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
    <div className="wrap flex flex-col gap-10 pb-16">
      {/* HERO — The Public Record */}
      <section className="pt-12" aria-labelledby="report-heading">
        <p className="eyebrow mb-5">The public record · Rebuilt with every submission</p>
        <h1 id="report-heading" className="display" style={{ fontSize: "var(--text-hero)", maxWidth: "13ch" }}>
          THE PUBLIC <span className="accent-word accent-underline">RECORD.</span>
        </h1>
        <p className="serif-note mt-7 max-w-2xl text-lg" style={{ color: "var(--ink-70)" }}>
          Real data from real families documenting what is happening inside our
          family court and child welfare systems — across the country and beyond it.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <a href="/survey" className="action-pill">
            <span className="pill-dot" aria-hidden />
            Share your story ↗
          </a>
          <a href="/actors" className="gold-pill">Track the Court Actors</a>
          <a href={DONATION_URL} target="_blank" rel="noopener noreferrer" className="btn-quiet">Donate</a>
          <button type="button" onClick={() => setInviteOpen(true)} className="btn-quiet">
            Know someone affected? Invite them
          </button>
          <SponsorCtaButton newTab />
        </div>
        <nav aria-label="Jump to section" className="mt-8 flex flex-wrap gap-2.5">
          {[["#numbers", "The numbers"], ["#court-actors", "On the public record"], ["#state-reports", "Your state"], ["#voices", "Family voices"]].map(([href, label]) => (
            <a key={href} href={href} className="badge badge--gold" style={{ padding: "0.5rem 0.95rem", textDecoration: "none" }}>
              {label} ↓
            </a>
          ))}
        </nav>
      </section>

      {/* Data ownership */}
      <p className="panel disclaimer-strip px-5 py-3.5 leading-relaxed">
        Stand With Meg data and reports are compiled from submitted family experiences
        in the family court and child welfare system. This data belongs to the families
        who shared it and to Stand With Meg. Unauthorized reproduction, scraping, or
        commercial use is prohibited.
      </p>

      {/* Video guide — Meg re-records for the new site */}
      <VideoWalkthroughCard page="report" variant="wide" />

      {warnings.length > 0 && (
        <div className="panel px-5 py-4" style={{ borderColor: "var(--hairline-gold)" }} role="status">
          <p className="eyebrow eyebrow--gold mb-2">{isSnapshot ? "Live data unavailable" : "Partial data loaded"}</p>
          <ul className="flex flex-col gap-1">
            {warnings.map(w => (
              <li key={w.key} className="text-xs leading-relaxed" style={{ color: "var(--ink-70)" }}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* THE NUMBERS */}
      <section id="numbers" aria-labelledby="numbers-heading">
        <hr className="rule-double mb-8" />
        <h2 id="numbers-heading" className="eyebrow eyebrow--muted mb-8">The movement, counted</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <div className="stat-crimson">
            <p className="stat-number"><AnimatedCounter value={total} /></p>
            <p className="stat-label">{isSnapshot ? "Families · latest snapshot" : "Families reporting"}</p>
          </div>
          <div className="stat-crimson">
            <p className="stat-number">
              <AnimatedCounter value={usStates.length} />
              <span style={{ fontSize: "0.5em", color: "var(--ink-45)" }}>{` + ${intlCountries.length} countries`}</span>
            </p>
            <p className="stat-label">{isSnapshot ? "Report reach shown" : "US states · global reach"}</p>
          </div>
          <div className="stat-crimson">
            <p className="stat-number">
              {hasSnapshotOnlyLoss ? "In state reports" : <AnimatedCounter value={Math.round(totalLoss)} prefix="$" duration={2000} />}
            </p>
            <p className="stat-label">Reported family losses</p>
          </div>
          <div className="stat-crimson">
            <p className="stat-number"><AnimatedCounter value={statesOver30} /></p>
            <p className="stat-label">States with 30+ families</p>
          </div>
        </div>
        {isSnapshot && snapshotUnallocatedSubmissions > 0 && (
          <p className="disclaimer-strip mt-4">
            {`${snapshotUnallocatedSubmissions.toLocaleString()} submissions are outside the static location snapshot.`}
          </p>
        )}
        <div className="mt-8">
          <DonateNudge seed={4} />
        </div>
      </section>

      {/* National sponsors — real slot data */}
      <LazyInView>
        <SponsorBand placement="main_page" variant="national" />
      </LazyInView>

      {/* Print & share kit */}
      <LazyInView>
        <PrintKitBand />
      </LazyInView>

      {/* How your state unlocks its report */}
      <section className="panel panel--raised p-8 md:p-10" aria-labelledby="unlock-heading">
        <div className="grid md:grid-cols-2 gap-10">
          <div>
            <h2 id="unlock-heading" className="display text-2xl md:text-3xl mb-4">
              HOW YOUR STATE GETS ITS <span className="accent-word">REPORT</span>
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--ink-70)" }}>
              At 30 family submissions, a state unlocks its own downloadable PDF report —
              the document families print for hearings and mail to their lawmakers.
              Under 30? The progress bar below shows exactly how many more voices your
              state needs.
            </p>
          </div>
          <div>
            <h3 className="display text-2xl md:text-3xl mb-4" style={{ color: "var(--gold-soft)" }}>
              COME BACK — THIS PAGE NEVER SITS STILL
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--ink-70)" }}>
              Every new submission rebuilds its state&rsquo;s PDF. The report you download
              today is not the report you&rsquo;ll download next month — it grows with
              every family who speaks up.
            </p>
          </div>
        </div>
      </section>

      {/* ON THE PUBLIC RECORD — named court actors */}
      <section id="court-actors" aria-labelledby="actors-heading">
        <hr className="rule-double mb-8" />
        <p className="eyebrow mb-2">Named by three or more unrelated families</p>
        <h2 id="actors-heading" className="display mb-8" style={{ fontSize: "var(--text-display)" }}>
          ON THE PUBLIC <span className="accent-word">RECORD</span>
        </h2>
        <CourtActorPanel
          actors={publicActors}
          threshold={actorThreshold}
          totalCount={actorTotal}
          stateCounts={courtActorCounts}
        />
        {hasMoreActors && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={loadMoreActors}
              disabled={loadingMoreActors}
              className="gold-pill disabled:opacity-50"
            >
              {loadingMoreActors ? (
                <span className="inline-flex items-center gap-2"><Spinner />Loading...</span>
              ) : (
                `Load more patterns (${actorOffset.toLocaleString()} of ${actorTotal.toLocaleString()})`
              )}
            </button>
          </div>
        )}
        <p className="disclaimer-strip mt-6">Family-reported submissions.</p>
      </section>

      {/* EVERY STATE, COUNTED */}
      <section id="state-reports" aria-labelledby="states-heading">
        <hr className="rule-double mb-8" />
        <p className="eyebrow mb-2">Find your state — or your country</p>
        <h2 id="states-heading" className="display mb-8" style={{ fontSize: "var(--text-display)" }}>
          EVERY STATE, <span className="accent-word">COUNTED</span>
        </h2>
        <StateTable
          byState={byState}
          resources={resources}
          commentCounts={commentCounts}
          courtActorCounts={courtActorCounts}
          actorThreshold={actorThreshold}
          onCourtActorsClick={state => setActorListState(state)}
        />
      </section>

      {/* FAMILY VOICES */}
      {quotes.length > 0 && (
        <section id="voices" aria-labelledby="voices-heading">
          <hr className="rule-double mb-8" />
          <h2 id="voices-heading" className="eyebrow eyebrow--muted mb-8">Voices from the movement</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {quotes.slice(0, 12).map(q => (
              <blockquote key={q.id} className="panel p-6 m-0" style={{ borderLeft: "3px solid var(--gold)" }}>
                <p className="serif-note text-base m-0" style={{ color: "var(--ink)" }}>
                  &ldquo;{q.quote && q.quote.length > 200 ? `${q.quote.slice(0, 200)}…` : q.quote}&rdquo;
                </p>
                <footer className="disclaimer-strip mt-3">
                  {`— ${q.attribution}`}{q.state ? <span> <span className="dotsep">·</span> {q.state}</span> : null}
                </footer>
              </blockquote>
            ))}
          </div>
          <p className="disclaimer-strip mt-6">Family-reported submissions.</p>
        </section>
      )}

      {/* SURVEY CTA */}
      <section className="panel panel--raised p-8 md:p-10" aria-labelledby="survey-cta-heading">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <h2 id="survey-cta-heading" className="display text-2xl md:text-3xl">
              YOUR STORY IS A <span className="accent-word">DATA POINT.</span>
            </h2>
            <p className="mt-2 text-sm max-w-xl" style={{ color: "var(--ink-70)" }}>
              About nine minutes. Fully private. You choose how your story is shared —
              and it makes the pattern impossible to dismiss.
            </p>
          </div>
          <a href="/survey" className="action-pill" style={{ fontSize: "1rem", padding: "1rem 2rem" }}>
            <span className="pill-dot" aria-hidden />
            Share your story ↗
          </a>
        </div>
        <div className="mt-7 flex flex-wrap gap-8 pt-6" style={{ borderTop: "1px solid var(--hairline)" }}>
          <div>
            <p className="stat-number" style={{ fontSize: "1.6rem", color: "var(--gold-soft)" }}>{total.toLocaleString()}</p>
            <p className="stat-label">families have shared</p>
          </div>
          <div>
            <p className="stat-number" style={{ fontSize: "1.6rem" }}>{usStates.length}</p>
            <p className="stat-label">states</p>
          </div>
          <div>
            <p className="stat-number" style={{ fontSize: "1.6rem", color: "var(--gold-soft)" }}>{`${quotes.length}+`}</p>
            <p className="stat-label">public voices</p>
          </div>
        </div>
      </section>

      {/* COURT ACTOR REGISTRY CTA */}
      <section className="panel p-8 md:p-10" style={{ borderColor: "var(--hairline-gold)" }} aria-labelledby="registry-cta-heading">
        <p className="eyebrow eyebrow--gold mb-3">The Court Actors</p>
        <h2 id="registry-cta-heading" className="display text-2xl md:text-3xl mb-4">
          TRACK THE COURT <span className="accent-word">ACTORS</span>
        </h2>
        <p className="text-sm mb-2 max-w-xl leading-relaxed" style={{ color: "var(--ink-70)" }}>
          Every judge, attorney, GAL, evaluator, and caseworker named by Stand With Meg
          families. When {actorThreshold} or more families independently name the same
          person, their name goes public.
        </p>
        <p className="text-sm mb-6 max-w-xl leading-relaxed" style={{ color: "var(--ink-45)" }}>
          See if anyone on your case is here. If you&rsquo;ve already taken the survey,
          you&rsquo;re already in.
        </p>
        <div className="flex flex-wrap items-center gap-5">
          <a href="/actors" className="gold-pill">Track the Court Actors →</a>
          <p className="disclaimer-strip m-0">
            Access is limited to survey-takers — start with <a href="/survey" style={{ color: "var(--gold-soft)" }}>Share Your Story</a>.
          </p>
        </div>
      </section>

      {/* DONATE */}
      <section className="panel p-8 md:p-10" style={{ borderColor: "var(--hairline-gold)" }} aria-labelledby="donate-heading">
        <p className="eyebrow eyebrow--gold mb-3">Why donations matter</p>
        <h2 id="donate-heading" className="display text-2xl md:text-3xl mb-4">
          KEEP THIS RECORD PUBLIC AND <span className="accent-word">FREE.</span>
        </h2>
        <p className="text-sm mb-6 max-w-xl leading-relaxed" style={{ color: "var(--ink-70)" }}>
          Donations keep the registry, the public dashboard, the state reports, and
          family-submitted documentation online, searchable, and free for the families
          who need it. Recurring contributions are what keep this record online for the
          families who come after.
        </p>
        <div className="flex flex-wrap items-center gap-5">
          <a href={DONATION_URL} target="_blank" rel="noopener noreferrer" className="gold-pill">Support the Registry →</a>
          <p className="disclaimer-strip m-0">PayPal and major cards · 200+ countries · monthly supported</p>
        </div>
      </section>

      {/* Connection Circles */}
      <CirclesBand />

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
