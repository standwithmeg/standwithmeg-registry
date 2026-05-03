"use client";

import { useEffect, useMemo, useState } from "react";

const GOLD = "#C9A227";
const NAVY = "#0F1E30";
const NAVY_DEEP = "#091625";

type Actor = {
  role: string;
  name: string;
  state_code: string | null;
  location_key: string | null;
  county_breakdown: string;
  family_count: number;
  at_threshold: boolean;
  needs_more: number;
};

type Props = {
  visitorEmail: string;
  visitorSubmissionId: string;
  visitorFirstName: string;
  onSignOut: () => void;
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

function stateLabel(code: string | null): string {
  if (!code) return "Unknown";
  return STATE_LABEL[code] ?? code;
}

export function ActorsBrowser({ visitorEmail, visitorSubmissionId, visitorFirstName, onSignOut }: Props) {
  const [actors, setActors] = useState<Actor[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total_actors: number; total_reports: number; at_threshold: number; states_count: number } | null>(null);

  // Filters
  const [stateFilter, setStateFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [thresholdOnly, setThresholdOnly] = useState(false);
  const [search, setSearch] = useState("");

  // Claim modal
  const [claimActor, setClaimActor] = useState<Actor | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/actors/all");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError("Could not load court actors. Please refresh.");
          setLoading(false);
          return;
        }
        setActors(data.actors || []);
        setStats({
          total_actors: data.total_actors,
          total_reports: data.total_reports,
          at_threshold: data.at_threshold,
          states_count: data.states_count,
        });
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError("Network error loading actors. Please refresh.");
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allStates = useMemo(() => {
    if (!actors) return [];
    const s = new Set<string>();
    for (const a of actors) if (a.state_code) s.add(a.state_code);
    return Array.from(s).sort((a, b) => stateLabel(a).localeCompare(stateLabel(b)));
  }, [actors]);

  const allRoles = useMemo(() => {
    if (!actors) return [];
    const s = new Set<string>();
    for (const a of actors) {
      // Use the leading role token (before " + N role(s)")
      const lead = a.role.split(" + ")[0];
      if (lead) s.add(lead);
    }
    return Array.from(s).sort();
  }, [actors]);

  const filtered = useMemo(() => {
    if (!actors) return [];
    const q = search.trim().toLowerCase();
    return actors.filter(a => {
      if (stateFilter && a.state_code !== stateFilter) return false;
      if (roleFilter && !a.role.toLowerCase().includes(roleFilter.toLowerCase())) return false;
      if (thresholdOnly && !a.at_threshold) return false;
      if (q) {
        const blob = `${a.name} ${a.role} ${stateLabel(a.state_code)} ${a.county_breakdown}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [actors, stateFilter, roleFilter, thresholdOnly, search]);

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)` }}
    >
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <div
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest mb-3"
              style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
            >
              COURT ACTOR REGISTRY
            </div>
            <h1 className="text-2xl md:text-4xl font-black text-white">Named Court Actor Patterns</h1>
            <p className="text-white/70 text-sm md:text-base mt-2 max-w-2xl">
              Every court actor named by Stand With Meg families. Names become public the moment three independent families name the same person in the same place.
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-1 text-xs text-white/60">
            <div>
              Signed in as <span className="font-mono text-white/80">{visitorEmail}</span>
            </div>
            <button
              onClick={onSignOut}
              className="underline underline-offset-2 hover:text-white"
            >
              Use a different email
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Family Reports" value={stats.total_reports.toLocaleString()} />
            <StatCard label="Actor Patterns" value={stats.total_actors.toLocaleString()} />
            <StatCard label="At Public Threshold" value={stats.at_threshold.toString()} accent />
            <StatCard label="States Represented" value={stats.states_count.toString()} />
          </div>
        )}

        {/* How to use this page */}
        <div
          className="rounded-2xl p-5 md:p-6 mb-6"
          style={{
            backgroundColor: "rgba(201,162,39,0.08)",
            border: `1px solid ${GOLD}`,
          }}
        >
          <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
            How to use this page
          </div>
          <ol className="space-y-3 text-white/90 text-sm md:text-base leading-relaxed">
            <li className="flex gap-3">
              <span
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
              >1</span>
              <div>
                <span className="font-semibold text-white">Look for names you know from your own case.</span>{" "}
                Use the <span className="font-mono text-white/80">Search</span> bar or the{" "}
                <span className="font-mono text-white/80">State</span> filter below to narrow the list.
              </div>
            </li>
            <li className="flex gap-3">
              <span
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
              >2</span>
              <div>
                <span className="font-semibold text-white">Click &ldquo;On my case&rdquo; on any actor you recognize.</span>{" "}
                A short form opens with their name pre-filled — just confirm a few details and you&apos;re added. You don&apos;t have to redo the whole survey.
              </div>
            </li>
            <li className="flex gap-3">
              <span
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
              >3</span>
              <div>
                <span className="font-semibold text-white">Don&apos;t see anyone you recognize?</span>{" "}
                That&apos;s useful too — it usually means a name is one or two reports short of the public threshold. Sharing this page with anyone you know in family court is the fastest way to push it over.
              </div>
            </li>
          </ol>
        </div>

        {/* Filters */}
        <div
          className="rounded-2xl p-4 md:p-5 mb-6 grid grid-cols-1 md:grid-cols-12 gap-3"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,162,39,0.22)" }}
        >
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-white/70 mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Name, role, state, county…"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.18)",
                color: "white",
              }}
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-white/70 mb-1">State</label>
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.18)",
                color: "white",
              }}
            >
              <option value="">All states</option>
              {allStates.map(s => <option key={s} value={s}>{stateLabel(s)}</option>)}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-white/70 mb-1">Role</label>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.18)",
                color: "white",
              }}
            >
              <option value="">All roles</option>
              {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="md:col-span-2 flex items-end">
            <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={thresholdOnly}
                onChange={e => setThresholdOnly(e.target.checked)}
              />
              Public threshold only
            </label>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="text-white/60 text-center py-12">Loading court actor patterns…</div>
        ) : error ? (
          <div className="text-red-300 text-center py-12">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-white/60 text-center py-12">
            No actors match these filters. Try clearing the search or changing the state/role.
          </div>
        ) : (
          <>
            <div className="text-white/60 text-xs mb-3">
              Showing <span className="text-white">{filtered.length.toLocaleString()}</span> of <span className="text-white">{actors!.length.toLocaleString()}</span> actor patterns
            </div>

            <div
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,162,39,0.22)" }}
            >
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "rgba(15,30,48,0.6)", borderBottom: "1px solid rgba(201,162,39,0.16)" }}>
                      <th className="px-4 py-3 text-left text-white/80 font-semibold">Court Actor</th>
                      <th className="px-4 py-3 text-left text-white/80 font-semibold">Role</th>
                      <th className="px-4 py-3 text-left text-white/80 font-semibold">State</th>
                      <th className="px-4 py-3 text-left text-white/80 font-semibold">Families</th>
                      <th className="px-4 py-3 text-left text-white/80 font-semibold">Status</th>
                      <th className="px-4 py-3 text-left text-white/80 font-semibold">County / Court</th>
                      <th className="px-4 py-3 text-right text-white/80 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a, i) => (
                      <tr
                        key={`${a.name}|${a.location_key}|${i}`}
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                      >
                        <td className="px-4 py-3 text-white font-semibold">{a.name}</td>
                        <td className="px-4 py-3 text-white/80">{a.role}</td>
                        <td className="px-4 py-3 text-white/80">{stateLabel(a.state_code)}</td>
                        <td className="px-4 py-3 text-white font-bold">{a.family_count}</td>
                        <td className="px-4 py-3">
                          <ThresholdBadge actor={a} />
                        </td>
                        <td className="px-4 py-3 text-white/70 text-xs">{a.county_breakdown}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setClaimActor(a)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
                            style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
                          >
                            On my case
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-white/10">
                {filtered.map((a, i) => (
                  <div key={`m-${a.name}|${a.location_key}|${i}`} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="text-white font-bold">{a.name}</div>
                        <div className="text-white/70 text-xs">{a.role}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-white font-bold text-xl leading-none">{a.family_count}</div>
                        <div className="text-white/50 text-[10px] uppercase tracking-wider">families</div>
                      </div>
                    </div>
                    <div className="text-white/80 text-xs mb-1">{stateLabel(a.state_code)}</div>
                    <div className="text-white/60 text-xs mb-3">{a.county_breakdown}</div>
                    <div className="flex items-center justify-between gap-3">
                      <ThresholdBadge actor={a} />
                      <button
                        onClick={() => setClaimActor(a)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md"
                        style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
                      >
                        On my case
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Footer CTA — what to do after you've finished browsing */}
        <div
          className="mt-8 rounded-2xl p-6 md:p-8"
          style={{
            backgroundColor: "rgba(15,30,48,0.7)",
            border: "1px solid rgba(201,162,39,0.32)",
          }}
        >
          <h2 className="text-xl md:text-2xl font-black text-white mb-3">
            Didn&apos;t recognize anyone? Help us close the gap.
          </h2>
          <p className="text-white/80 text-sm md:text-base leading-relaxed mb-5 max-w-3xl">
            Most named actors are one or two reports short of the public-naming threshold. The fastest way to make hidden patterns visible is to get this page in front of more family-court survivors.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <ShareLinkButton />
            <a
              href="/survey"
              className="px-5 py-3 rounded-lg font-bold text-sm text-center hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "transparent", color: GOLD, border: `1.5px solid ${GOLD}` }}
            >
              Add new details to my own story →
            </a>
          </div>
        </div>

        {/* About */}
        <div className="mt-6 text-white/50 text-xs leading-relaxed">
          <p className="mb-2">
            <span className="text-white/70 font-semibold">About this registry:</span> Submitter names, emails, and case details never appear on this page. Only aggregate patterns — actor name, role, state, county, and family count — are shown.
          </p>
          <p>
            <span className="text-white/70 font-semibold">Names go fully public</span> on the <a href="/report" className="underline" style={{ color: GOLD }}>main dashboard</a> once 3 different families have independently named the same person in the same place.
          </p>
        </div>
      </div>

      {/* Claim modal */}
      {claimActor && (
        <ClaimModal
          actor={claimActor}
          visitorSubmissionId={visitorSubmissionId}
          visitorFirstName={visitorFirstName}
          onClose={() => setClaimActor(null)}
        />
      )}
    </div>
  );
}

function ShareLinkButton() {
  const [copied, setCopied] = useState(false);
  async function handleClick() {
    const url = "https://my.standwithmeg.com/actors";
    try {
      // Prefer native share sheet on mobile when available
      if (typeof navigator !== "undefined" && (navigator as { share?: (data: { title: string; text: string; url: string }) => Promise<void> }).share) {
        await (navigator as { share: (data: { title: string; text: string; url: string }) => Promise<void> }).share({
          title: "Stand With Meg — Court Actor Registry",
          text: "Family court actors named by 3+ families across the country. If you've been through family court, see if anyone on your case is here.",
          url,
        });
        return;
      }
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // User cancelled or clipboard unavailable
    }
  }
  return (
    <button
      onClick={handleClick}
      className="px-5 py-3 rounded-lg font-bold text-sm transition-opacity hover:opacity-90"
      style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
    >
      {copied ? "Link copied ✓" : "Share this page"}
    </button>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-center"
      style={{
        backgroundColor: accent ? "rgba(201,162,39,0.12)" : "rgba(255,255,255,0.04)",
        border: accent ? `1px solid ${GOLD}` : "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div
        className="text-2xl md:text-3xl font-black"
        style={{ color: accent ? GOLD : "white" }}
      >{value}</div>
      <div className="text-[10px] md:text-xs uppercase tracking-wider text-white/60 mt-1">{label}</div>
    </div>
  );
}

function ThresholdBadge({ actor }: { actor: Actor }) {
  if (actor.at_threshold) {
    return (
      <span
        className="inline-block text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded"
        style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
      >
        Public threshold
      </span>
    );
  }
  return (
    <span
      className="inline-block text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded"
      style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.16)" }}
    >
      Needs +{actor.needs_more} more
    </span>
  );
}

function ClaimModal({
  actor,
  visitorSubmissionId,
  visitorFirstName,
  onClose,
}: {
  actor: Actor;
  visitorSubmissionId: string;
  visitorFirstName: string;
  onClose: () => void;
}) {
  const updateUrl = `/court-actor-update?submission=${encodeURIComponent(visitorSubmissionId)}&actor_name=${encodeURIComponent(actor.name)}&actor_role=${encodeURIComponent(actor.role.split(" + ")[0])}&actor_county=${encodeURIComponent(actor.county_breakdown.split(" (")[0] || "")}`;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 md:p-8"
        style={{ backgroundColor: NAVY, border: `1px solid ${GOLD}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-white/60 text-xs uppercase tracking-widest mb-2">Add yourself to this actor</div>
        <h3 className="text-xl md:text-2xl font-black text-white mb-1">{actor.name}</h3>
        <p className="text-white/70 text-sm mb-5">{actor.role} · {stateLabel(actor.state_code)}</p>

        <div className="space-y-4 text-white/90">
          <p className="leading-relaxed">
            {visitorFirstName ? `${visitorFirstName}, ` : ""}was {actor.name} involved in your case too?
          </p>

          <p className="text-sm leading-relaxed text-white/80">
            We&apos;ll take you to a short form to add this actor to your existing submission. You won&apos;t need to redo the full survey — just confirm a few details about how this person was involved.
          </p>

          <div className="text-xs text-white/60 leading-relaxed">
            Your name and email will never be published as the person who reported this actor. Only aggregate family counts appear publicly.
          </div>

          <div className="flex flex-col-reverse md:flex-row gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white/80 hover:text-white"
              style={{ border: "1px solid rgba(255,255,255,0.18)" }}
            >
              Cancel
            </button>
            <a
              href={updateUrl}
              className="flex-1 px-4 py-3 rounded-lg text-sm font-bold text-center"
              style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
            >
              Continue to add this actor
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
