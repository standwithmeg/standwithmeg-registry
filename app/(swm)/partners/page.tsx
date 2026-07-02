import type { Metadata } from "next";
import Link from "next/link";
import { RoleCards } from "./_components/RoleCards";
import { EarningsCalculator } from "./_components/EarningsCalculator";
import { PartnerApplyForm } from "./_components/PartnerApplyForm";

const GOLD = "#c9a227";

const TITLE = "Become a State Partner";
const DESCRIPTION =
  "Earn recurring income by connecting local businesses to family-court reports families read and send to lawmakers every month.";
const PARTNERS_OG_IMAGE = "https://my.standwithmeg.com/sponsor/Get_Paid-v2.jpg";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/partners" },
  openGraph: {
    type: "website",
    url: "https://my.standwithmeg.com/partners",
    siteName: "Stand With Meg",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: PARTNERS_OG_IMAGE, width: 1400, height: 732, alt: "Stand With Meg — Become a State Partner" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [PARTNERS_OG_IMAGE],
  },
};

const PROOF = [
  { v: "4,700+", l: "families documented, and counting" },
  { v: "53 · 18", l: "states & countries reached" },
  { v: "$825M+", l: "in family loss reported" },
  { v: "250K+", l: "following Meg sends to the reports" },
];

const STEPS = [
  { n: "1", h: "Find mission-aligned businesses", p: "Local businesses in your state who'd be proud to stand with families." },
  { n: "2", h: "They sponsor your state's report", p: "Their logo on the page families read and send to their lawmakers — and it keeps the report free." },
  { n: "3", h: "You earn — every month they stay", p: "Sign once, get paid monthly. Build a book, build an income." },
];

const WHAT_YOU_GET = [
  { h: "Scripts that work", p: "The exact words to use, written for you." },
  { h: "A brand kit", p: "Everything you need to look legit from day one." },
  { h: "Training", p: "Short, simple, and built for zero experience." },
  { h: "Your territory", p: "Your state, your sponsors, your book." },
  { h: "Real support", p: "A team behind you — not a sink-or-swim gig." },
];

const FOR_YOU = [
  "You believe in the mission and want it to grow.",
  "You want flexible income you can build from home.",
  "You love your community and can have a genuine conversation.",
];

const FAQ = [
  { q: "Do I need sales experience?", a: "No — we give you the scripts and the training. If you can have a genuine conversation with a local business owner, you can do this." },
  { q: "What does it cost me?", a: "Nothing. It's free to become a partner. We never collect payment or banking info at application — only after you're approved, during onboarding." },
  { q: "How and when do I get paid?", a: "Monthly, on collected revenue, for as long as your sponsor stays active. Keep them happy and it keeps paying." },
  { q: "What if a business cancels?", a: "Your residual follows the sponsor — if they leave, that one stops, so keeping them happy is what pays you." },
  { q: "Is this MLM?", a: "No. You earn on real sponsorships you sign, plus an optional team override if you choose to lead a region. There's no buy-in and nothing to purchase." },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-extrabold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
      {children}
    </div>
  );
}

export default function PartnersPage() {
  return (
    <main className="min-h-screen bg-[#0a1526] text-[#f5f5f5]">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
        {/* 1 — HERO */}
        <header className="text-center">
          <a
            href="#apply"
            className="mb-10 block overflow-hidden rounded-2xl border border-white/10 ring-1 ring-white/5 transition-opacity hover:opacity-95"
            aria-label="Get paid to stand with families — apply to become a State Partner"
          >
            <img
              src="/sponsor/Get_Paid-v2.jpg"
              alt="Stand With Meg — Get paid to stand with families. Become a State Partner: real income, real purpose."
              width={1400}
              height={732}
              className="h-auto w-full"
              fetchPriority="high"
            />
          </a>
          <Eyebrow>Become a State Partner</Eyebrow>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-black leading-[1.05] sm:text-5xl">
            Earn recurring income standing with families.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/65">
            You already believe in this fight. Now get paid to grow it — connect local businesses in your state to a
            movement that keeps family-court reports free for thousands of families.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="#apply" className="rounded-xl bg-[#d8332f] px-7 py-3.5 text-sm font-extrabold text-white transition-opacity hover:opacity-90">
              Apply to become a partner →
            </a>
            <a href="#earn" className="rounded-xl border border-[#c9a227]/50 px-7 py-3.5 text-sm font-extrabold transition-colors hover:bg-[#c9a227]/10" style={{ color: GOLD }}>
              See how you earn →
            </a>
          </div>
          <p className="mt-5 text-[12px] text-white/40">No experience needed. We give you the scripts, the training, and the tools.</p>
        </header>

        {/* 2 — WHY IT MATTERS */}
        <section className="mt-20 text-center">
          <Eyebrow>The mission you&apos;re growing</Eyebrow>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-white/65">
            Stand With Meg documents what families are living through inside family courts and CPS — state by state, in
            their own words. Local businesses sponsor these reports so they stay free for every family and lawmaker. You
            connect the two — and you earn for it.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PROOF.map((s) => (
              <div key={s.l} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
                <div className="text-2xl font-black" style={{ color: GOLD }}>{s.v}</div>
                <div className="mt-1 text-[11px] leading-snug text-white/50">{s.l}</div>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-4 max-w-xl text-[13px] text-white/45">
            Real families. Real data. The businesses you sign keep it free — and you earn for connecting them.
          </p>
        </section>

        {/* 3 — HOW IT WORKS */}
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

        {/* 4 — HOW YOU MAKE MONEY */}
        <section className="mt-20">
          <div className="text-center">
            <Eyebrow>The pay</Eyebrow>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Sell once. Get paid every month.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-white/60">
              You earn a recurring commission for as long as your sponsor stays active — plus a bonus on every first payment.
            </p>
          </div>
          <div className="mt-9">
            <RoleCards />
          </div>
          <div className="mt-6 rounded-2xl border border-[#c9a227]/30 bg-[#c9a227]/[0.06] p-5 text-center">
            <span className="text-sm font-bold" style={{ color: GOLD }}>
              Keep 15+ active accounts and your rate jumps to 25% on everything.
            </span>
            <p className="mt-1 text-[12px] text-white/45">Paid monthly, on collected revenue. The more sponsors you keep happy, the more you earn — automatically.</p>
          </div>
        </section>

        {/* 5 — EARNINGS CALCULATOR */}
        <section id="earn" className="mt-20 scroll-mt-10">
          <h2 className="text-center text-2xl font-black sm:text-3xl">See what you&apos;d earn</h2>
          <p className="mt-2 text-center text-sm text-white/50">Drag the slider. The number on the right is recurring — every month.</p>
          <div className="mt-8">
            <EarningsCalculator />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a href="#apply" className="inline-block rounded-xl bg-[#d8332f] px-7 py-3.5 text-sm font-extrabold text-white transition-opacity hover:opacity-90">
              Start earning — apply →
            </a>
            <Link href="/partners/how-to-sell" className="inline-block rounded-xl border border-[#c9a227]/50 px-7 py-3.5 text-sm font-extrabold transition-colors hover:bg-[#c9a227]/10" style={{ color: GOLD }}>
              See exactly what you&apos;d make and how →
            </Link>
          </div>
        </section>

        {/* 6 — WHAT YOU GET */}
        <section className="mt-20">
          <h2 className="text-center text-2xl font-black sm:text-3xl">We set you up</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {WHAT_YOU_GET.map((w) => (
              <div key={w.h} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-sm font-extrabold" style={{ color: GOLD }}>{w.h}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/55">{w.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 7 — WHO THIS IS FOR */}
        <section className="mt-20">
          <h2 className="text-center text-2xl font-black sm:text-3xl">Made for people who already care.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-white/60">
            Advocates. Survivors. Parents who&apos;ve been through it. Anyone who wants to turn their passion into income.
          </p>
          <div className="mx-auto mt-7 grid max-w-3xl gap-3 sm:grid-cols-3">
            {FOR_YOU.map((f) => (
              <div key={f} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[13px] leading-relaxed text-white/70">
                <span className="mr-1.5 font-black" style={{ color: GOLD }}>✓</span>
                {f}
              </div>
            ))}
          </div>
        </section>

        {/* 8 — THE ONE RULE */}
        <section className="mt-20">
          <div className="mx-auto max-w-3xl rounded-3xl border border-[#c9a227]/30 bg-[#c9a227]/[0.05] p-7 text-center sm:p-9">
            <h2 className="text-2xl font-black sm:text-3xl" style={{ color: GOLD }}>We protect families&apos; trust — always.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
              Every sponsor is reviewed and approved for mission fit before they appear. We only work with businesses who
              truly stand with families. No spam, no pressure, no misrepresentation — and <b className="text-white/90">no law firms.</b>{" "}
              Your reputation and theirs stays clean.
            </p>
          </div>
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
          <p className="mt-6 text-center text-sm text-white/50">
            Want the full playbook?{" "}
            <Link href="/partners/how-to-sell" className="font-bold underline" style={{ color: GOLD }}>
              See exactly what you&apos;d sell and what to say →
            </Link>
          </p>
        </section>

        {/* 10 — APPLY */}
        <section id="apply" className="mt-20 scroll-mt-10">
          <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/[0.03] p-7 sm:p-9">
            <h2 className="text-2xl font-black sm:text-3xl">Your state needs a champion. It pays to be one.</h2>
            <p className="mt-2 text-sm text-white/60">
              Apply in two minutes. Start earning this month. We review every partner personally.
            </p>
            <div className="mt-7">
              <PartnerApplyForm />
            </div>
          </div>
        </section>

        <footer className="mt-10 text-center text-[11px] text-white/30">
          <div>Stand With Meg approves every partner. · Partners support public-interest reporting and remain independent of any case or family.</div>
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
