"use client";

const GOLD = "#C9A227";
const THRESHOLD = 30;

type Props = {
  count: number;           // total submissions for this location
  commentCount: number;    // approved public quotes for this location
  resourceUrl?: string | null;
  reportAvailable?: boolean;
  state: string;           // location code, for the landing-page link
};

export function ThresholdBadge({ count, commentCount, resourceUrl, reportAvailable, state }: Props) {
  // 30+ with a report — go to the STATE LANDING PAGE (not the raw PDF), so every
  // visitor passes the sponsor unit before downloading.
  if (count >= THRESHOLD && reportAvailable && resourceUrl) {
    return (
      <a href={`/report/${state}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-bold transition-colors hover:opacity-80 whitespace-nowrap"
        style={{ backgroundColor: "rgba(201,162,39,0.2)", color: GOLD, border: `1px solid rgba(201,162,39,0.4)` }}>
        Get {state} report →
      </a>
    );
  }

  // 30+ but no report uploaded yet — still link to the landing page (shows status)
  if (count >= THRESHOLD) {
    return (
      <a href={`/report/${state}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md font-bold whitespace-nowrap hover:opacity-80"
        style={{ backgroundColor: "rgba(201,162,39,0.12)", color: "rgba(201,162,39,0.8)" }}>
        See {state} report →
      </a>
    );
  }

  // Under threshold — progress bar toward 30
  const pct = Math.min(100, Math.round((count / THRESHOLD) * 100));
  return (
    <div className="inline-flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "rgba(201,162,39,0.5)" }} />
      </div>
      <span className="text-xs whitespace-nowrap" style={{ color: "rgba(245,245,245,0.35)" }}>
        {count}/{THRESHOLD}
      </span>
      {commentCount > 0 && (
        <span className="text-xs whitespace-nowrap text-green-400">
          {commentCount} voice{commentCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
