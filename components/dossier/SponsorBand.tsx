import Link from "next/link";

const StarIcon = (
  <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.4" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <path d="m12 6.5 1.7 3.5 3.8.5-2.8 2.7.7 3.8-3.4-1.8-3.4 1.8.7-3.8-2.8-2.7 3.8-.5z" fill="var(--gold)" stroke="none" />
  </svg>
);
const ShieldIcon = (
  <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.4" aria-hidden>
    <path d="M12 2 4 5.5v6c0 5 3.5 8.5 8 10.5 4.5-2 8-5.5 8-10.5v-6z" />
    <path d="m12 8 1.2 2.4 2.6.4-1.9 1.9.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.9 2.6-.4z" fill="var(--gold)" stroke="none" />
  </svg>
);

/** Sponsor placement bands — layout harvested from Meg's ChatGPT concept. */
export function SponsorBand({ variant = "national", stateName }: { variant?: "national" | "state"; stateName?: string }) {
  if (variant === "state") {
    return (
      <aside className="panel p-7 md:p-8" aria-label={`Local sponsors for ${stateName}`}>
        <div className="flex items-center justify-between flex-wrap gap-4 mb-7">
          <div>
            <p className="eyebrow eyebrow--gold mb-1.5" style={{ fontSize: "0.66rem" }}>Made possible by local sponsors</p>
            <h2 className="display text-xl md:text-2xl">LOCAL SPONSORS KEEP THIS REPORT FREE</h2>
          </div>
          <Link href="/sponsor#state-sponsors" className="sponsor-pill" style={{ padding: "0.6rem 1.3rem", fontSize: "0.82rem" }}>
            Become a sponsor →
          </Link>
        </div>

        {/* State Exclusive — gold glow, centered */}
        <div className="panel panel--raised relative overflow-hidden p-10 text-center mb-4" style={{ borderColor: "var(--hairline-gold)" }}>
          <div className="gold-glow absolute inset-0" aria-hidden />
          <div className="relative">
            <p className="eyebrow eyebrow--gold mb-3" style={{ fontSize: "0.66rem" }}>— State Exclusive —</p>
            <p className="text-3xl md:text-4xl">
              <span className="lockup-first accent-underline" style={{ color: "var(--white)" }}>Your logo here</span>
            </p>
            <p className="serif-note text-sm mt-4" style={{ color: "var(--ink-70)" }}>
              Be the only business on this report —<br />this logo also goes on the {stateName} PDF cover
            </p>
          </div>
        </div>

        {/* Three Community Supporter rows */}
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="panel relative overflow-hidden p-6 flex items-center gap-8">
              <span className="gold-glow rounded-full flex-shrink-0" style={{ width: 72, height: 72 }} aria-hidden />
              <div className="text-center flex-1">
                <p className="lockup-first text-2xl md:text-3xl" style={{ color: "var(--white)" }}>Your business here</p>
                <p className="disclaimer-strip mt-1.5" style={{ color: "var(--gold-soft)", letterSpacing: "0.16em" }}>
                  Local sponsor <span className="dotsep">•</span> slot {n}
                </p>
              </div>
            </div>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="panel p-7 md:p-8" aria-label="National sponsors">
      <div className="grid lg:grid-cols-[1fr_1.7fr] gap-8 items-start">
        <div>
          <p className="eyebrow mb-2" style={{ fontSize: "0.66rem" }}>Presented by</p>
          <h2 className="display" style={{ fontSize: "clamp(1.5rem, 1rem + 1.6vw, 2.2rem)" }}>
            THIS REPORT IS BROUGHT TO YOU BY —
          </h2>
          <hr className="rule-red" />
          <p className="text-sm mt-4 leading-relaxed" style={{ color: "var(--ink-70)" }}>
            Your support fuels independent investigative journalism that exposes
            patterns, empowers families, and drives change.
          </p>
        </div>
        <div>
          <div className="flex justify-end mb-4">
            <Link href="/sponsor" className="action-pill" style={{ padding: "0.6rem 1.4rem", fontSize: "0.85rem" }}>
              Become a sponsor →
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { label: "Presenting sponsor", icon: StarIcon },
              { label: "Co-sponsor", icon: ShieldIcon },
            ].map((t) => (
              <div key={t.label} className="panel panel--raised p-6 flex items-center gap-5">
                {t.icon}
                <div>
                  <p className="eyebrow mb-1.5" style={{ fontSize: "0.6rem" }}>{t.label}</p>
                  <p className="lockup-first text-xl" style={{ color: "var(--white)" }}>Your business here</p>
                  <p className="eyebrow eyebrow--gold mt-1.5" style={{ fontSize: "0.55rem" }}>Premium visibility &amp; partnership</p>
                  <Link href="/sponsor" className="nav-link text-xs mt-2 inline-block">Become a sponsor →</Link>
                </div>
              </div>
            ))}
          </div>
          <p className="disclaimer-strip mt-4"><span className="dotsep">★</span> Only two national sponsors in the country</p>
        </div>
      </div>
    </aside>
  );
}
