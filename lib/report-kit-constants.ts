export const REPORT_KIT_PRICE_CENTS = 7900;

/** Exact-email normalization for access grants and storage keys. No wildcards. */
export function normalizeKitEmail(value: unknown): string | null {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.length === 0 || raw.length > 200) return null;
  // Reject glob/wildcard grants and other non-exact local parts.
  if (/[*?%!]/.test(raw)) return null;
  // Practical single-address shape: local@domain.tld (no spaces, one @).
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(raw)) {
    return null;
  }
  // After the charset check, still block residual wildcards if a broader pattern is ever used.
  if (raw.includes("*") || raw.includes("?")) return null;
  return raw;
}