"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ThresholdBadge } from "./ThresholdBadge";
import { StateQuoteModal } from "./StateQuoteModal";

const GOLD = "#C9A227";
const THRESHOLD = 30;

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

type StateResource = {
  state_code: string;
  state_name: string;
  drive_folder_url: string;
  report_available: boolean;
  report_title: string | null;
};

type Props = {
  byState: StateRow[];
  resources: StateResource[];
  commentCounts: Record<string, number>;
  courtActorCounts: Record<string, number>;
  onCourtActorsClick?: (state: string) => void;
};

function fmt$(n: number | null) {
  if (n == null || n === 0) return "—";
  return "$" + n.toLocaleString();
}

function latestInState(iso: string) {
  const date = new Date(iso);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type SortHeaderProps = {
  field: keyof StateRow;
  label: string;
  sortField: keyof StateRow;
  sortDir: "asc" | "desc";
  setSortField: Dispatch<SetStateAction<keyof StateRow>>;
  setSortDir: Dispatch<SetStateAction<"asc" | "desc">>;
};

function SortHeader({ field, label, sortField, sortDir, setSortField, setSortDir }: SortHeaderProps) {
  const active = sortField === field;
  return (
    <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap transition-colors"
      style={{ color: active ? GOLD : "rgba(245,245,245,0.45)" }}
      onClick={() => {
        if (active) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortField(field); setSortDir("desc"); }
      }}>
      {label} {active ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </th>
  );
}

export function StateTable({ byState, resources, commentCounts, courtActorCounts, onCourtActorsClick }: Props) {
  const [sortField, setSortField] = useState<keyof StateRow>("total_submissions");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [quoteState, setQuoteState] = useState<StateRow | null>(null);

  const resourceMap = new Map(resources.map(r => [r.state_code, r]));

  // Click behavior: 30+ states with an uploaded report go to Drive. Everyone
  // else opens the quotes modal so people can still read what's been shared.
  function handleRowClick(row: StateRow) {
    const res = row.is_us ? resourceMap.get(row.state) : undefined;
    if (row.total_submissions >= THRESHOLD && res?.report_available && res.drive_folder_url) {
      window.open(res.drive_folder_url, "_blank", "noopener,noreferrer");
      return;
    }
    setQuoteState(row);
  }

  function sortedStates() {
    return [...byState].sort((a, b) => {
      const av = a[sortField] ?? 0, bv = b[sortField] ?? 0;
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "desc" ? -cmp : cmp;
    });
  }

  const headerProps = { sortField, sortDir, setSortField, setSortDir };

  return (
    <>
      <div className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>

        <div className="px-6 py-4 border-b"
          style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(30,58,95,0.4)" }}>
          <h2 className="font-black text-white text-base tracking-wide">Data by State</h2>
          <p className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
            States with 30+ submissions become eligible for a Family Rights Report. Click a state
            with a published report to download it. Click any other state to read what families shared.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: "rgba(30,58,95,0.6)", borderBottom: `1px solid rgba(201,162,39,0.2)` }}>
                <SortHeader field="state" label="State" {...headerProps} />
                <SortHeader field="total_submissions" label="Families" {...headerProps} />
                <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wide whitespace-nowrap"
                  style={{ color: "rgba(245,245,245,0.45)" }}>Shareable Quotes</th>
                <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wide whitespace-nowrap"
                  style={{ color: "rgba(245,245,245,0.45)" }}>Court Actors</th>
                <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wide whitespace-nowrap"
                  style={{ color: "rgba(245,245,245,0.45)" }}>Report</th>
                <SortHeader field="total_financial_loss" label="Total Loss" {...headerProps} />
                <SortHeader field="avg_months_lost" label="Avg Mos. Lost" {...headerProps} />
                <SortHeader field="total_loss_count" label="No Contact" {...headerProps} />
                <SortHeader field="pro_se_count" label="Pro Se" {...headerProps} />
                <SortHeader field="last_submission_at" label="Latest" {...headerProps} />
              </tr>
            </thead>
            <tbody>
              {sortedStates().map((row, i) => {
                const res = row.is_us ? resourceMap.get(row.state) : undefined;
                const isHighlighted = row.total_submissions >= THRESHOLD;
                const commentCount = commentCounts[row.state] ?? 0;
                const actorCount = courtActorCounts[row.state] ?? 0;
                return (
                  <tr key={`${row.is_us ? "us" : "intl"}-${row.state}`}
                    className="transition-colors cursor-pointer"
                    onClick={() => handleRowClick(row)}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      borderLeft: isHighlighted ? `3px solid ${GOLD}` : "3px solid transparent",
                      backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                    }}>
                    <td className="px-3 py-3 font-black text-sm" style={{ color: GOLD }}>{row.state}</td>
                    <td className="px-3 py-3 text-sm font-bold text-white">{row.total_submissions}</td>
                    <td className="px-3 py-3 text-sm">
                      {commentCount > 0 ? (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setQuoteState(row); }}
                          className="font-semibold text-green-400 underline-offset-2 hover:underline focus:outline-none focus:underline cursor-pointer"
                          aria-label={`Read ${commentCount} shareable ${commentCount === 1 ? "quote" : "quotes"} from ${row.state}`}
                        >
                          {commentCount} shareable {commentCount === 1 ? "quote" : "quotes"}
                        </button>
                      ) : (
                        <span style={{ color: "rgba(245,245,245,0.25)" }}>0</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      {actorCount > 0 && onCourtActorsClick ? (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); onCourtActorsClick(row.state); }}
                          className="font-semibold underline-offset-2 hover:underline focus:outline-none focus:underline cursor-pointer"
                          style={{ color: GOLD }}
                          aria-label={`View ${actorCount} public court ${actorCount === 1 ? "actor" : "actors"} for ${row.state}`}
                        >
                          {actorCount} public
                        </button>
                      ) : (
                        <span style={{ color: "rgba(245,245,245,0.25)" }}>{actorCount}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <ThresholdBadge
                        count={row.total_submissions}
                        commentCount={commentCount}
                        resourceUrl={res?.drive_folder_url}
                        reportAvailable={res?.report_available}
                      />
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold text-red-400">{fmt$(row.total_financial_loss)}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: "rgba(245,245,245,0.6)" }}>{row.avg_months_lost ?? "—"}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: "rgba(245,245,245,0.6)" }}>{row.total_loss_count}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: "rgba(245,245,245,0.6)" }}>{row.pro_se_count}</td>
                    <td className="px-3 py-3 text-xs font-semibold tabular-nums" style={{ color: "rgba(245,245,245,0.4)" }}>
                      {latestInState(row.last_submission_at)}
                    </td>
                  </tr>
                );
              })}
              {sortedStates().length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                    No data yet. Be the first to share your story.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quote modal — shown for under-30 states, or 30+ states without a report */}
      {quoteState && (
        <StateQuoteModal
          state={quoteState.state}
          isUs={quoteState.is_us}
          totalSubmissions={quoteState.total_submissions}
          resource={quoteState.is_us ? resourceMap.get(quoteState.state) : undefined}
          onClose={() => setQuoteState(null)}
        />
      )}
    </>
  );
}
