import type { Metadata } from "next";
import Link from "next/link";
import { SponsorInquiryForm } from "./SponsorInquiryForm";
import { PlacementGallery } from "./PlacementGallery";
import { SponsorshipPicker } from "./SponsorshipPicker";

const SPONSOR_TITLE = "Become a Sponsor";
const SPONSOR_DESCRIPTION =
  "Put your logo on a family-court report families read and send to lawmakers, while helping keep the public registry free.";
const SPONSOR_OG_IMAGE = "https://my.standwithmeg.com/sponsor/sponsor-1200x630-v2.jpg";

export const metadata: Metadata = {
  title: SPONSOR_TITLE,
  description: SPONSOR_DESCRIPTION,
  alternates: { canonical: "/sponsor" },
  openGraph: {
    type: "website",
    url: "https://my.standwithmeg.com/sponsor",
    siteName: "Stand With Meg",
    title: SPONSOR_TITLE,
    description: SPONSOR_DESCRIPTION,
    images: [{ url: SPONSOR_OG_IMAGE, width: 1400, height: 732, alt: "Stand With Meg — Become a Sponsor" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SPONSOR_TITLE,
    description: SPONSOR_DESCRIPTION,
    images: [SPONSOR_OG_IMAGE],
  },
};

const GOLD = "#c9a227";

const PROOF = [
  { v: "4,700+", l: "families documented, and counting" },
  { v: "53 · 18", l: "states & countries reached" },
  { v: "$825M+", l: "in family loss reported" },
  { v: "41", l: "report regions live · incl. Canada" },
  { v: "250K+", l: "social following driving readers" },
];

const SPONSORING = [
  { h: "A real audience", p: "Families who open these reports are reading them and forwarding them to lawmakers — right now, in their own state." },
  { h: "A real moment", p: "They're mid-fight and paying close attention. Your brand stands beside the cause, not lost in a banner nobody notices." },
  { h: "A free service you keep alive", p: "Your sponsorship is why the reports stay free for the families who need them. You're not buying an ad — you're keeping the lights on." },
];

const STEPS = [
  { n: "1", h: "Pick your spot", p: "A state slot, the national page, or the full Movement Partner package." },
  { n: "2", h: "Send your logo & details", p: "We design your placement to match the report — you don't design anything." },
  { n: "3", h: "Go live", p: "Every sponsor is approved for mission fit, then appears on the report families read and share." },
];

const FAQ = [
  { q: "Do you approve every sponsor?", a: "Yes. Not every business gets in. We review every sponsor for mission fit before they appear — your slot means something because not everyone gets one." },
  { q: "Is my business endorsing a specific case or person?", a: "No. Sponsors support public-interest reporting in general. You are not affiliated with any case, party, or family, and Stand With Meg stays editorially independent." },
  { q: "What if two businesses want the same state?", a: "First to claim it gets the Exclusive — one per state. Your competitors can't be on your report." },
  { q: "Do I have to design anything?", a: "No. Send your logo, contact info, and a one-line description. We build the placement to match the report." },
  { q: "Can I cancel?", a: "Monthly sponsors can cancel anytime before the next cycle. Quarterly sponsors commit for the term — which is the better value." },
];

// Section 6 — what's included matrix
const COLS = ["Community Supporter", "State Exclusive", "National Co", "National Presenting", "Movement Partner"];
const HILITE = new Set([1, 4]); // State Exclusive + Movement Partner columns
const MATRIX: [string, string[]][] = [
  ["Logo on your state page", ["✓ small", "✓ featured", "—", "—", "—"]],
  ["Sole logo in your state PDF (to lawmakers)", ["—", "✓", "—", "—", "✓ all states"]],
  ["Placement on the national page", ["—", "—", "✓ secondary", "✓ top", "✓ top"]],
  ["Monthly reel to 250K+", ["—", "—", "—", "—", "✓"]],
  ["Newsletter feature", ["—", "—", "—", "—", "✓"]],
  ["Named in press", ["—", "—", "—", "✓", "✓"]],
  ["How many exist", ["3 / state", "1 / state", "1 total", "1 total", "1 total"]],
  ["Price (from)", ["$99/mo", "$179/mo", "$1,900/mo", "$2,900/mo", "$4,900/mo"]],
];

export default function SponsorPage() {
  return (
    <main className="min-h-screen bg-[#0a1526] text-[#f5f5f5]">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
        {/* 1 — HERO */}
        <header className="text-center">
          <a
            href="#apply"
            className="mb-10 block overflow-hidden rounded-2xl border border-white/10 ring-1 ring-white/5 transition-opacity hover:opacity-95"
            aria-label="Become a sponsor — claim your state"
          >
            <img
              src="/sponsor/sponsor-1200x630-v2.jpg"
              alt="Stand With Meg — One sponsor per state. Claim your state before your competitor does."
              width={1400}
              height={732}
              className="h-auto w-full"
              fetchPriority="high"
            />
          </a>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
            Sponsors who believe families deserve the truth
          </div>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] sm:text-5xl">
            Put your business in front of America&apos;s family-court movement.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/65">
            Stand With Meg documents what families are living through inside family courts and child-welfare
            systems — state by state. Our reports stay free for every family and lawmaker because businesses
            like yours step up.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-base font-bold" style={{ color: GOLD }}>
            One sponsor gets the spotlight in each state. Once it&apos;s taken, it&apos;s gone.
          </p>
          <a href="#apply" className="mt-8 inline-block rounded-xl bg-[#d8332f] px-7 py-3.5 text-sm font-extrabold text-white transition-opacity hover:opacity-90">
            Become a sponsor →
          </a>
        </header>

        {/* 2 — PROOF */}
        <section className="mt-16 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {PROOF.map((s) => (
            <div key={s.l} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-2xl font-black" style={{ color: GOLD }}>{s.v}</div>
              <div className="mt-1 text-[11px] leading-snug text-white/50">{s.l}</div>
            </div>
          ))}
        </section>

        {/* 3 — WHAT YOU'RE SPONSORING */}
        <section className="mt-20">
          <h2 className="text-center text-2xl font-black sm:text-3xl">What you&apos;re sponsoring</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {SPONSORING.map((b) => (
              <div key={b.h} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className="text-base font-extrabold" style={{ color: GOLD }}>{b.h}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{b.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4 — WHERE YOUR BRAND APPEARS */}
        <section className="mt-20">
          <h2 className="text-center text-2xl font-black sm:text-3xl">Where your brand appears</h2>
          <p className="mt-2 text-center text-sm text-white/50">Click any example to see it full-size.</p>
          <PlacementGallery />
        </section>

        {/* 5 — CHOOSE YOUR SPONSORSHIP (the fix) */}
        <SponsorshipPicker />

        {/* 6 — WHAT'S INCLUDED matrix */}
        <section className="mt-20">
          <h2 className="text-center text-2xl font-black sm:text-3xl">What&apos;s included</h2>
          <p className="mt-2 text-center text-sm text-white/50">Every tier, side by side. The two gold columns are our most popular.</p>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="border-b border-white/10 py-3 pr-3 text-[11px] uppercase tracking-wider text-white/45">What you get</th>
                  {COLS.map((c, i) => (
                    <th key={c} className="border-b border-white/10 px-2 py-3 text-center text-[11px] font-extrabold leading-tight"
                      style={{ color: GOLD, background: HILITE.has(i) ? "rgba(201,162,39,0.07)" : undefined }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map(([label, cells]) => (
                  <tr key={label}>
                    <td className="border-b border-white/5 py-3.5 pr-3 text-[13px] text-white/75">{label}</td>
                    {cells.map((cell, i) => (
                      <td key={i} className="border-b border-white/5 px-2 py-3.5 text-center text-[12px] font-bold"
                        style={{
                          color: cell.startsWith("—") ? "rgba(245,245,245,0.25)" : cell.startsWith("✓") ? GOLD : "#f5f5f5",
                          background: HILITE.has(i) ? "rgba(201,162,39,0.07)" : undefined,
                        }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 7 — HOW IT WORKS */}
        <section className="mt-20">
          <h2 className="text-center text-2xl font-black sm:text-3xl">How it works</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <div className="text-3xl font-black" style={{ color: GOLD }}>{s.n}</div>
                <h3 className="mt-2 text-base font-extrabold">{s.h}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-white/55">{s.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 8 — NOTE FROM MEG */}
        <section className="mt-20">
          <blockquote className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 sm:p-9">
            <p className="text-base italic leading-relaxed text-white/75">
              &ldquo;When you sponsor, you&apos;re not buying an ad. You&apos;re keeping a family&apos;s story online,
              searchable, and in front of the lawmakers who can change things. Thank you for standing with us.&rdquo;
            </p>
            <footer className="mt-3 text-sm font-black" style={{ color: GOLD }}>— Meg</footer>
          </blockquote>
        </section>

        {/* 9 — FAQ */}
        <section className="mt-20">
          <h2 className="text-center text-2xl font-black sm:text-3xl">Questions</h2>
          <div className="mt-8 space-y-4">
            {FAQ.map((f) => (
              <div key={f.q} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-sm font-extrabold">{f.q}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-white/60">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 10 — APPLY / FINAL CTA */}
        <section id="apply" className="mt-20 scroll-mt-10">
          <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/[0.03] p-7 sm:p-9">
            <h2 className="text-2xl font-black sm:text-3xl">Become a sponsor</h2>
            <p className="mt-2 text-sm text-white/60">
              Sponsorship is open to anyone who shares the mission. Tell us about your business — every sponsor is
              reviewed for mission fit before going live.
            </p>
            <div className="mt-7">
              <SponsorInquiryForm />
            </div>
          </div>
        </section>

        {/* 11 — STATE PARTNER PROGRAM */}
        <section id="partners" className="mt-20 scroll-mt-10">
          <div
            className="mx-auto max-w-4xl rounded-3xl border border-dashed p-7 sm:p-9"
            style={{ borderColor: "rgba(201,162,39,0.4)", background: "rgba(201,162,39,0.04)" }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(201,162,39,0.9)" }}>
              Not a business? Get paid to grow this.
            </p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">Become a State Partner.</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              You already believe in this fight — now earn for growing it. State Partners connect local
              businesses to their state&rsquo;s report and earn a <strong className="text-white/85">recurring
              commission every month their sponsors stay active</strong>: 10% for warm referrals, 20% if you
              sell and manage your own book, plus team overrides for regional leads. No experience needed —
              we give you the scripts, the training, and the tools.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="/partners"
                className="rounded-full px-5 py-2.5 text-sm font-extrabold text-[#0B1320] transition hover:opacity-90"
                style={{ background: "rgba(201,162,39,1)" }}
              >
                See the partner program →
              </a>
              <span className="text-[12px] text-white/40">Sell once. Get paid every month.</span>
            </div>
          </div>
        </section>

        <footer className="mt-6 text-center text-[11px] text-white/30">
          <div>One Exclusive per state. Two national sponsors. One Movement Partner. · Stand With Meg remains editorially independent.</div>
          <nav className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2">
            <Link href="/report" className="hover:text-white/60">Report</Link>
            <Link href="/survey" className="hover:text-white/60">Survey</Link>
            <Link href="/actors" className="hover:text-white/60">Actors</Link>
            <Link href="/about" className="hover:text-white/60">About</Link>
            <Link href="/contact" className="hover:text-white/60">Contact</Link>
            <Link href="/privacy" className="hover:text-white/60">Privacy</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
