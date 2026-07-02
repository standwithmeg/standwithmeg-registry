"use client";

import { useCallback, useEffect, useState } from "react";

const GOLD = "#C9A227";
const BG = "#0F1E30";

type Candidate = {
  name: string;
  state_abbr: string;
  role: string;
  slug: string;
  family_count: number;
  already_deployed: boolean;
  photo_url: string | null;
  share_url: string | null;
};

type IntakeItem = {
  id: string;
  source: "desktop" | "gmail";
  filename: string;
  display_name_guess: string;
  state_abbr_guess: string | null;
  status: "matched" | "ambiguous" | "unmatched" | "needs_review";
  confidence: "high" | "medium" | "low";
  candidates: Candidate[];
  review_notes: string | null;
  created_at: string;
};

function statusLabel(status: IntakeItem["status"]) {
  switch (status) {
    case "matched": return "Matched";
    case "ambiguous": return "Ambiguous";
    case "unmatched": return "Unmatched";
    case "needs_review": return "Needs review";
  }
}

function statusColor(status: IntakeItem["status"]) {
  switch (status) {
    case "matched": return { text: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.28)" };
    case "ambiguous": return { text: "#facc15", bg: "rgba(234,179,8,0.12)", border: "rgba(234,179,8,0.28)" };
    case "needs_review": return { text: "#fb923c", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.28)" };
    default: return { text: "rgba(245,245,245,0.55)", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)" };
  }
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function actorKey(item: IntakeItem): string {
  const candidate = item.candidates[0];
  if (!candidate) return item.id;
  return `${candidate.state_abbr}:${candidate.slug}`;
}

function itemRank(item: IntakeItem): number {
  const sourceRank = item.source === "desktop" ? 2 : 0;
  const confidenceRank = item.confidence === "high" ? 2 : item.confidence === "medium" ? 1 : 0;
  return sourceRank + confidenceRank;
}

function dedupeByActor(items: IntakeItem[]): IntakeItem[] {
  const byActor = new Map<string, IntakeItem>();
  for (const item of items) {
    const key = actorKey(item);
    const existing = byActor.get(key);
    if (!existing) {
      byActor.set(key, item);
      continue;
    }
    if (itemRank(item) > itemRank(existing)) {
      byActor.set(key, item);
      continue;
    }
    if (itemRank(item) === itemRank(existing) && new Date(item.created_at).getTime() > new Date(existing.created_at).getTime()) {
      byActor.set(key, item);
    }
  }
  return Array.from(byActor.values());
}

export function PhotoIntakePanel() {
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [showReviewItems, setShowReviewItems] = useState(false);
  const [acting, setActing] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/photo-intake");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setItems((data.items ?? []) as IntakeItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function processOne(item: IntakeItem, candidateIndex = 0) {
    setActing(prev => ({ ...prev, [item.id]: "processing" }));
    setResult(null);
    try {
      const res = await fetch("/api/admin/photo-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process-one", id: item.id, candidate_index: candidateIndex, dry_run: dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActing(prev => ({ ...prev, [item.id]: "" }));
    }
  }

  async function processAll() {
    if (!dryRun && !window.confirm("Deploy/replace photos for all matched items and queue regeneration? This commits to main.")) {
      return;
    }
    setActing(prev => ({ ...prev, __all: "processing" }));
    setResult(null);
    try {
      const res = await fetch("/api/admin/photo-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process", dry_run: dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActing(prev => ({ ...prev, __all: "" }));
    }
  }

  const isReadyForMissingPhoto = (item: IntakeItem) => {
    const candidate = item.candidates[0];
    return item.status === "matched" && !!candidate && !candidate.photo_url;
  };
  const allReadyItems = items.filter(isReadyForMissingPhoto);
  const readyItems = dedupeByActor(allReadyItems);
  const hiddenDuplicateCount = allReadyItems.length - readyItems.length;
  const reviewItems = items.filter(i => !isReadyForMissingPhoto(i));
  const matchedCount = items.filter(i => i.status === "matched").length;
  const reviewCount = items.filter(i => i.status === "needs_review" || i.status === "ambiguous").length;
  const unmatchedCount = items.filter(i => i.status === "unmatched").length;
  const visibleItems = showReviewItems ? [...readyItems, ...reviewItems] : readyItems;

  return (
    <div className="rounded-[2rem] p-5 mt-6" style={{ backgroundColor: BG, border: "1px solid rgba(201,162,39,0.2)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: GOLD }}>Photo intake</p>
          <h2 className="mt-2 text-xl font-black text-white">Court-Actor Photo Drop</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs" style={{ color: "rgba(245,245,245,0.7)" }}>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={e => setDryRun(e.target.checked)}
              className="accent-amber-500"
            />
            Dry-run
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-xs px-3 py-2 rounded-lg font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: "1px solid rgba(201,162,39,0.4)" }}
          >
            {loading ? "Scanning…" : "Refresh"}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs" style={{ color: "rgba(245,245,245,0.5)" }}>
        Scans the Desktop drop folder and Gmail for court-actor photo replies, then shows deploy-ready matches only when the actor is public and missing a photo.
        Items that already have photos or need manual review stay hidden unless you open the review list.
      </p>

      <div className="mt-4 flex flex-wrap gap-3 text-xs" style={{ color: "rgba(245,245,245,0.7)" }}>
        <span><strong style={{ color: GOLD }}>{items.length}</strong> total</span>
        <span><strong style={{ color: "#4ade80" }}>{readyItems.length}</strong> ready missing-photo matches</span>
        <span><strong style={{ color: "#4ade80" }}>{matchedCount}</strong> matched</span>
        <span><strong style={{ color: "#fb923c" }}>{reviewCount}</strong> needs review</span>
        <span><strong style={{ color: "rgba(245,245,245,0.55)" }}>{unmatchedCount}</strong> unmatched</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: "rgba(245,245,245,0.62)" }}>
        <span className="rounded-lg px-3 py-2" style={{ backgroundColor: dryRun ? "rgba(201,162,39,0.12)" : "rgba(34,197,94,0.1)", border: `1px solid ${dryRun ? "rgba(201,162,39,0.28)" : "rgba(34,197,94,0.22)"}` }}>
          {dryRun
            ? "Dry-run is on: buttons only test what would happen. Nothing is changed live."
            : "Live deploy mode: approved photo deploys can update the site and queue regeneration."}
        </span>
        {reviewItems.length > 0 && (
          <button
            type="button"
            onClick={() => setShowReviewItems(v => !v)}
            className="rounded-lg px-3 py-2 font-bold transition-opacity hover:opacity-80"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.8)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            {showReviewItems ? "Hide review items" : `Show ${reviewItems.length} review/already-photo items`}
          </button>
        )}
        {hiddenDuplicateCount > 0 && (
          <span className="rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            Hidden duplicate Gmail matches: {hiddenDuplicateCount}
          </span>
        )}
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-2 text-sm text-red-100">{error}</p>}

      {result && (
        <pre className="mt-3 rounded-xl p-3 text-xs whitespace-pre-wrap break-words" style={{ backgroundColor: "rgba(0,0,0,0.2)", color: "rgba(245,245,245,0.7)" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      <div className="mt-4 space-y-4">
        {items.length === 0 && !loading && (
          <p className="text-sm" style={{ color: "rgba(245,245,245,0.5)" }}>No photos waiting in intake.</p>
        )}

        {items.length > 0 && readyItems.length === 0 && !showReviewItems && !loading && (
          <p className="text-sm" style={{ color: "rgba(245,245,245,0.5)" }}>
            No deploy-ready missing-photo matches. {reviewItems.length} item{reviewItems.length === 1 ? "" : "s"} need review, are unmatched, or already have a photo.
          </p>
        )}

        {visibleItems.map(item => {
          const s = statusColor(item.status);
          return (
            <div key={item.id} className="rounded-2xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-black text-white truncate">{item.filename}</div>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: s.text, backgroundColor: s.bg, border: `1px solid ${s.border}` }}
                    >
                      {statusLabel(item.status)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.4)" }}>{item.source}</span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.55)" }}>
                    Guess: {item.display_name_guess}{item.state_abbr_guess ? ` · ${item.state_abbr_guess}` : ""} · {timeAgo(item.created_at)}
                  </div>
                  {item.review_notes && (
                    <div className="mt-1 text-xs" style={{ color: "#fbbf24" }}>⚠️ {item.review_notes}</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.status === "matched" && item.candidates[0] && (
                    <button
                      type="button"
                      onClick={() => void processOne(item, 0)}
                      disabled={!!acting[item.id] || !!acting.__all}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                      style={{ backgroundColor: GOLD, color: "#091625" }}
                    >
                      {acting[item.id] ? "…" : dryRun ? "Dry-run deploy" : "Deploy"}
                    </button>
                  )}
                  {item.status === "ambiguous" && item.candidates.map((c, idx) => (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => void processOne(item, idx)}
                      disabled={!!acting[item.id] || !!acting.__all}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                      style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.9)", border: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      {acting[item.id] ? "…" : `Use ${c.name}`}
                    </button>
                  ))}
                </div>
              </div>

              {item.candidates.length > 0 && (
                <div className="mt-3 text-xs" style={{ color: "rgba(245,245,245,0.5)" }}>
                  {item.status === "ambiguous" ? "Candidates:" : "Matched actor:"}
                  <ul className="mt-1 space-y-0.5">
                    {item.candidates.map(c => (
                      <li key={c.slug} className="text-white/70">
                        {c.name} · {c.role} · {c.state_abbr} · {c.family_count} families · {c.already_deployed ? (c.photo_url ? "photo already deployed" : "deployed, no photo") : "not yet deployed"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {readyItems.length > 0 && (
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => void processAll()}
            disabled={!!acting.__all || loading}
            className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: "#091625" }}
          >
            {acting.__all ? "Processing…" : dryRun ? `Dry-run all ${readyItems.length} missing-photo matches` : `Deploy all ${readyItems.length} missing-photo matches`}
          </button>
        </div>
      )}
    </div>
  );
}
