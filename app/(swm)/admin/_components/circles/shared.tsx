import { colors } from "../../../../../lib/design-tokens";

export const GOLD = colors.gold.DEFAULT;
export const RED = colors.evidence.DEFAULT;
export const INK = colors.ink.DEFAULT;
export const PAPER = colors.paper.DEFAULT;

export function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtCents(cents: number) {
  return "$" + (cents / 100).toFixed(0);
}

export function fmtAgo(iso: string | null) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

export function accessTypeLabel(type: string) {
  const labels: Record<string, string> = {
    supporter_monthly: "Paid $6/mo",
    supporter_annual: "Paid $50/yr",
    hardship: "Hardship (free)",
    sponsored_month: "Sponsored (donation)",
    sponsored_year: "Sponsored (donation)",
    sponsor_pool: "Sponsor pool (donation)",
    promo: "Promo (free)",
  };
  return labels[type] || type;
}

export function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active" || s === "fulfilled") {
    return { label: status, color: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.28)" };
  }
  if (s === "pending") {
    return { label: status, color: GOLD, bg: "rgba(201,162,39,0.12)", border: "rgba(201,162,39,0.28)" };
  }
  return { label: status, color: "#fca5a5", bg: "rgba(185,28,28,0.15)", border: "rgba(185,28,28,0.35)" };
}

export function StatusBadge({ status }: { status: string }) {
  const b = statusBadge(status);
  return (
    <span className="inline-block rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wide" style={{ backgroundColor: b.bg, color: b.color, border: `1px solid ${b.border}` }}>
      {b.label}
    </span>
  );
}
