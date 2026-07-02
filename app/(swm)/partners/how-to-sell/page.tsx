import type { Metadata } from "next";
import Link from "next/link";
import { EarningsCalculator } from "../_components/EarningsCalculator";

const GOLD = "#c9a227";

const TITLE = "State Partner Playbook";
const DESCRIPTION =
  "Learn what State Partners sell, how monthly payouts work, who to approach locally, and the exact sponsor pitch to use with confidence.";
const PARTNERS_OG_IMAGE = "https://my.standwithmeg.com/sponsor/Get_Paid-v2.jpg";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/partners/how-to-sell" },
  openGraph: {
    type: "website",
    url: "https://my.standwithmeg.com/partners/how-to-sell",
    siteName: "Stand With Meg",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: PARTNERS_OG_IMAGE, width: 1400, height: 732, alt: "Stand With Meg State Partner playbook" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [PARTNERS_OG_IMAGE],
  },
};

// Per-sale earnings (20% recurring + 10% first-payment bonus)
const PER_SALE: [string, string, string, string][] = [
  ["Community Supporter", "$99–$179/mo", "$20–$36", "$10–$18"],
  ["State Exclusive", "$179–$399/mo", "$36–$80", "$18–$40"],
  ["National Co-Sponsor", "$1,900/mo", "$380", "$190"],
  ["National Presenting", "$2,900/mo", "$580", "$290"],
  ["Movement Partner", "$4,900/mo", "$980", "$490"],
];

// Recurring "stacks" — the visual peak of the money section
const STACKS: [string, string][] = [
  ["5 sponsors (avg ~$160)", "~$160/mo"],
  ["10 sponsors", "~$320/mo"],
  ["20 sponsors", "~$640/mo"],
  ["40 sponsors", "~$1,280/mo"],
  ["+ one National sponsor", "+$380–$980/mo"],
];

const FOUR_POINTS = [
  { h: "Exclusivity", p: "“Only one business per state. Once it's taken, it's gone.”" },
  { h: "The audience", p: "“Real local families, plus the lawmakers they send it to.”" },
  { h: "The cause", p: "“Your sponsorship keeps it free for families.”" },
  { h: "The proof", p: "“Thousands of families already documented — this is real.”" },
];

const APPROACH = [
  { h: "Best fits", p: "Local & family-owned businesses, family wellness, faith-based, parent-support, survivor-founded, and any values-driven brand that wants to be seen standing with families." },
  { h: "Where to find them", p: "People you already know, local business groups, chambers, community pages, and businesses you're already a customer of." },
  { h: "Skip", p: "Law firms and attorneys (not a fit), and anything off-mission — we don't approve those." },
];

const OBJECTIONS = [
  { q: "“How does it help my business?”", a: "You're seen by an engaged local audience and you're publicly standing with families. Most sponsors do it because they believe in it — the visibility is the bonus." },
  { q: "“Is this political / am I taking a side?”", a: "No. You're not affiliated with any case or family — you're supporting public-interest reporting so it stays free." },
  { q: "“Can I think about it?”", a: "Of course — just know it's one per state, so I can hold [State] for you for a few days." },
  { q: "“It's not in the budget.”", a: "We also have smaller supporter spots — same good cause, lower cost. Want me to send both?" },
];

const PROCESS = [
  "Have a real conversation with a business (use the pitch).",
  "Show them the page and the open spot.",
  "They say yes → you submit them (logo, contact, tier).",
  "We approve for mission fit and put them live.",
  "They're billed → you get paid that month, and every month they stay.",
];

const GIVE = ["Scripts", "Brand kit", "The sponsor page (your sales tool)", "Training", "Your territory", "A team behind you"];

const FAQ = [
  { q: "Do I need experience?", a: "No — we give you the scripts and training." },
  { q: "What does it cost?", a: "Nothing. It's free to join, and we never take payment info at application." },
  { q: "When do I get paid?", a: "Monthly, on collected revenue, for as long as your sponsor stays." },
  { q: "What if they cancel?", a: "Your residual follows the sponsor — keeping them happy is what pays you." },
  { q: "Is this MLM?", a: "No. You earn on real sponsorships you sign, plus an optional team override if you lead a region." },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-extrabold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-black sm:text-3xl">{children}</h2>;
}

export default function HowToSellPage() {
  return (
    <main className="min-h-screen bg-[#0a1526] text-[#f5f5f5]">
      <div className="mx-auto max-w-4xl px-5 py-16 sm:py-20">
        {/* 1 — HERO */}
        <header>
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <Link href="/partners" className="text-xs font-semibold" style={{ color: "rgba(201,162,39,0.8)" }}>
              ← Become a partner
            </Link>
            <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">Stand With Meg</span>
          </div>
          <div className="mt-8 text-center">
            <Eyebrow>Partner Playbook</Eyebrow>
            <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-black leading-[1.05] sm:text-5xl">
              Earn in your area. We&apos;ll show you exactly how.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/65">
              You don&apos;t need experience or a sales background. Here&apos;s precisely what you&apos;d sell, what
              you&apos;d make, and what to say — laid out step by step.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/partners#apply" className="rounded-xl bg-[#d8332f] px-7 py-3.5 text-sm font-extrabold text-white transition-opacity hover:opacity-90">
                Apply to become a partner →
              </Link>
              <a href="#make" className="rounded-xl border border-[#c9a227]/50 px-7 py-3.5 text-sm font-extrabold transition-colors hover:bg-[#c9a227]/10" style={{ color: GOLD }}>
                See what you&apos;d make ↓
              </a>
            </div>
          </div>
        </header>

        {/* 2 — WHAT YOU'RE ACTUALLY SELLING */}
        <section className="mt-20">
          <SectionTitle>What you&apos;re actually selling</SectionTitle>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            You&apos;re helping local businesses <b style={{ color: GOLD }}>sponsor your state&apos;s family-court report</b>{" "}
            — the report real families read and send to their lawmakers. One business gets the exclusive spot per state.
            Their logo goes on the report; their sponsorship keeps it <b>free for families</b>. You connect the two — and
            you earn every month they stay.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Not cold-calling strangers all day", "Not a scam", "Not something you need a license or experience for"].map((n) => (
              <div key={n} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-white/65">
                <span className="mr-1.5 font-black text-white/30">✕</span>
                {n}
              </div>
            ))}
          </div>
        </section>

        {/* 3 — WHAT YOU'LL MAKE */}
        <section id="make" className="mt-20 scroll-mt-10">
          <SectionTitle>What you&apos;ll make</SectionTitle>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-relaxed text-white/70">
            You earn <b style={{ color: GOLD }}>20% of every sponsorship you sign — every month it stays active</b>{" "}
            (recurring), plus a <b style={{ color: GOLD }}>10% bonus on their first payment</b>. You sign it once. It pays
            you every month.
          </div>

          {/* Per-sale table */}
          <h3 className="mt-8 text-base font-extrabold">What each sale pays you</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  {["What you sign", "They pay", "You earn / mo", "+ first-month bonus"].map((h, i) => (
                    <th key={h} className={`border-b border-white/10 py-3 ${i === 0 ? "pr-3" : "px-3"} text-[11px] uppercase tracking-wider text-white/45`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PER_SALE.map(([what, pay, earn, bonus]) => (
                  <tr key={what}>
                    <td className="border-b border-white/5 py-3.5 pr-3 text-[13px] font-semibold text-white/80">{what}</td>
                    <td className="border-b border-white/5 px-3 py-3.5 text-[13px] text-white/55">{pay}</td>
                    <td className="border-b border-white/5 px-3 py-3.5 text-[14px] font-black" style={{ color: GOLD }}>{earn}</td>
                    <td className="border-b border-white/5 px-3 py-3.5 text-[13px] text-white/55">{bonus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recurring stacks — the peak */}
          <h3 className="mt-10 text-base font-extrabold">How it adds up</h3>
          <p className="mt-1 text-[13px] text-white/55">Because it&apos;s recurring, your income stacks every time you add a sponsor.</p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-[#c9a227]/30">
            {STACKS.map(([book, income], i) => (
              <div
                key={book}
                className="flex items-center justify-between gap-4 px-5 py-4"
                style={{ background: i % 2 === 0 ? "rgba(201,162,39,0.06)" : "transparent", borderTop: i === 0 ? undefined : "1px solid rgba(255,255,255,0.06)" }}
              >
                <span className="text-sm font-semibold text-white/75">{book}</span>
                <span className="text-xl font-black" style={{ color: GOLD }}>{income}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-white/70">
            Sign just <b style={{ color: GOLD }}>2 sponsors a month</b> and by the end of a year you&apos;ve built{" "}
            <b style={{ color: GOLD }}>~$768/month that keeps paying you</b> — even in months you don&apos;t sign anyone new.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Keep <b className="text-white/85">15+ active sponsors</b> and your commission jumps from{" "}
            <b className="text-white/85">20% → 25%</b> on everything.
          </p>

          {/* Reused calculator */}
          <div className="mt-8">
            <EarningsCalculator />
          </div>
        </section>

        {/* 4 — HOW TO EXPLAIN IT */}
        <section className="mt-20">
          <SectionTitle>How to explain it</SectionTitle>

          <h3 className="mt-6 text-sm font-extrabold uppercase tracking-wider text-white/45">The one-sentence version (memorize this)</h3>
          <blockquote className="mt-2 rounded-2xl border-l-4 p-5 text-base italic leading-relaxed text-white/80" style={{ borderColor: GOLD, background: "rgba(201,162,39,0.05)" }}>
            &ldquo;I help local businesses sponsor our state&apos;s family-court report — your logo goes on the report
            families read and send to lawmakers, and it keeps the report free for families.&rdquo;
          </blockquote>

          <h3 className="mt-7 text-sm font-extrabold uppercase tracking-wider text-white/45">The 30-second version</h3>
          <blockquote className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[15px] italic leading-relaxed text-white/70">
            &ldquo;Stand With Meg documents what families are going through in family court, state by state, and turns it
            into reports families share with their legislators. Those reports stay free because one local business sponsors
            each one. That business gets their logo seen by every family who reads it — and they&apos;re publicly standing
            with families. There&apos;s only <b className="not-italic" style={{ color: GOLD }}>one exclusive spot per state</b>,
            and [State]&apos;s is open. Want to see how your logo would look on it?&rdquo;
          </blockquote>

          <h3 className="mt-7 text-sm font-extrabold uppercase tracking-wider text-white/45">The 4 things to always hit</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {FOUR_POINTS.map((p) => (
              <div key={p.h} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-sm font-extrabold" style={{ color: GOLD }}>{p.h}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{p.p}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-[#c9a227]/30 bg-[#c9a227]/[0.05] p-5">
            <div className="text-sm font-extrabold" style={{ color: GOLD }}>Show, don&apos;t tell</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
              Pull up the sponsor page on your phone and show them the example card and the real report. &ldquo;This is
              exactly how your business would appear.&rdquo; Seeing it closes more than describing it.
            </p>
          </div>
        </section>

        {/* 5 — WHO TO APPROACH */}
        <section className="mt-20">
          <SectionTitle>Who to approach</SectionTitle>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {APPROACH.map((a) => (
              <div key={a.h} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-sm font-extrabold" style={{ color: GOLD }}>{a.h}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{a.p}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-white/50">Tip: start with businesses you already have a relationship with. Warm beats cold every time.</p>
        </section>

        {/* 6 — COMMON QUESTIONS */}
        <section className="mt-20">
          <SectionTitle>Handling the common questions</SectionTitle>
          <div className="mt-6 space-y-4">
            {OBJECTIONS.map((o) => (
              <div key={o.q} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-sm font-extrabold text-white/85">{o.q}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-white/60">
                  <span className="font-bold" style={{ color: GOLD }}>You: </span>&ldquo;{o.a}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 7 — THE PROCESS */}
        <section className="mt-20">
          <SectionTitle>The process — first hello to getting paid</SectionTitle>
          <ol className="mt-6 space-y-3">
            {PROCESS.map((step, i) => (
              <li key={step} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-black" style={{ background: "rgba(201,162,39,0.15)", color: GOLD }}>
                  {i + 1}
                </span>
                <span className="self-center text-[14px] leading-relaxed text-white/70">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* 8 — WORKED EXAMPLE */}
        <section className="mt-20">
          <SectionTitle>A real deal, start to finish</SectionTitle>
          <div className="mt-6 rounded-3xl border border-[#c9a227]/30 bg-[#c9a227]/[0.05] p-7 sm:p-9">
            <p className="text-base italic leading-relaxed text-white/80">
              &ldquo;Jane&apos;s a parent in Washington. She mentioned Stand With Meg to a gutter company she already uses.
              She showed the owner the Washington report on her phone and said, &lsquo;You&apos;d be the only business on
              this — it goes to families and lawmakers across the state, and it keeps the report free.&rsquo; The owner
              said yes to the $299/mo Exclusive.&rdquo;
            </p>
            <p className="mt-4 text-lg font-black" style={{ color: GOLD }}>
              Jane earns $59.80 every month that business stays — for one conversation with someone she already knew.
            </p>
          </div>
        </section>

        {/* 9 — WHAT WE GIVE YOU */}
        <section className="mt-20">
          <SectionTitle>What we give you</SectionTitle>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {GIVE.map((g) => (
              <div key={g} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center text-[13px] font-semibold text-white/75">
                {g}
              </div>
            ))}
          </div>
        </section>

        {/* 10 — FAQ */}
        <section className="mt-20">
          <SectionTitle>FAQ</SectionTitle>
          <div className="mt-6 space-y-4">
            {FAQ.map((f) => (
              <div key={f.q} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-sm font-extrabold">{f.q}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-white/60">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 11 — CTA */}
        <section className="mt-20">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center sm:p-10">
            <h2 className="text-2xl font-black sm:text-3xl">Ready to earn in your area?</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-white/60">Apply in two minutes. We&apos;ll set you up with everything above.</p>
            <Link href="/partners#apply" className="mt-6 inline-block rounded-xl bg-[#d8332f] px-7 py-3.5 text-sm font-extrabold text-white transition-opacity hover:opacity-90">
              Apply to become a State Partner →
            </Link>
          </div>
        </section>

        <footer className="mt-10 text-center text-[11px] text-white/30">
          <div>Sponsors support public-interest reporting. Not affiliated with any case or family. Stand With Meg remains editorially independent.</div>
          <nav className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2">
            <Link href="/about" className="hover:text-white/60">About</Link>
            <Link href="/contact" className="hover:text-white/60">Contact</Link>
            <Link href="/privacy" className="hover:text-white/60">Privacy</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
