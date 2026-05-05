/**
 * Placeholder email detection.
 *
 * Some submitters use throwaway placeholder emails when they want to
 * stay anonymous (anonymous@anonymous.com, n/a, none, etc). When two
 * unrelated families both submit with the same placeholder in the same
 * state, our (email, state) dedupe key will silently collapse them
 * into a single counted family — which is wrong. The KS reconciliation
 * caught one such case (Family Court / Unsure county / Anonymous +
 * CPS / Bourbon county / Z R, both anonymous@anonymous.com) only because
 * an admin manually clicked count_separately on one of them.
 *
 * Treat any email matching this list/regex as "unsafe for automatic
 * dedupe": the dedupe key falls back to source_table:source_id (one
 * family per row) instead of email_key. The admin review modal still
 * surfaces these as a "placeholder email" group so they can be merged
 * by hand when they actually are one family.
 */

const EXPLICIT_PLACEHOLDER_EMAILS: readonly string[] = [
  "anonymous@anonymous.com",
  "anonymous@anon.com",
  "anon@anon.com",
  "anon@anonymous.com",
  "none@none.com",
  "n/a@n/a.com",
  "na@na.com",
  "test@test.com",
  "noreply@noreply.com",
  "no-reply@noreply.com",
  "fake@fake.com",
  "placeholder@placeholder.com",
  "unknown@unknown.com",
];

const PLACEHOLDER_LOCAL_PARTS = new Set([
  "anonymous",
  "anon",
  "none",
  "n/a",
  "na",
  "noreply",
  "no-reply",
  "fake",
  "placeholder",
  "unknown",
  "test",
  "tbd",
]);

const PLACEHOLDER_DOMAINS = new Set([
  "anonymous.com",
  "anon.com",
  "none.com",
  "n/a.com",
  "na.com",
  "noreply.com",
  "fake.com",
  "placeholder.com",
  "unknown.com",
  "test.com",
  "example.com",
  "example.org",
  "example.net",
  "tbd.com",
]);

const EXPLICIT_PLACEHOLDER_SET = new Set(EXPLICIT_PLACEHOLDER_EMAILS);

export function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isPlaceholderEmail(value: string | null | undefined): boolean {
  const email = normalizeEmail(value);
  if (!email || !email.includes("@")) return false;
  if (EXPLICIT_PLACEHOLDER_SET.has(email)) return true;
  const [local, domain] = email.split("@", 2);
  if (PLACEHOLDER_DOMAINS.has(domain)) return true;
  if (PLACEHOLDER_LOCAL_PARTS.has(local) && /^(.*\.)?(com|net|org|info)$/.test(domain)) return true;
  return false;
}

/**
 * The dedupe-safe family key for a row.
 *
 * - Real email + state          → `${email}|${state}`  (collapses dups)
 * - Placeholder email + state   → `placeholder:${sourceTable}:${sourceId}`  (no collapse)
 * - Blank email                 → `${sourceTable}:${sourceId}`              (no collapse)
 *
 * Anonymous rows that share a placeholder email in the same state are
 * therefore counted separately by default. Admin can still merge them by
 * hand from the review modal once they confirm they are one family.
 */
export function dedupeFamilyKey(args: {
  email: string | null | undefined;
  state: string;
  sourceTable: string;
  sourceId: string;
}): string {
  const email = normalizeEmail(args.email);
  const state = String(args.state ?? "").trim().toUpperCase();
  if (!email) return `${args.sourceTable}:${args.sourceId}`;
  if (isPlaceholderEmail(email)) return `placeholder:${args.sourceTable}:${args.sourceId}`;
  return `${email}|${state}`;
}
