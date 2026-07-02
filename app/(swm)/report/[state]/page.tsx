import type { Metadata } from "next";
import Link from "next/link";
import { ConnectionCirclesCta } from "../../ConnectionCirclesCta";
import { SponsorBand } from "../_components/SponsorBand";

const REGISTRY = "https://my.standwithmeg.com";
const GOLD = "#c9a227";
const THRESHOLD = 30;

// Cache the rendered page (ISR). Without this the route is fully dynamic and
// re-runs every fetch on each click, which is why it felt slow to open.
export const revalidate = 3600;

// Pre-render every region that already has a report so the first click is
// instant. Regions not listed here still render on demand, then cache.
export async function generateStaticParams(): Promise<{ state: string }[]> {
  try {
    const res = await fetch(`${REGISTRY}/api/public/marketing-stats`, { next: { revalidate: 3600 } });
    const data = await res.json();
    const reports: StateReport[] = Array.isArray(data?.state_reports) ? data.state_reports : [];
    return reports
      .filter((r) => r.pdf && r.state)
      .map((r) => ({ state: r.state }));
  } catch {
    return [];
  }
}

// Canada is a live region with a >2-char key; everything else is a 2-letter state.
function normalizeRegion(input: string): string {
  const raw = (input ?? "").trim();
  if (raw.toLowerCase() === "canada") return "Canada";
  return raw.toUpperCase().slice(0, 2);
}

interface StateReport {
  state: string;
  state_name: string;
  submissions: number;
  pdf?: string;
}

async function getStateReport(abbr: string): Promise<StateReport | null> {
  try {
    const res = await fetch(`${REGISTRY}/api/public/marketing-stats`, { next: { revalidate: 3600 } });
    const data = await res.json();
    const reports: StateReport[] = Array.isArray(data?.state_reports) ? data.state_reports : [];
    return reports.find((r) => (r.state ?? "").toUpperCase() === abbr.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

async function getCourtActorCount(abbr: string): Promise<number | null> {
  try {
    const res = await fetch(`${REGISTRY}/api/survey/court-actors?state=${abbr}`, { next: { revalidate: 3600 } });
    const data = await res.json();
    return Array.isArray(data?.actors) ? data.actors.length : null;
  } catch {
    return null;
  }
}

// Clean MEDIAN stats (outlier-resistant) from the state_median_stats view.
async function getMedianStats(abbr: string): Promise<{ loss: number | null; months: number | null }> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { loss: null, months: null };
    const res = await fetch(
      `${url}/rest/v1/state_median_stats?select=median_financial_loss,median_months_lost&state=eq.${encodeURIComponent(abbr)}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 3600 } }
    );
    const rows = await res.json();
    const r = Array.isArray(rows) ? rows[0] : null;
    const loss = r?.median_financial_loss != null ? Math.round(Number(r.median_financial_loss)) : null;
    const months = r?.median_months_lost != null ? Math.round(Number(r.median_months_lost)) : null;
    return { loss: loss && loss > 0 ? loss : null, months: months && months > 0 ? months : null };
  } catch {
    return { loss: null, months: null };
  }
}

export async function generateMetadata({ params }: { params: Promise<{ state: string }> }): Promise<Metadata> {
  const { state } = await params;
  const abbr = normalizeRegion(state);
  const report = await getStateReport(abbr);
  const name = report?.state_name ?? abbr;
  return {
    title: `${name} Family-Court Report · Stand With Meg`,
    description: `What families are reporting inside ${name}'s family courts. Download the ${name} report families share with their legislators.`,
  };
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[10px] uppercase tracking-wider text-white/45">{k}</div>
      <div className="mt-1 text-2xl font-black">{v}</div>
    </div>
  );
}

export default async function StateReportPage({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const abbr = normalizeRegion(state);
  // report + median don't depend on each other — fetch them together.
  const [report, median] = await Promise.all([getStateReport(abbr), getMedianStats(abbr)]);
  const name = report?.state_name ?? abbr;
  const families = report?.submissions ?? null;
  const hasPdf = Boolean(report?.pdf);
  const actorCount = await getCourtActorCount(abbr);

  const shareUrl = `https://my.standwithmeg.com/report/${abbr}`;
  const shareText = `${name}: what families are reporting inside our family courts. ${families ?? ""} families on the record.`;

  return (
    <main className="min-h-screen bg-[#0a1526] text-[#f5f5f5]">
      <div className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <Link href="/report" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold" style={{ color: "rgba(201,162,39,0.8)" }}>
            ← National report
          </Link>
          <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">Stand With Meg</span>
        </div>

        {/* HERO */}
        <div className="mt-8">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
            {abbr === "Canada" ? "Regional report" : "State report"}
          </div>
          <h1 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">
            {name}: what families are reporting.
          </h1>
          {families != null && (
            <p className="mt-3 text-sm text-white/60">
              <b style={{ color: GOLD }}>{families.toLocaleString()}</b> {name} families have put their experience on
              the public record.
            </p>
          )}
        </div>

        {/* SPONSOR UNIT */}
        <div className="mt-7">
          <SponsorBand placement="state_page" state={abbr} stateName={name} variant="state" />
        </div>

        {/* STAT TILES */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {families != null && <Stat k="Families documented" v={families.toLocaleString()} />}
          {actorCount != null && <Stat k="Court actors named" v={String(actorCount)} />}
          {median.months != null && <Stat k="Median months of parenting time lost" v={`${median.months} mo`} />}
          {median.loss != null && <Stat k="Median family loss" v={`$${median.loss.toLocaleString()}`} />}
        </div>

        {/* WHAT'S INSIDE */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-lg font-black">What&apos;s inside the {name} report</h2>
          <ul className="mt-3 space-y-2 text-[13px] text-white/65">
            <li className="flex gap-2"><span style={{ color: GOLD }}>•</span> Real, family-submitted accounts of what happened in {name}&apos;s family courts and CPS</li>
            <li className="flex gap-2"><span style={{ color: GOLD }}>•</span> The court actors families named — judges, attorneys, and GALs, by the public threshold</li>
            <li className="flex gap-2"><span style={{ color: GOLD }}>•</span> {name} data: families on record, parenting time lost, and financial impact</li>
          </ul>
        </section>

        <ConnectionCirclesCta placement="state" stateName={name} className="mt-8" />

        {/* DOWNLOAD or EMPTY STATE */}
        <div className="mt-6">
          {hasPdf ? (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border p-5" style={{ borderColor: "rgba(216,51,47,0.3)", background: "rgba(216,51,47,0.08)" }}>
              <div className="flex-1">
                <b className="text-base">Download the {name} report (PDF) ↓</b>
                <p className="mt-1 text-xs text-white/50">Free for families · no email required · share it with your legislators.</p>
              </div>
              <a href={`/api/state-reports/${abbr}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#d8332f] px-6 py-3 text-sm font-extrabold text-white transition-opacity hover:opacity-90">
                Download Report ↓
              </a>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed p-6 text-center" style={{ borderColor: "rgba(201,162,39,0.35)" }}>
              {families != null && families < THRESHOLD ? (
                <>
                  <p className="text-sm text-white/70">
                    The {name} report unlocks at <b>{THRESHOLD} families</b> — <b style={{ color: GOLD }}>{families}</b> so far.
                  </p>
                  <Link href="/survey" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-xl bg-[#d8332f] px-5 py-2.5 text-sm font-extrabold text-white hover:opacity-90">
                    Add your story →
                  </Link>
                </>
              ) : (
                <p className="text-sm text-white/70">The {name} report has reached the threshold and is being prepared — check back soon.</p>
              )}
              <div className="mt-3 text-xs">
                <Link href="/sponsor" target="_blank" rel="noopener noreferrer" style={{ color: GOLD }} className="font-bold">
                  Reserve the {name} sponsor slot now (Founding Reserve) →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* HOW TO USE IT */}
        {hasPdf && (
          <section className="mt-8">
            <h2 className="text-lg font-black">How to use it</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                ["1", "Download", "Grab the free PDF above."],
                ["2", "Print", "Print it — it's built to be handed over."],
                ["3", "Send it", `Give it to your ${name} legislators and ask them to act.`],
              ].map(([n, h, p]) => (
                <div key={n} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-2xl font-black" style={{ color: GOLD }}>{n}</div>
                  <div className="mt-1 text-sm font-extrabold">{h}</div>
                  <div className="mt-1 text-[12px] text-white/55">{p}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SPONSOR CTA */}
        <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-6" style={{ borderColor: "rgba(201,162,39,0.4)", background: "rgba(201,162,39,0.06)" }}>
          <div>
            <div className="text-base font-black">Want your business on the {name} report?</div>
            <div className="mt-1 text-[13px] text-white/60">One Exclusive per region — seen by everyone who downloads it.</div>
          </div>
          <Link href="/sponsor" target="_blank" rel="noopener noreferrer" className="rounded-xl px-5 py-3 text-sm font-extrabold text-white hover:opacity-90" style={{ backgroundColor: GOLD, color: "#0a1526" }}>
            Sponsor {name} →
          </Link>
        </section>

        {/* PARTNER — subtle nudge for advocates/survivors reading the report */}
        <p className="mt-3 text-center text-[13px] text-white/45">
          Want to help your state and earn?{" "}
          <Link href="/partners" target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-2 hover:underline" style={{ color: "rgba(201,162,39,0.85)" }}>
            Become a partner →
          </Link>
        </p>

        {/* SHARE + DISCLAIMER */}
        <section className="mt-8 text-center">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-white/45">Share this report</div>
          <div className="mt-3 flex justify-center gap-3">
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/5">
              Share on X
            </a>
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/5">
              Share on Facebook
            </a>
          </div>
        </section>

        <footer className="mt-10 border-t border-white/10 pt-5 text-center text-[11px] text-white/30">
          FAMILY-REPORTED SUBMISSIONS. · Stand With Meg remains editorially independent · standwithmeg.com
        </footer>
      </div>
    </main>
  );
}
