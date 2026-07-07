"use client";

import { Fragment, useState, type Dispatch, type SetStateAction } from "react";
import { motion } from "framer-motion";
import { ThresholdBadge } from "./ThresholdBadge";
import { StateQuoteModal } from "./StateQuoteModal";
import { DonateBand, DONATE_LINES } from "./DonateBand";
import { GOLD } from "../../../../lib/design-tokens";
import { US_JURISDICTION_NAMES } from "../../../../lib/us-jurisdictions";
const THRESHOLD = 30;

// Drop a donate band into the table after every Nth location row.
const DONATE_EVERY_STATES = 8;

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
  actorThreshold: number;
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

// Row stagger animation variants
const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.03,
      duration: 0.3,
      ease: [0, 0, 0.2, 1] as const,
    },
  }),
};

export function StateTable({
  byState,
  resources,
  commentCounts,
  courtActorCounts,
  actorThreshold,
  onCourtActorsClick,
}: Props) {
  const [sortField, setSortField] = useState<keyof StateRow>("total_submissions");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [quoteState, setQuoteState] = useState<StateRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const resourceMap = new Map(resources.map(r => [r.state_code, r]));

  // Click behavior: 30+ locations with an uploaded report go to the PDF. Everyone
  // else opens the quotes modal so people can still read what's been shared.
  function handleRowClick(row: StateRow) {
    const res = resourceMap.get(row.state);
    if (row.total_submissions >= THRESHOLD && res?.report_available && res.drive_folder_url) {
      window.open(res.drive_folder_url, "_blank", "noopener,noreferrer");
      return;
    }
    setQuoteState(row);
  }

  function searchableText(row: StateRow): string {
    const parts = [row.state];
    const fullName = US_JURISDICTION_NAMES[row.state as keyof typeof US_JURISDICTION_NAMES];
    if (fullName) parts.push(fullName);
    const res = resourceMap.get(row.state);
    if (res?.state_name) parts.push(res.state_name);
    return parts.join(" ").toLowerCase();
  }

  function sortedStates() {
    return [...byState].sort((a, b) => {
      const av = a[sortField] ?? 0, bv = b[sortField] ?? 0;
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "desc" ? -cmp : cmp;
    });
  }

  const headerProps = { sortField, sortDir, setSortField, setSortDir };
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const states = sortedStates().filter(row =>
    !normalizedQuery || searchableText(row).includes(normalizedQuery)
  );

  return (
    <>
      <div className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>

        <div className="px-6 py-4 border-b"
          style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(30,58,95,0.4)" }}>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className="font-black text-white text-base tracking-wide">Data by Location</h2>
              <p className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
                Locations with 30+ submissions become eligible for a Family Rights Report. Click a location
                with a published report to download it. Click any other location to read what families shared.
              </p>
            </div>
            <div className="relative w-full md:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search state or country…"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  backgroundColor: "rgba(0,0,0,0.28)",
                  border: `1px solid rgba(201,162,39,0.32)`,
                  color: "white",
                  outline: "none",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold"
                  style={{ color: GOLD }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          {normalizedQuery && (
            <p className="text-xs mt-3" style={{ color: "rgba(245,245,245,0.45)" }}>
              Showing {states.length} of {byState.length} location{byState.length === 1 ? "" : "s"} matching “{searchQuery.trim()}”.
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: "rgba(30,58,95,0.6)", borderBottom: `1px solid rgba(201,162,39,0.2)` }}>
                <SortHeader field="state" label="Location" {...headerProps} />
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
              {states.map((row, i) => {
                const res = resourceMap.get(row.state);
                const isHighlighted = row.total_submissions >= THRESHOLD;
                const commentCount = commentCounts[row.state] ?? 0;
                const actorCount = courtActorCounts[row.state] ?? 0;
                return (
                  <Fragment key={`${row.is_us ? "us" : "intl"}-${row.state}`}>
                  <motion.tr
                    className="transition-colors cursor-pointer"
                    onClick={() => handleRowClick(row)}
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    custom={i}
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
                        state={row.state}
                      />
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold text-red-400">{fmt$(row.total_financial_loss)}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: "rgba(245,245,245,0.6)" }}>{row.avg_months_lost ?? "—"}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: "rgba(245,245,245,0.6)" }}>{row.total_loss_count}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: "rgba(245,245,245,0.6)" }}>{row.pro_se_count}</td>
                    <td className="px-3 py-3 text-xs font-semibold tabular-nums" style={{ color: "rgba(245,245,245,0.4)" }}>
                      {latestInState(row.last_submission_at)}
                    </td>
                  </motion.tr>
                  {(i + 1) % DONATE_EVERY_STATES === 0 && i !== states.length - 1 && (
                    <tr>
                      <td colSpan={10} className="p-0">
                        <DonateBand line={DONATE_LINES[Math.floor(i / DONATE_EVERY_STATES) % DONATE_LINES.length]} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
              {states.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-sm" style={{ color: "rgba(245,245,245,0.3)" }}>
                    {normalizedQuery ? (
                      <>No locations match “{searchQuery.trim()}”. Try a different spelling or clear the search.</>
                    ) : (
                      "No data yet. Be the first to share your story."
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quote modal — shown for under-30 locations, or 30+ locations without a report */}
      {quoteState && (
        <StateQuoteModal
          state={quoteState.state}
          isUs={quoteState.is_us}
          totalSubmissions={quoteState.total_submissions}
          resource={resourceMap.get(quoteState.state)}
          actorThreshold={actorThreshold}
          onClose={() => setQuoteState(null)}
        />
      )}
    </>
  );
}
