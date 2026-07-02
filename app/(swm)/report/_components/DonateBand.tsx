import { DONATION_URL } from "../../../../lib/site-links";

const GOLD = "#C9A227";

// Donate prompts woven through the dashboard. Wording is intentionally varied —
// some pointed, some funny — so a long scroll never feels like the same ask
// twice. Order is interleaved (general / mom-leaning / dad-leaning).
export const DONATE_LINES: string[] = [
  "Your ex's attorney bills more in six minutes than this needs all year. Just saying.",
  "Costs less than that Target run you'll regret anyway. Be honest.",
  "Cheaper than your fantasy football buy-in — and the payoff actually matters.",
  "This costs less than what your GAL charged to not return a phone call.",
  "Skip one drive-thru coffee — keep every name on this page public.",
  "Cheaper than the wine this week has earned you. We don't judge.",
  "Donate now — the one bill this month nobody can garnish.",
  "Cheaper than one hour of mediation that fixed absolutely nothing.",
  "Less than a manicure — and this one won't chip.",
  "Costs less than the gas to a courthouse two counties over.",
  "Your retainer is gone. This five bucks actually does something.",
  "Cheaper than the certified mail and copies you've drowned in this month.",
  "Cheaper than your lawyer's voicemail greeting, which is all you ever get anyway.",
  "Funded by real people, not billable hours. Wild concept, we know.",
  "Costs less than the binder you bought to organize the court chaos.",
  "Skip one round at the bar. Keep every name on this page public. Your liver says thanks.",
  "Donate now: somehow still cheaper than filing fees.",
  "Less than courthouse parking — and it actually buys you something.",
  "Keep this page online for the price of one sad courthouse vending-machine snack.",
  "We're not your lawyer — we promise not to pad the bill. A few bucks does it.",
];

// The crowd favorite — used for standalone, single-placement donate bands.
export const FEATURED_DONATE_LINE = DONATE_LINES[0];

type DonateBandProps = {
  line: string;
  /** Extra classes for the outer element (e.g. "md:col-span-2" inside a grid). */
  className?: string;
};

/**
 * A full-width donate band: a rotating quote plus a one-time Donate button and
 * a monthly-give button. Carries its own background and padding, so callers
 * only need to position it (grid span, table cell, or standalone block).
 */
export function DonateBand({ line, className = "" }: DonateBandProps) {
  return (
    <div
      className={`px-6 py-5 flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-center ${className}`.trim()}
      style={{
        backgroundColor: "rgba(185,28,28,0.13)",
        borderTop: "1px solid rgba(201,162,39,0.2)",
        borderBottom: "1px solid rgba(201,162,39,0.2)",
      }}
    >
      <p className="text-sm font-bold text-white leading-snug">{line}</p>
      <div className="flex flex-shrink-0 gap-2">
        <a
          href={DONATION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-5 py-2.5 rounded-lg font-black text-sm whitespace-nowrap hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "#B91C1C", color: "white" }}
        >
          Donate →
        </a>
        <a
          href={DONATION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-5 py-2.5 rounded-lg font-black text-sm whitespace-nowrap hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "transparent", color: GOLD, border: `1.5px solid ${GOLD}` }}
        >
          Give monthly →
        </a>
      </div>
    </div>
  );
}
