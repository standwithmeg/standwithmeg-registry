"use client";

import { useState, useEffect, useCallback } from "react";
import { StateTable } from "./StateTable";
import { InviteFriendModal } from "./InviteFriendModal";
import { CourtActorPanel, CourtActorListModal, type PublicActor } from "./CourtActorPanel";

const GOLD = "#C9A227";
const BG   = "#0F1E30";

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

function fmt$(n: number | null) {
  if (n == null || n === 0) return "—";
  return "$" + n.toLocaleString();
}

export function DashboardView() {
  const [total, setTotal] = useState(0);
  const [byState, setByState] = useState<StateRow[]>([]);
  const [quotes, setQuotes] = useState<PublicQuote[]>([]);
  const [resources, setResources] = useState<StateResource[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [courtActorCounts, setCourtActorCounts] = useState<Record<string, number>>({});
  const [publicActors, setPublicActors] = useState<PublicActor[]>([]);
  const [actorThreshold, setActorThreshold] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actorListState, setActorListState] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, quotesRes, resourcesRes, countsRes, actorsRes] = await Promise.all([
        fetch("/api/survey"),
        fetch("/api/survey/quotes"),
        fetch("/api/state-resources"),
        fetch("/api/survey/quote-counts"),
        fetch("/api/survey/court-actors"),
      ]);
      const statsData = await statsRes.json();
      const quotesData = await quotesRes.json();
      const resourcesData = await resourcesRes.json().catch(() => ({ resources: [] }));
      const countsData = await countsRes.json().catch(() => ({ counts: {} }));
      const actorsData = await actorsRes.json().catch(() => ({ actors: [] }));
      if (!statsRes.ok) { setError("Failed to load data."); return; }
      setTotal(statsData.total ?? 0);
      setByState(statsData.by_state ?? []);
      setQuotes(quotesData.quotes ?? []);
      setResources(resourcesData.resources ?? []);
      setCommentCounts(countsData.counts ?? {});
      const actors = (actorsData.actors ?? []) as PublicActor[];
      const actorCounts: Record<string, number> = {};
      for (const actor of actors) {
        const location = actor.location_key || actor.state_code;
        if (!location) continue;
        actorCounts[location] = (actorCounts[location] ?? 0) + 1;
      }
      setCourtActorCounts(actorCounts);
      setPublicActors(actors);
      if (typeof actorsData.threshold === "number") {
        setActorThreshold(actorsData.threshold);
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const usStates = byState.filter(r => r.is_us);
  const intlCountries = byState.filter(r => !r.is_us);
  const totalLoss = byState.reduce((sum, r) => sum + (Number(r.total_financial_loss) || 0), 0);
  const statesOver30 = usStates.filter(r => r.total_submissions >= 30).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BG }}>
        <div className="text-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3"
            style={{ borderColor: `${GOLD} transparent ${GOLD} ${GOLD}` }} />
          <p className="text-sm" style={{ color: "rgba(245,245,245,0.4)" }}>Loading movement data…</p>
        </div>
      </div>
    );
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
        backgroundImage: "url('/swm/swm-banner.png')",
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
        <a href="/survey"
          className="text-xs md:text-sm px-4 py-2 rounded-lg font-bold tracking-wide transition-colors hover:opacity-90"
          style={{ backgroundColor: "#B91C1C", color: "white" }}>
          Share Your Story →
        </a>
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

          {/* Hero CTAs: share personally, donate, or invite someone else */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="/survey"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-bold text-sm transition-colors hover:opacity-90"
              style={{ backgroundColor: "#B91C1C", color: "white" }}>
              Share Your Story →
            </a>
            <a href="https://www.paypal.com/ncp/payment/USXFNK3MQ2WPS"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-bold text-sm transition-colors hover:opacity-90"
              style={{ backgroundColor: GOLD, color: BG }}>
              Donate →
            </a>
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

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl p-6"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid rgba(201,162,39,0.35)` }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(201,162,39,0.7)" }}>
              Families Documented
            </div>
            <div className="text-4xl font-black leading-none" style={{ color: GOLD }}>
              {total.toLocaleString()}
            </div>
            <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>and counting</div>
          </div>

          <div className="rounded-2xl p-6"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(245,245,245,0.45)" }}>
              Global Reach
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-4xl font-black text-white leading-none">
                  {usStates.length}
                </div>
                <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>
                  US states
                </div>
              </div>
              <div>
                <div className="text-4xl font-black text-white leading-none">
                  {intlCountries.length}
                </div>
                <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>
                  {intlCountries.length === 1 ? "country" : "countries"} worldwide
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6 relative overflow-hidden"
            style={{ backgroundColor: "rgba(185,28,28,0.12)", border: "1px solid rgba(185,28,28,0.35)" }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-2 text-red-400">
              Total Reported Loss
            </div>
            <div className="text-2xl md:text-4xl font-black text-red-400 leading-none break-all">
              {fmt$(Math.round(totalLoss))}
            </div>
            <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>dollars reported by families</div>
          </div>

          <div className="rounded-2xl p-6"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid rgba(201,162,39,0.25)` }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(201,162,39,0.7)" }}>
              Report-Eligible States
            </div>
            <div className="text-4xl font-black leading-none" style={{ color: GOLD }}>
              {statesOver30}
            </div>
            <div className="text-xs mt-2" style={{ color: "rgba(245,245,245,0.35)" }}>states with 30+ families</div>
          </div>
        </div>

        {/* Named Court Actor Patterns — public, only actors named by 3+ different families */}
        <CourtActorPanel actors={publicActors} threshold={actorThreshold} />

        {/* State Table */}
        <StateTable
          byState={byState}
          resources={resources}
          commentCounts={commentCounts}
          courtActorCounts={courtActorCounts}
          onCourtActorsClick={state => setActorListState(state)}
        />

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
            <div className="grid md:grid-cols-2 gap-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
              {quotes.slice(0, 12).map(q => (
                <div key={q.id} className="px-6 py-5" style={{ backgroundColor: BG }}>
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
                </div>
              ))}
            </div>
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

        {/* Donate */}
        <div className="rounded-2xl overflow-hidden"
          style={{ border: `1px solid rgba(201,162,39,0.4)` }}>
          <div className="p-8 md:p-10 text-center"
            style={{ backgroundColor: "rgba(201,162,39,0.10)" }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-3"
              style={{ color: "rgba(201,162,39,0.7)" }}>
              Why I&rsquo;m asking
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-white mb-4 max-w-2xl mx-auto leading-tight">
              Without donations, I have to stop.
            </h3>
            <p className="text-sm mb-4 max-w-xl mx-auto leading-relaxed" style={{ color: "rgba(245,245,245,0.7)" }}>
              Stand With Meg runs on real money &mdash; hosting, document storage, the state
              reports, the platform you&rsquo;re using right now. There&rsquo;s no foundation behind this.
              No grants. No salary. Just me, paying out of pocket while raising my kids and
              fighting my own case in court.
            </p>
            <p className="text-sm mb-6 max-w-xl mx-auto leading-relaxed" style={{ color: "rgba(245,245,245,0.75)" }}>
              If everyone reading this gave just <strong className="text-white">$5</strong>, I could
              keep going. That&rsquo;s all it would take. <strong className="text-white">$5 once</strong> helps.
              <strong className="text-white"> $5 a month</strong> is what keeps this record alive
              for the families who come after.
            </p>
            <a href="https://www.paypal.com/ncp/payment/USXFNK3MQ2WPS"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-base px-8 py-4 rounded-xl font-black tracking-wide transition-colors hover:opacity-90"
              style={{ backgroundColor: GOLD, color: BG }}>
              Donate via PayPal →
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
        Stand With Meg &nbsp;·&nbsp; Courage to Stand, Power to Change &nbsp;·&nbsp; standwithmeg.com
      </footer>

      {inviteOpen && <InviteFriendModal onClose={() => setInviteOpen(false)} />}

      {actorListState && (
        <CourtActorListModal
          state={actorListState}
          actors={publicActors.filter(a => a.state_code === actorListState)}
          onClose={() => setActorListState(null)}
        />
      )}
    </div>
  );
}
