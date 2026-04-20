"use client";

import { useState, useEffect } from "react";

const GOLD = "#C9A227";

type Quote = {
  id: string;
  quote: string;
  attribution: string;
  state: string | null;
  county: string | null;
  created_at: string;
};

type StateResource = {
  state_code: string;
  drive_folder_url: string;
  report_available: boolean;
  report_title: string | null;
};

type Props = {
  state: string;
  isUs: boolean;
  totalSubmissions: number;
  resource?: StateResource | null;
  onClose: () => void;
};

type PublicActor = {
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  count: number;
};

export function StateQuoteModal({ state, isUs, totalSubmissions, resource, onClose }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [dataOnlyCount, setDataOnlyCount] = useState(0);
  const [actors, setActors] = useState<PublicActor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [quotesRes, actorsRes] = await Promise.all([
          fetch(`/api/survey/quotes?state=${encodeURIComponent(state)}&is_us=${isUs}&include_counts=true`),
          isUs
            ? fetch(`/api/survey/court-actors?state=${encodeURIComponent(state)}`)
            : Promise.resolve(new Response(JSON.stringify({ actors: [] }))),
        ]);
        const quotesData = await quotesRes.json();
        const actorsData = await actorsRes.json();
        setQuotes(quotesData.quotes ?? []);
        setDataOnlyCount(quotesData.data_only_count ?? 0);
        setActors(actorsData.actors ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [state, isUs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ backgroundColor: "#0F1E30", border: `1px solid rgba(201,162,39,0.35)` }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: `1px solid rgba(201,162,39,0.2)`, backgroundColor: "rgba(30,58,95,0.6)" }}>
          <div>
            <div className="font-black text-white text-base leading-none">{state}</div>
            <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.4)" }}>
              {totalSubmissions.toLocaleString()} total {totalSubmissions === 1 ? "family" : "families"} documented
            </div>
          </div>
          <div className="flex items-center gap-2">
            {resource?.report_available && (
              <a href={resource.drive_folder_url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg font-bold transition-colors hover:opacity-80"
                style={{ backgroundColor: "rgba(201,162,39,0.2)", color: GOLD, border: `1px solid rgba(201,162,39,0.4)` }}>
                Access State Report →
              </a>
            )}
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ color: "rgba(245,245,245,0.5)" }} aria-label="Close">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Quotes list */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: `${GOLD} transparent ${GOLD} ${GOLD}` }} />
            </div>
          )}

          {!loading && quotes.map(q => (
            <div key={q.id} className="rounded-xl p-4"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <blockquote className="text-sm italic"
                style={{ borderLeft: `2px solid rgba(201,162,39,0.5)`, paddingLeft: "12px", color: "rgba(245,245,245,0.8)" }}>
                &ldquo;{q.quote}&rdquo;
              </blockquote>
              <div className="mt-2 flex items-center gap-2 flex-wrap" style={{ paddingLeft: "14px" }}>
                <span className="text-xs font-semibold" style={{ color: GOLD }}>— {q.attribution}</span>
                {q.county && (
                  <span className="text-xs" style={{ color: "rgba(245,245,245,0.3)" }}>· {q.county}</span>
                )}
                <span className="text-xs" style={{ color: "rgba(245,245,245,0.2)" }}>
                  · {new Date(q.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </span>
              </div>
            </div>
          ))}

          {!loading && quotes.length === 0 && (
            <div className="py-10 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
              No public quotes available for {state} yet. Families have submitted data but may have chosen
              data-only participation or their quotes have not yet been approved.
            </div>
          )}

          {/* Named Court Actors — visible once a name has been reported by 5+ families */}
          {!loading && actors.length > 0 && (
            <div className="mt-6 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(201,162,39,0.2)" }}>
              <div className="px-4 py-3"
                style={{ backgroundColor: "rgba(201,162,39,0.08)", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
                <div className="font-black text-sm" style={{ color: GOLD }}>
                  Named Court Actors in {state}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
                  Court actors reported by 5+ independent families. Reporter identities are never shown.
                </div>
              </div>
              <div>
                {actors.map((a, i) => (
                  <div key={`${a.role}-${a.name}-${i}`} className="px-4 py-3 flex items-center justify-between gap-3"
                    style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-white truncate">{a.name}</div>
                      <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "rgba(245,245,245,0.5)" }}>
                        <span>{a.role}</span>
                        {a.court_or_county && <span>· {a.court_or_county}</span>}
                      </div>
                    </div>
                    <div className="text-xs font-bold whitespace-nowrap px-2.5 py-1 rounded-md"
                      style={{ backgroundColor: "rgba(185,28,28,0.18)", color: "rgb(252,165,165)" }}>
                      {a.count} families
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 text-[11px] leading-snug"
                style={{ backgroundColor: "rgba(0,0,0,0.25)", color: "rgba(245,245,245,0.35)" }}>
                These are independent reports submitted through the Stand With Meg survey. Stand With Meg does
                not verify individual cases and names are published because a pattern of reporting has emerged.
                If you believe a listing is inaccurate, contact founder@standwithmeg.com.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.02)" }}>
          <p className="text-xs" style={{ color: "rgba(245,245,245,0.35)" }}>
            Showing {quotes.length} publicly shareable {quotes.length === 1 ? "quote" : "quotes"} from {state}.
            {" "}This state has {totalSubmissions.toLocaleString()} total {totalSubmissions === 1 ? "submission" : "submissions"}
            {dataOnlyCount > 0 && ` — ${dataOnlyCount} ${dataOnlyCount === 1 ? "family" : "families"} submitted for data purposes only`}.
            {" "}Additional families may be counted in totals but are not shown here because they
            submitted without a shareable quote or have not yet been approved.
          </p>
        </div>
      </div>
    </div>
  );
}
