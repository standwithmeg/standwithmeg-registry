"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { courtActorComplaintPacketUrl } from "../../../../lib/complaint-routing/courtActorPacketId";
import { DonateBand, DONATE_LINES } from "./DonateBand";

const GOLD = "#C9A227";
const BG = "#0F1E30";

// Drop a donate band after every Nth actor card. The actor grid is two columns,
// so an even interval keeps each donate band starting on a fresh row.
const DONATE_EVERY = 6;

export type PublicActor = {
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  count: number;
  submission_count?: number;
  latest_reported_at?: string | null;
  /**
   * URLs from court-actor-posts/_scripts/deploy_actor_to_site.py manifest.
   * When present, the actor has a deployed spotlight page + portrait.
   * When null, frontend falls back to a placeholder/initials.
   */
  photo_url?: string | null;
  share_url?: string | null;
};

type Props = {
  actors: PublicActor[];
  threshold: number;
  totalCount?: number;
  /** Authoritative per-state totals from the court-actors API (not the loaded page slice). */
  stateCounts?: Record<string, number>;
};

type AnonymousNote = {
  note: string;
  month: string;
};

type SortMode = "newest" | "families" | "state" | "name";

type StateOption = {
  key: string;
  label: string;
  count: number;
};

const STATE_LABEL: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

function actorLocationLabel(actor: PublicActor): string {
  const location = actor.location_key || actor.state_code;
  if (!location) return "";
  return STATE_LABEL[location] ?? location;
}

function actorSearchBlob(actor: PublicActor): string {
  return [
    actor.name,
    actor.role,
    actor.state_code,
    actor.location_key,
    actorLocationLabel(actor),
    actor.court_or_county,
  ].filter(Boolean).join(" ").toLowerCase();
}

function actorLocationKey(actor: PublicActor): string | null {
  return actor.location_key || actor.state_code || null;
}

function connectUrlForActor(actor: PublicActor): string {
  const params = new URLSearchParams({
    from: "report",
    actor: actor.name,
    role: actor.role,
  });
  if (actor.state_code) params.set("state", actor.state_code);
  return `/connect?${params.toString()}`;
}

function submissionCount(actor: PublicActor): number {
  return actor.submission_count ?? actor.count;
}

const COURT_ACTORS_API_VERSION = "v=2";
const STATE_ACTORS_FETCH_TIMEOUT_MS = 15_000;

/** Load every public actor for one state — avoids paginating the global newest-first list. */
export async function fetchCourtActorsForState(state: string): Promise<PublicActor[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), STATE_ACTORS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `/api/survey/court-actors?state=${encodeURIComponent(state)}&limit=1000&${COURT_ACTORS_API_VERSION}`,
      { signal: controller.signal },
    );
    if (!res.ok) return [];
    const data = await res.json() as { actors?: PublicActor[] };
    return data.actors ?? [];
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}

function sortActors(actors: PublicActor[], sortMode: SortMode): PublicActor[] {
  return [...actors].sort((a, b) => {
    if (sortMode === "newest") {
      const newest = (b.latest_reported_at ?? "").localeCompare(a.latest_reported_at ?? "");
      return newest || submissionCount(b) - submissionCount(a) || a.name.localeCompare(b.name);
    }
    if (sortMode === "families") {
      return submissionCount(b) - submissionCount(a) || a.name.localeCompare(b.name);
    }
    if (sortMode === "state") {
      return actorLocationLabel(a).localeCompare(actorLocationLabel(b))
        || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });
}

export function CourtActorPanel({ actors, threshold, totalCount, stateCounts }: Props) {
  const displayTotal = totalCount ?? actors.length;
  const [openActor, setOpenActor] = useState<PublicActor | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [search, setSearch] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [stateScopedActors, setStateScopedActors] = useState<PublicActor[] | null>(null);
  const [stateScopedLoading, setStateScopedLoading] = useState(false);

  const selectStateLocation = useCallback((key: string | null) => {
    setSelectedLocation(key);
    if (!key) {
      setStateScopedActors(null);
      setStateScopedLoading(false);
      return;
    }
    setStateScopedActors(null);
    setStateScopedLoading(true);
  }, []);

  useEffect(() => {
    if (!selectedLocation) return;
    let cancelled = false;
    fetchCourtActorsForState(selectedLocation)
      .then(fetched => {
        if (!cancelled) setStateScopedActors(fetched);
      })
      .finally(() => {
        if (!cancelled) setStateScopedLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedLocation]);

  const stateOptions = useMemo(() => {
    const counts = new Map<string, number>();
    if (stateCounts && Object.keys(stateCounts).length > 0) {
      for (const [location, count] of Object.entries(stateCounts)) {
        if (count > 0) counts.set(location, count);
      }
    } else {
      for (const actor of actors) {
        const location = actorLocationKey(actor);
        if (!location) continue;
        counts.set(location, (counts.get(location) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([key, count]): StateOption => ({
        key,
        label: STATE_LABEL[key] ?? key,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [actors, stateCounts]);

  const sortedActors = useMemo(() => {
    const actorSource = selectedLocation ? (stateScopedActors ?? []) : actors;
    const q = search.trim().toLowerCase();
    const filtered = actorSource.filter(actor => (
      q ? actorSearchBlob(actor).includes(q) : true
    ));
    return sortActors(filtered, sortMode);
  }, [actors, selectedLocation, stateScopedActors, search, sortMode]);

  const selectedStateLabel = selectedLocation ? (STATE_LABEL[selectedLocation] ?? selectedLocation) : null;
  const visibleTotal = selectedLocation
    ? (stateCounts?.[selectedLocation] ?? sortedActors.length)
    : displayTotal;

  if (actors.length === 0 && !selectedLocation) {
    return (
      <div className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,162,39,0.22)" }}>
        <div className="px-6 py-10 text-center">
          <h2 className="font-black text-white text-base tracking-wide">Named Court Actor Patterns</h2>
          <p className="text-sm mt-3 max-w-xl mx-auto" style={{ color: "rgba(245,245,245,0.55)" }}>
            Public court actor patterns are still loading or temporarily unavailable. Refresh the page in a moment,
            or open the full registry while we catch up.
          </p>
          <a
            href="/actors"
            className="inline-flex mt-5 px-5 py-2.5 rounded-lg text-sm font-bold transition-opacity hover:opacity-90"
            style={{ backgroundColor: GOLD, color: BG }}>
            Open Court Actor Registry →
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,162,39,0.22)" }}>
        <div className="px-6 py-4 border-b"
          style={{ borderColor: "rgba(201,162,39,0.16)", backgroundColor: "rgba(30,58,95,0.48)" }}>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-black text-white text-base tracking-wide">Named Court Actor Patterns</h2>
              <p className="text-xs mt-0.5 max-w-2xl" style={{ color: "rgba(245,245,245,0.45)" }}>
                Names appear after {threshold}+ different families independently named the same person in the same state.
                The number on each card is the count of survey submissions that named that actor.
                Click any card to read what families wrote — submitter identities are never shown.
              </p>
            </div>
            <div className="text-xs font-black px-3 py-1.5 rounded-md self-start md:self-auto"
              style={{ backgroundColor: "rgba(185,28,28,0.18)", color: "rgb(252,165,165)" }}>
              {displayTotal.toLocaleString()} public {displayTotal === 1 ? "pattern" : "patterns"}
            </div>
          </div>
          {stateOptions.length > 1 && (
            <div className="mt-4 rounded-xl p-4"
              style={{ backgroundColor: "rgba(201,162,39,0.07)", border: "1px solid rgba(201,162,39,0.3)" }}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-black text-white">Find your state</div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.55)" }}>
                    Tap your state to see only the court actors families named there.
                  </div>
                </div>
                <a
                  href="#state-reports"
                  className="text-xs font-bold underline-offset-2 hover:underline whitespace-nowrap"
                  style={{ color: GOLD }}>
                  Jump to state reports →
                </a>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
                <button
                  type="button"
                  onClick={() => selectStateLocation(null)}
                  className="flex-shrink-0 rounded-lg px-4 py-2.5 text-sm font-black transition-colors focus:outline-none focus:ring-1 focus:ring-amber-300/40"
                  style={{
                    backgroundColor: selectedLocation === null ? "rgba(201,162,39,0.22)" : "rgba(255,255,255,0.06)",
                    border: selectedLocation === null ? "1px solid rgba(201,162,39,0.6)" : "1px solid rgba(255,255,255,0.14)",
                    color: selectedLocation === null ? GOLD : "rgba(245,245,245,0.7)",
                  }}
                  aria-pressed={selectedLocation === null}>
                  All states
                </button>
                {stateOptions.map(option => {
                  const active = selectedLocation === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => selectStateLocation(option.key)}
                      className="flex-shrink-0 rounded-lg px-4 py-2.5 text-sm font-black transition-colors focus:outline-none focus:ring-1 focus:ring-amber-300/40"
                      style={{
                        backgroundColor: active ? "rgba(201,162,39,0.22)" : "rgba(255,255,255,0.06)",
                        border: active ? "1px solid rgba(201,162,39,0.6)" : "1px solid rgba(255,255,255,0.14)",
                        color: active ? GOLD : "rgba(245,245,245,0.7)",
                      }}
                      aria-pressed={active}
                      aria-label={`Show ${option.count} public court actor ${option.count === 1 ? "pattern" : "patterns"} in ${option.label}`}>
                      {option.key} <span style={{ color: active ? "rgba(201,162,39,0.8)" : "rgba(245,245,245,0.42)" }}>{option.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label htmlFor="court-actor-search" className="block text-[11px] font-bold uppercase tracking-wide mb-1"
                style={{ color: "rgba(245,245,245,0.45)" }}>
                Find a court actor
              </label>
              <input
                id="court-actor-search"
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, role, state, or county"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-300/40"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "white",
                }}
              />
            </div>
            <div>
              <label htmlFor="court-actor-sort" className="block text-[11px] font-bold uppercase tracking-wide mb-1"
                style={{ color: "rgba(245,245,245,0.45)" }}>
                Sort
              </label>
              <select
                id="court-actor-sort"
                value={sortMode}
                onChange={e => setSortMode(e.target.value as SortMode)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-300/40"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "white",
                }}
              >
                <option value="newest">Newest public patterns first</option>
                <option value="families">Most submissions first</option>
                <option value="state">State A-Z</option>
                <option value="name">Name A-Z</option>
              </select>
            </div>
          </div>
          <div className="mt-2 text-[11px]" style={{ color: "rgba(245,245,245,0.38)" }}>
            {stateScopedLoading && selectedLocation
              ? `Loading court actors in ${selectedStateLabel ?? selectedLocation}...`
              : `Showing ${sortedActors.length} of ${visibleTotal.toLocaleString()} public ${visibleTotal === 1 ? "pattern" : "patterns"}${selectedStateLabel ? ` in ${selectedStateLabel}` : ""}.`}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
          {stateScopedLoading && selectedLocation && sortedActors.length === 0 && (
            <div className="col-span-full px-6 py-10 text-center text-sm" style={{ color: "rgba(245,245,245,0.45)" }}>
              Loading court actors for {selectedStateLabel ?? selectedLocation}...
            </div>
          )}
          {sortedActors.map((actor, i) => {
            // When this actor has a deployed spotlight page, the card links
            // directly to it. No modal middle-step. The family-reported notes
            // already live in the downloadable state PDF and on the spotlight page.
            const key = `${actor.state_code ?? "NA"}-${actor.location_key ?? "NA"}-${actor.name}-${actor.court_or_county ?? ""}`;
            const className = "text-left px-6 py-5 transition-colors hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-amber-300/40";
            const ariaLabel = `Get the social media share template for ${actor.name}`;
            const cardInner = (
              <div className="flex items-start gap-3">
                {actor.photo_url ? (
                  <Image
                    src={actor.photo_url}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    className="rounded-full flex-shrink-0"
                    style={{ border: "1.5px solid rgba(201,162,39,0.55)", objectFit: "cover", objectPosition: "center 25%" }}
                    sizes="48px"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black"
                    style={{
                      backgroundColor: "rgba(201,162,39,0.10)",
                      border: "1.5px dashed rgba(201,162,39,0.35)",
                      color: "rgba(201,162,39,0.55)",
                    }}
                    aria-hidden="true"
                  >
                    {actor.name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {sortMode === "newest" && i < 6 && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "rgba(185,28,28,0.25)", color: "rgb(252,165,165)", border: "1px solid rgba(252,165,165,0.22)" }}>
                            NEW
                          </span>
                        )}
                        <div className="font-black text-white text-sm truncate">{actor.name}</div>
                      </div>
                      <div className="text-xs mt-1 flex flex-wrap items-center gap-1.5"
                        style={{ color: "rgba(245,245,245,0.5)" }}>
                        <span>{actor.role}</span>
                        {actor.state_code && <span>· {actor.state_code}</span>}
                        {actor.court_or_county && <span>· {actor.court_or_county}</span>}
                      </div>
                    </div>
                    <div className="text-xs font-bold whitespace-nowrap px-2.5 py-1 rounded-md self-start"
                      style={{ backgroundColor: "rgba(201,162,39,0.12)", color: GOLD, border: "1px solid rgba(201,162,39,0.25)" }}>
                      {actor.count} {actor.count === 1 ? "family" : "families"}
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] font-semibold" style={{ color: GOLD }}>
                    Click here for the social media share template →
                  </div>
                </div>
              </div>
            );
            const packetUrl = courtActorComplaintPacketUrl(actor);
            const connectUrl = connectUrlForActor(actor);
            const packetLink = (
              <>
                <Link
                  href={packetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-6 py-2 text-[11px] font-semibold transition-colors hover:bg-white/5"
                  style={{
                    color: GOLD,
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    backgroundColor: "rgba(15,30,48,0.6)",
                  }}
                  aria-label={`Open the complaint packet for ${actor.name}`}>
                  Create Complaint Packet →
                </Link>
                <Link
                  href={connectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-6 py-2 text-[11px] font-semibold transition-colors hover:bg-white/5"
                  style={{
                    color: GOLD,
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    backgroundColor: "rgba(15,30,48,0.6)",
                  }}
                  aria-label={`Connect with other families who named ${actor.name}`}>
                  Sign up to connect with families who named this person →
                </Link>
              </>
            );
            return (
              <Fragment key={key}>
                <div className="flex flex-col" style={{ backgroundColor: BG }}>
                  {actor.share_url ? (
                    <a
                      href={actor.share_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={className}
                      aria-label={ariaLabel}>
                      {cardInner}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenActor(actor)}
                      className={className}
                      aria-label={ariaLabel}>
                      {cardInner}
                    </button>
                  )}
                  {packetLink}
                </div>
                {(i + 1) % DONATE_EVERY === 0 && i !== sortedActors.length - 1 && (
                  <DonateBand
                    line={DONATE_LINES[Math.floor(i / DONATE_EVERY) % DONATE_LINES.length]}
                    className="md:col-span-2"
                  />
                )}
              </Fragment>
            );
          })}
          {sortedActors.length === 0 && (
            <div className="px-6 py-10 text-center md:col-span-2" style={{ backgroundColor: BG }}>
              <div className="font-black text-white text-sm">No matching public patterns</div>
              <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.45)" }}>
                Clear the search or choose All states to see the full public list.
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 text-[11px] leading-snug"
          style={{ backgroundColor: "rgba(0,0,0,0.22)", color: "rgba(245,245,245,0.35)" }}>
          FAMILY-REPORTED SUBMISSIONS.
        </div>
      </div>

      {openActor && (
        <CourtActorNotesModal actor={openActor} onClose={() => setOpenActor(null)} />
      )}
    </>
  );
}

type ListModalProps = {
  state: string;
  threshold: number;
  onClose: () => void;
};

export function CourtActorListModal({ state, threshold, onClose }: ListModalProps) {
  const [openActor, setOpenActor] = useState<PublicActor | null>(null);
  const [actors, setActors] = useState<PublicActor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCourtActorsForState(state)
      .then(fetched => {
        if (!cancelled) setActors(fetched);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [state]);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="relative w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
          style={{ backgroundColor: BG, border: "1px solid rgba(201,162,39,0.35)", maxHeight: "85vh" }}>

          <div className="px-6 py-4 flex items-start justify-between gap-4"
            style={{ borderBottom: "1px solid rgba(201,162,39,0.2)", backgroundColor: "rgba(30,58,95,0.6)" }}>
            <div className="min-w-0">
              <div className="font-black text-white text-base leading-tight">
                Named Court Actors — {state}
              </div>
              <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.55)" }}>
                {actors.length} {actors.length === 1 ? "person" : "people"} named by {threshold}+ different families.
                Click a card to read what families wrote — submitter identities are never shown.
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 flex-shrink-0"
              style={{ color: "rgba(245,245,245,0.5)" }} aria-label="Close">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="overflow-y-auto px-6 py-4 space-y-3">
            {loading && (
              <div className="text-sm text-center py-8" style={{ color: "rgba(245,245,245,0.4)" }}>
                Loading court actors for {state}...
              </div>
            )}
            {!loading && actors.length === 0 && (
              <div className="text-sm text-center py-8" style={{ color: "rgba(245,245,245,0.4)" }}>
                No public court actor patterns yet for {state}.
              </div>
            )}
            {actors.map(actor => {
              const connectUrl = connectUrlForActor(actor);
              return (
                <div
                  key={`${actor.state_code ?? "NA"}-${actor.location_key ?? "NA"}-${actor.name}-${actor.court_or_county ?? ""}`}
                  className="rounded-lg overflow-hidden"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <button
                    type="button"
                    onClick={() => setOpenActor(actor)}
                    className="w-full text-left px-4 py-3 transition-colors hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-amber-300/40">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <div className="font-black text-white text-sm truncate">{actor.name}</div>
                        <div className="text-xs mt-1 flex flex-wrap items-center gap-1.5"
                          style={{ color: "rgba(245,245,245,0.55)" }}>
                          <span>{actor.role}</span>
                          {actor.court_or_county && <span>· {actor.court_or_county}</span>}
                        </div>
                      </div>
                      <div className="text-xs font-bold whitespace-nowrap px-2.5 py-1 rounded-md self-start"
                        style={{ backgroundColor: "rgba(201,162,39,0.12)", color: GOLD, border: "1px solid rgba(201,162,39,0.25)" }}>
                        {actor.count} {actor.count === 1 ? "family" : "families"}
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] font-semibold" style={{ color: GOLD }}>
                      Read what families said →
                    </div>
                  </button>
                  <Link
                    href={courtActorComplaintPacketUrl(actor)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2 text-[11px] font-semibold transition-colors hover:bg-white/5"
                    style={{ color: GOLD, borderTop: "1px solid rgba(255,255,255,0.06)" }}
                    aria-label={`Open the complaint packet for ${actor.name}`}>
                    Create Complaint Packet →
                  </Link>
                  <Link
                    href={connectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2 text-[11px] font-semibold transition-colors hover:bg-white/5"
                    style={{ color: GOLD, borderTop: "1px solid rgba(255,255,255,0.06)" }}
                    aria-label={`Connect with other families who named ${actor.name}`}>
                    Sign up to connect with families who named this person →
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="px-6 py-3 text-[11px] leading-snug"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.35)" }}>
            FAMILY-REPORTED SUBMISSIONS.
          </div>
        </div>
      </div>

      {openActor && (
        <CourtActorNotesModal actor={openActor} onClose={() => setOpenActor(null)} />
      )}
    </>
  );
}

type ModalProps = {
  actor: PublicActor;
  onClose: () => void;
};

export function CourtActorNotesModal({ actor, onClose }: ModalProps) {
  const [notes, setNotes] = useState<AnonymousNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          name: actor.name,
          state: actor.state_code ?? actor.location_key ?? "",
        });
        const res = await fetch(`/api/survey/court-actors/notes?${params.toString()}`);
        const data = await res.json().catch(() => ({ notes: [] }));
        if (cancelled) return;
        if (!res.ok) {
          setError("Could not load family reports.");
          return;
        }
        setNotes(Array.isArray(data.notes) ? data.notes : []);
      } catch {
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [actor.name, actor.state_code, actor.location_key]);

  const handleSharePage = async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "https://my.standwithmeg.com/report";
    const locationLabel = actor.state_code ? ` in ${actor.state_code}` : "";
    const shareData: ShareData = {
      title: `${actor.name} — named by ${actor.count} families`,
      text: `${actor.count} families independently named ${actor.name} (${actor.role}${locationLabel}) on Stand With Meg's public record. Help amplify the pattern.`,
      url: shareUrl,
    };
    setShareStatus("idle");
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share(shareData);
        return;
      }
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "AbortError") return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus("copied");
        setTimeout(() => setShareStatus("idle"), 2500);
        return;
      }
    } catch {
      // fall through
    }
    setShareStatus("error");
    setTimeout(() => setShareStatus("idle"), 2500);
  };

  const showAmplifyState = !loading && !error && !actor.share_url && notes.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: BG, border: "1px solid rgba(201,162,39,0.35)", maxHeight: "85vh" }}>

        <div className="px-6 py-4 flex items-start justify-between gap-4"
          style={{ borderBottom: "1px solid rgba(201,162,39,0.2)", backgroundColor: "rgba(30,58,95,0.6)" }}>
          <div className="flex items-start gap-3 min-w-0">
            {actor.photo_url && (
              <Image
                src={actor.photo_url}
                alt=""
                width={48}
                height={48}
                loading="lazy"
                decoding="async"
                className="rounded-full flex-shrink-0"
                style={{ border: `2px solid ${GOLD}`, objectFit: "cover", objectPosition: "center 25%" }}
                sizes="48px"
              />
            )}
            <div className="min-w-0">
              <div className="font-black text-white text-base leading-tight">{actor.name}</div>
              <div className="text-xs mt-1 flex flex-wrap gap-1.5" style={{ color: "rgba(245,245,245,0.55)" }}>
                <span>{actor.role}</span>
                {actor.state_code && <span>· {actor.state_code}</span>}
                {actor.court_or_county && <span>· {actor.court_or_county}</span>}
                <span>· {actor.count} {actor.count === 1 ? "family" : "families"}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 flex-shrink-0"
            style={{ color: "rgba(245,245,245,0.5)" }} aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {actor.share_url && (
          <a
            href={actor.share_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-6 py-3 text-sm font-semibold transition-colors hover:opacity-90"
            style={{
              backgroundColor: GOLD,
              color: "#0F1E30",
              borderBottom: "1px solid rgba(201,162,39,0.35)",
            }}
          >
            View the full spotlight →
          </a>
        )}

        <div className="px-6 py-4 text-[11px] leading-snug"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.5)" }}>
          What families wrote when they named this person. Submitter identity, county, and contact details are never shown.
          FAMILY-REPORTED SUBMISSIONS.
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-3">
          {loading && (
            <div className="text-sm text-center py-8" style={{ color: "rgba(245,245,245,0.4)" }}>
              Loading family reports…
            </div>
          )}

          {!loading && error && (
            <div className="text-sm text-center py-8" style={{ color: "rgb(252,165,165)" }}>
              {error}
            </div>
          )}

          {showAmplifyState && (
            <div className="rounded-lg px-5 py-6 text-center space-y-4"
              style={{ backgroundColor: "rgba(201,162,39,0.06)", border: "1px solid rgba(201,162,39,0.22)" }}>
              <div className="text-sm leading-relaxed" style={{ color: "rgba(245,245,245,0.85)" }}>
                Counted by <span className="font-black" style={{ color: GOLD }}>{actor.count}</span>{" "}
                {actor.count === 1 ? "family" : "families"} who named this person but did not write a note.
                Help amplify the pattern by sharing this page.
              </div>
              <button
                type="button"
                onClick={() => { void handleSharePage(); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-300/50"
                style={{ backgroundColor: GOLD, color: "#0F1E30" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share this page
              </button>
              {shareStatus === "copied" && (
                <div className="text-xs" style={{ color: GOLD }}>Link copied to clipboard.</div>
              )}
              {shareStatus === "error" && (
                <div className="text-xs" style={{ color: "rgb(252,165,165)" }}>
                  Could not share automatically. Copy the page URL from your browser.
                </div>
              )}
            </div>
          )}

          {!loading && !error && !showAmplifyState && notes.length === 0 && (
            <div className="text-sm text-center py-8" style={{ color: "rgba(245,245,245,0.4)" }}>
              No written reports yet. {actor.count} {actor.count === 1 ? "family" : "families"} named this person but did not include a note.
            </div>
          )}

          {!loading && !error && notes.length > 0 && notes.length < actor.count && (
            <div className="text-xs text-center pb-1" style={{ color: "rgba(245,245,245,0.45)" }}>
              Showing {notes.length} of {actor.count} family reports. {actor.count - notes.length}{" "}
              {actor.count - notes.length === 1 ? "family" : "families"} named this person without a written note.
            </div>
          )}

          {!loading && !error && notes.map((n, i) => (
            <div key={i} className="rounded-lg px-4 py-3"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-xs font-semibold mb-1.5" style={{ color: GOLD }}>
                {n.month ? formatMonth(n.month) : "Submitted by a family"}
              </div>
              <div className="text-sm whitespace-pre-wrap" style={{ color: "rgba(245,245,245,0.85)" }}>
                {n.note}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return "Submitted by a family";
  const [, year, m] = match;
  const date = new Date(Number(year), Number(m) - 1, 1);
  if (isNaN(date.getTime())) return "Submitted by a family";
  return `Submitted ${date.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;
}
