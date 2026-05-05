"use client";

import { useEffect, useMemo, useState } from "react";
import { COURT_ACTOR_PUBLIC_THRESHOLD } from "../../../../lib/court-actors";
import { DONATION_URL } from "../../../../lib/site-links";

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

// Returns the human label for an actor's location: US state name when a
// state_code is present, otherwise the literal country (location_key) so
// non-US actors (Canada, UK, etc.) are visible by name instead of "Unknown".
function locationLabel(actor: { state_code: string | null; location_key: string | null }): string {
  if (actor.state_code) return stateLabel(actor.state_code);
  if (actor.location_key?.trim()) return actor.location_key.trim();
  return "Unknown";
}

function locationKeyLabel(key: string, actorsByLocation: Map<string, { state_code: string | null }>): string {
  // If this location_key matches a US state code's actors, show the state name.
  const sample = actorsByLocation.get(key);
  if (sample?.state_code) return stateLabel(sample.state_code);
  return key;
}

export function ActorsBrowser({ visitorEmail, visitorSubmissionId, visitorFirstName, onSignOut }: Props) {
  const [actors, setActors] = useState<Actor[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total_actors: number; total_reports: number; at_threshold: number; states_count: number; locations_count?: number } | null>(null);
  const [threshold, setThreshold] = useState(COURT_ACTOR_PUBLIC_THRESHOLD);

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
          locations_count: data.locations_count,
        });
        if (typeof data.threshold === "number") {
          setThreshold(data.threshold);
        }
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

  // Build the "location" filter options. Each option's value is the
  // location_key (US state code OR country name); each option's label is
  // resolved via locationKeyLabel using a sample actor from that bucket.
  const allLocations = useMemo(() => {
    if (!actors) return [] as Array<{ value: string; label: string }>;
    const sampleByKey = new Map<string, { state_code: string | null }>();
    for (const a of actors) {
      if (!a.location_key) continue;
      if (!sampleByKey.has(a.location_key)) {
        sampleByKey.set(a.location_key, { state_code: a.state_code });
      }
    }
    return Array.from(sampleByKey.keys())
      .map(key => ({ value: key, label: locationKeyLabel(key, sampleByKey) }))
      .sort((a, b) => a.label.localeCompare(b.label));
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
      if (stateFilter && a.location_key !== stateFilter) return false;
      if (roleFilter && !a.role.toLowerCase().includes(roleFilter.toLowerCase())) return false;
      if (thresholdOnly && !a.at_threshold) return false;
      if (q) {
        const blob = `${a.name} ${a.role} ${locationLabel(a)} ${a.location_key ?? ""} ${a.county_breakdown}`.toLowerCase();
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

        {/* Header — minimal: just the registry badge + sign-in indicator. The
            big "what to do" panel below is the real headline now. */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-5">
          <div
            className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest self-start"
            style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
          >
            COURT ACTOR REGISTRY
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

        {/* HOW TO USE — promoted to the visual headline. This is the first
            thing every visitor sees after the gate. Designed to be impossible
            to miss on mobile and desktop. */}
        <div
          className="rounded-2xl p-6 md:p-8 mb-6"
          style={{
            backgroundColor: "rgba(201,162,39,0.10)",
            border: `2px solid ${GOLD}`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          }}
        >
          <h1
            className="text-2xl md:text-4xl font-black mb-2"
            style={{ color: GOLD }}
          >
            How to use this page
          </h1>
          <p className="text-white/85 text-base md:text-lg mb-6 leading-relaxed">
            This is the registry of every court actor named by Stand With Meg families. <span className="font-semibold text-white">Pick the option below that fits you.</span>
          </p>

          <div className="space-y-5 md:space-y-6">

            <InstructionStep number="1" title="Look for names you recognize">
              Scroll the list below, or use the <span className="font-semibold text-white">Search</span> bar or the <span className="font-semibold text-white">State</span> dropdown to find judges, GALs, attorneys, evaluators, or CPS workers from your own case.
            </InstructionStep>

            <InstructionStep number="2" title="Click the gold &ldquo;On my case&rdquo; button next to anyone you recognize">
              A short form opens — already filled in with their name, role, and county. <span className="font-semibold text-white">You only need to add one short sentence about what they did.</span> You will not have to redo your whole survey.
            </InstructionStep>

            <InstructionStep number="3" title="Don&apos;t see anyone you know? Share the page anyway">
              Some actors are still below the <span className="font-semibold text-white">{threshold}-family public threshold</span>. Use the <span className="font-semibold text-white">Share this page</span> button at the bottom to send the link to anyone you know who has been through family court. <span className="font-semibold text-white">Heads-up:</span> the people you share with will be asked to take the free 5-minute Stand With Meg survey before they can see the registry — that&apos;s how their case is added to the count, and how the next name crosses the public threshold.
            </InstructionStep>

          </div>
        </div>

        {/* Mini donate ask — small, high-conversion strip while traffic spikes.
            Placed above the stats so it's visible without scrolling. */}
        <div
          className="mb-6 rounded-xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3"
          style={{
            backgroundColor: "rgba(185,28,28,0.10)",
            border: "1px solid rgba(185,28,28,0.45)",
          }}
        >
          <p className="text-sm md:text-base text-white/85 leading-relaxed flex-1">
            <span className="font-bold text-white">Without donations, I have to stop.</span>{" "}
            This registry, the hosting, the state PDFs &mdash; it&rsquo;s all paid for out of pocket. If everyone reading this gave just{" "}
            <strong className="text-white">$5</strong>, I could keep going.
          </p>
          <a
            href={DONATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center justify-center px-5 py-3 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#B91C1C", color: "white" }}
          >
            Donate $5 →
          </a>
        </div>

        {/* Stats — moved BELOW the instructions. They're context, not the
            primary action, so they read second. */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Family Reports" value={stats.total_reports.toLocaleString()} />
            <StatCard label="Actor Patterns" value={stats.total_actors.toLocaleString()} />
            <StatCard label="At Public Threshold" value={stats.at_threshold.toString()} accent />
            <StatCard label="States &amp; Countries" value={(stats.locations_count ?? stats.states_count).toString()} />
          </div>
        )}

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
              placeholder="Name, role, location, county…"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.18)",
                color: "white",
              }}
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-white/70 mb-1">State / Country</label>
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
              <option value="">All states &amp; countries</option>
              {allLocations.map(loc => <option key={loc.value} value={loc.value}>{loc.label}</option>)}
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
            No actors match these filters. Try clearing the search or changing the location/role.
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
                      <th className="px-4 py-3 text-left text-white/80 font-semibold">State / Country</th>
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
                        <td className="px-4 py-3 text-white/80">{locationLabel(a)}</td>
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
                    <div className="text-white/80 text-xs mb-1">{locationLabel(a)}</div>
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
            Some named actors still need more independent family reports before they reach the {threshold}-family public-naming threshold. The fastest way to make hidden patterns visible is to get this page in front of more family-court survivors.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <ShareLinkButton threshold={threshold} />
            <a
              href={DONATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-lg font-bold text-sm text-center hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#B91C1C", color: "white" }}
            >
              Donate →
            </a>
            <a
              href="/survey"
              className="px-5 py-3 rounded-lg font-bold text-sm text-center hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "transparent", color: GOLD, border: `1.5px solid ${GOLD}` }}
            >
              Add new details to my own story →
            </a>
          </div>
        </div>

        {/* Why I'm asking — full donate panel, mirrors the /report dashboard */}
        <div
          className="mt-6 rounded-2xl overflow-hidden"
          style={{ border: `1px solid rgba(201,162,39,0.4)` }}
        >
          <div
            className="p-8 md:p-10 text-center"
            style={{ backgroundColor: "rgba(201,162,39,0.10)" }}
          >
            <div
              className="text-xs font-bold uppercase tracking-widest mb-3"
              style={{ color: "rgba(201,162,39,0.7)" }}
            >
              Why I&rsquo;m asking
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-white mb-4 max-w-2xl mx-auto leading-tight">
              Without donations, I have to stop.
            </h3>
            <p className="text-sm mb-4 max-w-xl mx-auto leading-relaxed text-white/75">
              Stand With Meg runs on real money &mdash; hosting, document storage, the state
              reports, this registry you&rsquo;re using right now. There&rsquo;s no foundation behind this.
              No grants. No salary. Just me, paying out of pocket while raising my kids and
              fighting my own case in court.
            </p>
            <p className="text-sm mb-6 max-w-xl mx-auto leading-relaxed text-white/80">
              If everyone reading this gave just <strong className="text-white">$5</strong>, I could
              keep going. <strong className="text-white">$5 once</strong> helps.
              <strong className="text-white"> $5 a month</strong> is what keeps this record alive
              for the families who come after.
            </p>
            <a
              href={DONATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-base px-8 py-4 rounded-xl font-black tracking-wide transition-colors hover:opacity-90"
              style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
            >
              Donate via PayPal →
            </a>
            <p className="text-xs mt-5 max-w-md mx-auto leading-relaxed text-white/40">
              PayPal and major cards accepted. Worldwide donors welcome &mdash; works in 200+ countries.
              Recurring monthly donations supported. Donations are not yet tax-deductible.
            </p>
          </div>
        </div>

        {/* About */}
        <div className="mt-6 text-white/50 text-xs leading-relaxed">
          <p className="mb-2">
            <span className="text-white/70 font-semibold">About this registry:</span> Submitter names, emails, and case details never appear on this page. Only aggregate patterns — actor name, role, state, county, and family count — are shown.
          </p>
          <p>
            <span className="text-white/70 font-semibold">Names go fully public</span> on the <a href="/report" className="underline" style={{ color: GOLD }}>main dashboard</a> once {threshold} different families have independently named the same person in the same place.
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

function InstructionStep({ number, title, children }: { number: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 md:gap-5">
      <div
        className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-lg md:text-xl font-black"
        style={{ backgroundColor: GOLD, color: NAVY_DEEP }}
      >
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-bold text-base md:text-xl mb-1 leading-snug">{title}</div>
        <div className="text-white/85 text-sm md:text-base leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function ShareLinkButton({ threshold }: { threshold: number }) {
  const [copied, setCopied] = useState(false);
  async function handleClick() {
    const url = "https://my.standwithmeg.com/actors";
    try {
      // Prefer native share sheet on mobile when available
      if (typeof navigator !== "undefined" && (navigator as { share?: (data: { title: string; text: string; url: string }) => Promise<void> }).share) {
        await (navigator as { share: (data: { title: string; text: string; url: string }) => Promise<void> }).share({
          title: "Stand With Meg — Court Actor Registry",
          text: `Family court actors named by ${threshold}+ families across the country. If you've been through family court, see if anyone on your case is here.`,
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
  const updateUrl = `/court-actor-update?submission=${encodeURIComponent(visitorSubmissionId)}&actor_name=${encodeURIComponent(actor.name)}&actor_role=${encodeURIComponent(actor.role.split(" + ")[0])}&actor_county=${encodeURIComponent(actor.county_breakdown.split(" (")[0] || "")}&actor_state=${encodeURIComponent(actor.state_code || "")}`;
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
