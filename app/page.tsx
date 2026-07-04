import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/dossier/SiteHeader";
import { SiteFooter } from "@/components/dossier/SiteFooter";
import { DonateNudge } from "@/components/dossier/DonateNudge";
import { VideoWalkthroughCard } from "@/components/dossier/VideoWalkthroughCard";
import { CirclesBand } from "@/components/dossier/CirclesBand";

export const revalidate = 300;

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Stand With Meg — The Family Rights Registry",
  description:
    "The Family Rights Registry — turning family-reported family court experiences into a public record: state-by-state reports, named court actors, and free PDF downloads.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Stand With Meg",
    title: "Stand With Meg — The Family Rights Registry",
    description:
      "The Family Rights Registry — families' reported family-court experiences, turned into a public record.",
    images: [{ url: "/meg/meg-hero.jpg", width: 1200, height: 1500, alt: "Meg — Stand With Meg, the fight for America's families" }],
  },
};

interface SummaryRow {
  state: string;
  is_us: boolean;
  total_submissions: number;
  total_financial_loss: number | null;
}

interface NationalStats {
  families: number;
  states: number;
  countries: number;
  reportedLosses: number;
}

async function getNationalStats(): Promise<NationalStats | null> {
  try {
    const res = await fetch(`${siteUrl}/api/survey`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { total?: number; by_state?: SummaryRow[] };
    const rows = data.by_state ?? [];
    if (!data.total || rows.length === 0) return null;
    return {
      families: data.total,
      states: rows.filter((r) => r.is_us).length,
      countries: 1 + rows.filter((r) => !r.is_us).length,
      reportedLosses: rows.reduce((sum, r) => sum + (r.total_financial_loss ?? 0), 0),
    };
  } catch {
    return null;
  }
}

interface Quote {
  id: string;
  quote: string;
  attribution: string;
  state: string;
}

async function getQuotes(): Promise<Quote[]> {
  try {
    const res = await fetch(`${siteUrl}/api/survey/quotes`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { quotes?: Quote[] };
    // Short quotes read best in the three-across pull-quote layout.
    return (data.quotes ?? []).filter((q) => q.quote.length >= 40 && q.quote.length <= 220).slice(0, 3);
  } catch {
    return [];
  }
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

const EXPLAINERS = [
  {
    q: "What is this?",
    a: "The Family Rights Registry — the global and national survey building an independent public record of what families report experiencing in family court. Investigated, counted, and published by Meg, an investigative journalist.",
  },
  {
    q: "What happens to my story?",
    a: "Your survey is reviewed by a human, counted into your state's numbers, and kept private. Your name, your children, and your case details are never published.",
  },
  {
    q: "When does a name become public?",
    a: "Only when three or more unrelated families independently report the same court actor. One report is a data point. Three is a pattern the public deserves to see.",
  },
];

const EXPLAINER_ICONS = [
  <svg key="doc" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5"/><circle cx="11" cy="13" r="2.6"/><path d="M13 15.2 15.5 18"/></svg>,
  <svg key="shield" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 2 4 5.5v6c0 5 3.5 8.5 8 10.5 4.5-2 8-5.5 8-10.5v-6z"/><rect x="9.4" y="10.4" width="5.2" height="4.6" rx="0.8"/><path d="M10.4 10.4V9a1.6 1.6 0 0 1 3.2 0v1.4"/></svg>,
  <svg key="bank" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/></svg>,
];

export default async function Home() {
  const [stats, quotes] = await Promise.all([getNationalStats(), getQuotes()]);

  return (
    <>
      <SiteHeader />
      <main>
        {/* HERO */}
        <section className="section hero-tight" aria-labelledby="hero-heading">
          <div className="wrap grid lg:grid-cols-[1.2fr_1fr] gap-8 lg:gap-12 items-center">
            <div>
              <p className="eyebrow mb-6 rise">The Family Rights Registry · Investigative journalism</p>
              <h1 id="hero-heading" className="display rise" style={{ fontSize: "var(--text-hero)", maxWidth: "12ch" }}>
                THEY CALLED EVERY FAMILY AN <span className="strike-claim">ANOMALY</span>.
                <br />
                THE NUMBERS SAY <span className="accent-word accent-underline">PATTERN.</span>
              </h1>
              <p className="serif-note mt-8 max-w-xl text-lg rise" style={{ color: "var(--ink-70)" }}>
                {stats
                  ? `${stats.families.toLocaleString()} families across ${stats.states} states and ${stats.countries} countries have reported what happened to them in family court.`
                  : "Thousands of families across the country and around the world have reported what happened to them in family court."}{" "}
                This is where their experiences stop being isolated — and start being counted.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-5 rise">
                <Link href="/survey" className="action-pill">
                  <span className="pill-dot" aria-hidden />
                  Add your case ↗
                </Link>
                <Link href="/report" className="gold-pill">Read the report</Link>
              </div>
            </div>
            <figure className="rise m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/meg/just-me.jpg"
                alt="Meg surrounded by mini versions of herself doing every job — recording, reviewing surveys, designing, emailing, mailing lawmakers, moderating chats"
                width={561}
                height={701}
                className="w-full"
                style={{ border: "1px solid var(--hairline-gold)", boxShadow: "var(--card-shadow)" }}
              />
              <figcaption className="disclaimer-strip mt-3">No staff. No team. Just Meg.</figcaption>
            </figure>
          </div>
        </section>

        {/* NUMBERS — live from the survey API, never hardcoded */}
        {stats && (
          <section className="section pt-0" aria-labelledby="numbers-heading">
            <div className="wrap">
              <hr className="rule-double mb-5 lg:mb-10" />
              <h2 id="numbers-heading" className="eyebrow eyebrow--muted mb-5 lg:mb-10">The movement, counted</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                <div className="stat-crimson">
                  <p className="stat-number">{stats.families.toLocaleString()}</p>
                  <p className="stat-label">Families reporting</p>
                </div>
                <div className="stat-crimson">
                  <p className="stat-number">{stats.states}</p>
                  <p className="stat-label">States represented</p>
                </div>
                <div className="stat-crimson">
                  <p className="stat-number">{money(stats.reportedLosses)}</p>
                  <p className="stat-label">Reported family losses</p>
                </div>
                <div className="stat-crimson">
                  <p className="stat-number">{stats.countries}</p>
                  <p className="stat-label">Countries worldwide</p>
                </div>
              </div>
              <div className="mt-10">
                <DonateNudge seed={0} />
              </div>
            </div>
          </section>
        )}

        {/* EXPLAINERS + VIDEO */}
        <section className="section pt-0" aria-labelledby="how-heading">
          <div className="wrap">
            <hr className="rule-double mb-10" />
            <h2 id="how-heading" className="display mb-12" style={{ fontSize: "var(--text-display)" }}>
              HOW THIS <span className="accent-word">WORKS</span>
            </h2>
            <div className="grid lg:grid-cols-[1fr_520px] gap-10 items-start">
              <div className="grid sm:grid-cols-1 gap-5">
                {EXPLAINERS.map((e, i) => (
                  <article key={e.q} className="panel p-7">
                    <div className="flex items-start justify-between mb-3">
                      <p className="eyebrow">0{i + 1}</p>
                      <span aria-hidden style={{ color: "var(--action-red-hot)" }}>{EXPLAINER_ICONS[i]}</span>
                    </div>
                    <h3 className="headline text-lg mb-2">{e.q}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--ink-70)" }}>{e.a}</p>
                  </article>
                ))}
              </div>
              <VideoWalkthroughCard page="home" />
            </div>
          </div>
        </section>

        {/* WHO IS MEG */}
        <section className="section pt-0" aria-labelledby="meg-heading">
          <div className="wrap">
            <hr className="rule-double mb-10" />
            <figure className="m-0 mb-12">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/meg/meet-meg-founder-hero.png"
                alt="Meet Meg — founder of Stand With Meg"
                width={1200}
                height={450}
                className="w-full object-cover"
                style={{ border: "1px solid var(--hairline-accent)", boxShadow: "var(--card-shadow)" }}
              />
            </figure>
            <div className="grid md:grid-cols-[420px_1fr] gap-12 items-center">
              <figure className="m-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/meg/meg-hero.jpg"
                  alt="Meg, investigative journalist and founder of Stand With Meg"
                  width={420}
                  height={280}
                  className="w-full object-cover"
                  style={{ border: "1px solid var(--hairline)", boxShadow: "var(--card-shadow)" }}
                />
                <figcaption className="disclaimer-strip mt-3">Meg · Investigative journalist</figcaption>
              </figure>
              <div>
                <p className="eyebrow mb-4">Who&rsquo;s behind this</p>
                <h2 id="meg-heading" className="display mb-5" style={{ fontSize: "var(--text-display)" }}>
                  I&rsquo;M MEG. I COUNT WHAT COURTS <span className="accent-word">DISMISS.</span>
                </h2>
                <p className="text-base leading-relaxed max-w-xl" style={{ color: "var(--ink-70)" }}>
                  I&rsquo;m an investigative journalist and a parent who lived this system.
                  When my case was called an isolated incident, I started asking other
                  families — and the answers haven&rsquo;t stopped coming. Every number on
                  this site is a family who trusted me with what happened to them. I
                  verify, I count, and when enough families name the same person, I publish.
                </p>
                <div className="mt-7 flex flex-wrap gap-4">
                  <Link href="/survey" className="action-pill">Tell me your story</Link>
                  <Link href="/connect" className="gold-pill">Meet the families</Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* VOICES — real permissioned quotes only */}
        <section className="section pt-0" aria-labelledby="voices-heading">
          <div className="wrap">
            {quotes.length > 0 && (
              <>
                <h2 id="voices-heading" className="eyebrow eyebrow--muted mb-10">What families say</h2>
                <div className="grid md:grid-cols-3 gap-10">
                  {quotes.map((q) => (
                    <blockquote key={q.id} className="pull-quote">
                      {q.quote}
                      <footer className="disclaimer-strip mt-4">— {q.attribution || "Anonymous"} · {q.state}</footer>
                    </blockquote>
                  ))}
                </div>
                <p className="disclaimer-strip mt-6">Family-reported submissions.</p>
              </>
            )}
            <div className="mt-14">
              <CirclesBand />
            </div>
            <div className="mt-8 panel panel--raised p-8 md:p-10 flex flex-wrap items-center justify-between gap-6">
              <div>
                <h3 className="display text-2xl md:text-3xl">
                  YOUR STORY IS A <span className="accent-word">DATA POINT.</span>
                </h3>
                <p className="mt-2 text-sm" style={{ color: "var(--ink-70)" }}>
                  Nine minutes. Fully private. It makes the pattern impossible to dismiss.
                </p>
              </div>
              <Link href="/survey" className="action-pill">
                <span className="pill-dot" aria-hidden />
                Share your story ↗
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
