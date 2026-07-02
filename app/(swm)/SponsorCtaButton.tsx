import type { CSSProperties } from "react";

// Distinct emerald — deliberately different from the site's red and gold CTAs
// so "Become a Sponsor" stands out as its own thing.
export const SPONSOR_GREEN = "#047857";

const DEFAULT_CLASS =
  "inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-bold text-sm transition-colors hover:opacity-90";

interface SponsorCtaButtonProps {
  /** Override the wrapper classes (e.g. a compact pill in a header). */
  className?: string;
  style?: CSSProperties;
  label?: string;
  newTab?: boolean;
}

export function SponsorCtaButton({
  className,
  style,
  label = "Become a Sponsor →",
  newTab = false,
}: SponsorCtaButtonProps) {
  return (
    <a
      href="/sponsor"
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
      className={className ?? DEFAULT_CLASS}
      style={{ backgroundColor: SPONSOR_GREEN, color: "white", ...style }}
    >
      {label}
    </a>
  );
}
