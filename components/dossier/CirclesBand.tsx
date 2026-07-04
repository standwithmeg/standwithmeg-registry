import Link from "next/link";

const MEMBERS = [
  { h: "H1", name: "HopefulMom_2024", role: "Shared judge", st: "TX" },
  { h: "D2", name: "Dad_in_Ohio", role: "Shared GAL", st: "OH" },
];

const STATS: Array<[string, string, string]> = [
  ["29", "Connected", "M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5c0-2.3-4.7-3.5-7-3.5zm8 0c-.3 0-.6 0-1 .1a4.2 4.2 0 0 1 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z"],
  ["27", "Handles", "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"],
  ["5", "Messages today", "M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"],
];

/**
 * The Connection Circles ad band on every public page — layout harvested
 * from Meg's ChatGPT concept: big Anton lockup, gold stat tiles,
 * red-framed room preview, gold quote card.
 */
export function CirclesBand() {
  return (
    <aside className="panel p-8 md:p-10" aria-label="Connection Circles">
      <p className="mb-6 flex items-center gap-4 flex-wrap">
        <span className="action-pill" style={{ padding: "0.5rem 1.1rem", fontSize: "0.72rem", fontFamily: "var(--font-mono)", letterSpacing: "0.14em", borderRadius: "4px" }}>
          Connection Circles
        </span>
        <span className="disclaimer-strip">
          Private <span className="dotsep">•</span> Verified <span className="dotsep">•</span> Handle-first
        </span>
      </p>

      <h2 className="display" style={{ fontSize: "clamp(1.7rem, 1.1rem + 2.4vw, 3rem)", maxWidth: "22ch" }}>
        JOIN THE PRIVATE, ANONYMOUS COMMUNITY OF{" "}
        <span style={{ color: "var(--gold-soft)" }}>VERIFIED FAMILIES.</span>
      </h2>

      <p className="text-sm mt-6 mb-8 max-w-xl leading-relaxed" style={{ color: "var(--ink-70)", borderLeft: "3px solid var(--action-red)", paddingLeft: "1.1rem" }}>
        A private space for family-court parents. Use a handle, find others who
        reported the same court actor, and compare notes anonymously.
      </p>

      <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mb-9">
        {STATS.map(([n, label, path]) => (
          <div key={label} className="panel panel--raised px-6 py-5 flex items-center gap-4">
            <span className="stat-number" style={{ fontSize: "2.4rem", color: "var(--gold-soft)", lineHeight: 1 }}>{n}</span>
            <span className="disclaimer-strip flex-1">{label}</span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--gold)" aria-hidden><path d={path} /></svg>
          </div>
        ))}
      </div>

      <div className="flex gap-4 flex-wrap mb-10">
        <Link href="/connect" className="action-pill" style={{ fontSize: "1rem", padding: "0.95rem 2.2rem" }}>
          Join Connection Circles ↗
        </Link>
        <Link href="/survey" className="btn-quiet" style={{ padding: "0.95rem 1.8rem" }}>Take the survey first</Link>
      </div>

      {/* Room preview — red frame, gold quote */}
      <div className="panel p-6 md:p-7" style={{ borderColor: "color-mix(in srgb, var(--action-red) 55%, transparent)" }}>
        <p className="eyebrow mb-5 flex items-center gap-3">
          Preview <span aria-hidden style={{ width: 34, borderTop: "2px solid var(--action-red)" }} />
        </p>
        {MEMBERS.map((m) => (
          <div key={m.name} className="flex items-center gap-4 mb-4">
            <span className="avatar-chip">{m.h}</span>
            <span>
              <span className="block font-semibold" style={{ color: "var(--white)" }}>{m.name}</span>
              <span className="disclaimer-strip" style={{ letterSpacing: "0.12em" }}>
                {m.role.toUpperCase()} <span className="dotsep">•</span> {m.st}
              </span>
            </span>
          </div>
        ))}
        <blockquote className="panel panel--raised p-5 mt-5 m-0 flex gap-4 items-start" style={{ borderColor: "var(--hairline-gold)", borderLeft: "3px solid var(--gold)" }}>
          <span aria-hidden style={{ color: "var(--gold)", fontFamily: "var(--font-fraunces)", fontSize: "2.4rem", lineHeight: 0.7, marginTop: "0.5rem" }}>&ldquo;</span>
          <p className="serif-note text-base m-0" style={{ color: "var(--ink)" }}>
            We compared timelines and realized the same evaluator appeared in both cases.
          </p>
        </blockquote>
      </div>
    </aside>
  );
}
