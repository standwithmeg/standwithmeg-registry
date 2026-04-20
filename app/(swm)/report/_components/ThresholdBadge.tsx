"use client";

const GOLD = "#C9A227";
const THRESHOLD = 30;

type Props = {
  count: number;           // total submissions for this state
  commentCount: number;    // approved public quotes for this state
  resourceUrl?: string | null;
  reportAvailable?: boolean;
};

export function ThresholdBadge({ count, commentCount, resourceUrl, reportAvailable }: Props) {
  // 30+ state with a downloadable report — primary action becomes "Download Report"
  if (count >= THRESHOLD && reportAvailable && resourceUrl) {
    return (
      <a href={resourceUrl} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-bold transition-colors hover:opacity-80"
        style={{ backgroundColor: "rgba(201,162,39,0.2)", color: GOLD, border: `1px solid rgba(201,162,39,0.4)` }}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
        </svg>
        Download Report
      </a>
    );
  }

  // 30+ but no report uploaded yet
  if (count >= THRESHOLD) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md font-bold"
        style={{ backgroundColor: "rgba(201,162,39,0.12)", color: "rgba(201,162,39,0.8)" }}
        title="This state has reached the 30-submission threshold but its Family Rights Report has not been uploaded yet.">
        Report Coming Soon
      </span>
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
    </div>
  );
}
