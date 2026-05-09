const ROLE_PREFIX_RE = /^(hon\.?|honorable|judge|justice|magistrate|commissioner|referee|attorney|atty\.?|gal|guardian ad litem|minor'?s counsel|minor counsel|dr\.?|doctor)\s+/i;
const SUFFIX_RE = /\s+(jr\.?|sr\.?|ii|iii|iv|esq\.?|esquire)$/i;
const NAME_PUNCT_RE = /[.,'"`´‘’]/g;

export const COURT_ACTOR_PUBLIC_THRESHOLD = 3;

// Conservative first-name aliases/misspellings observed in the court-actor data.
// We only rewrite the first token, so distinct people with different last names
// stay separate.
const GIVEN_NAME_ALIASES: Record<string, string> = {
  andy: "andrew",
  drew: "andrew",
  keven: "kevin",
};

function canonicalizeGivenName(tokens: string[]): string[] {
  if (tokens.length < 2) return tokens;
  const first = GIVEN_NAME_ALIASES[tokens[0]] ?? tokens[0];
  return [first, ...tokens.slice(1)];
}

export function actorNameKey(name: string): string {
  const normalized = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(NAME_PUNCT_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(ROLE_PREFIX_RE, "")
    .replace(SUFFIX_RE, "")
    .replace(/\s+[a-z]\s+/g, " ")
    .trim();

  return canonicalizeGivenName(normalized.split(" ").filter(Boolean)).join(" ");
}

function collapseRepeatedLetters(value: string): string {
  return value
    .split(" ")
    .map(token => token.length >= 5 ? token.replace(/([a-z])\1+/g, "$1") : token)
    .join(" ");
}

export function actorLooseNameKey(name: string): string {
  return collapseRepeatedLetters(actorNameKey(name));
}

export function actorBucketKey(name: string, _role: string, stateCode: string | null | undefined): string {
  return `${actorLooseNameKey(name)}|${stateCode ?? ""}`;
}

export function courtActorLocationKey(stateOfOccurrence: string | null, outsideUsCountry: string | null): string | null {
  if (stateOfOccurrence?.trim()) {
    return stateOfOccurrence.trim().toUpperCase();
  }
  if (outsideUsCountry?.trim()) {
    return outsideUsCountry.trim();
  }
  return null;
}

export function actorBucketKeyWithLocation(name: string, _role: string, locationKey: string | null | undefined): string {
  return `${actorLooseNameKey(name)}|${locationKey ?? ""}`;
}

type PublicCourtActor = {
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  count: number;
};

/**
 * Row-level review decision (court_actor_row_review.decision).
 *   duplicate        — exclude row from family counts; still visible.
 *   count_separately — force this row to count as its own family-key.
 *   null/undefined   — normal: row counts using email|location dedupe.
 */
export type CourtActorRowReviewDecision = "duplicate" | "count_separately" | null | undefined;

/**
 * Compute the family-dedupe key for a court_actors row.
 *   - returns null when the row is marked duplicate (caller should skip).
 *   - returns `row:<id>` when count_separately so it survives email dedupe.
 *   - otherwise falls back to `lower(email)|location_key`, then to
 *     `submission:<submission_id>` if no email is on file.
 *
 * Public/admin counting routes call this once per row before bucketing.
 */
export function resolveFamilyKey(args: {
  row_id: string;
  reporter_email: string | null | undefined;
  submission_id: string;
  location_key: string | null;
  review_decision?: CourtActorRowReviewDecision;
}): string | null {
  if (args.review_decision === "duplicate") return null;
  if (args.review_decision === "count_separately") return `row:${args.row_id}`;
  const email = args.reporter_email?.trim()?.toLowerCase();
  if (email) return `${email}|${args.location_key ?? ""}`;
  return `submission:${args.submission_id}`;
}

// Minimal alias resolver shape — kept here so lib/court-actors.ts has no
// dependency on lib/court-actor-similarity.ts (which imports back from
// this file). Concrete implementation lives in the similarity module.
export interface CourtActorAliasResolver {
  resolve(rawName: string, locationKey: string | null): {
    canonical_name_key: string;
    canonical_name: string;
    canonical_role: string | null;
  } | null;
}

export function buildPublicCourtActors(actors: Array<{
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  submission_id: string;
}>, resolver?: CourtActorAliasResolver): PublicCourtActor[] {
  type Bucket = {
    role: string;
    name: string;
    court_or_county: string | null;
    state_code: string | null;
    location_key: string | null;
    families: Set<string>;
    roleCounts: Map<string, number>;
    casingCounts: Map<string, number>;
    courtCounts: Map<string, number>;
  };

  const buckets = new Map<string, Bucket>();

  for (const a of actors) {
    if (!a.role || !a.name || !a.location_key) continue;

    const aliasHit = resolver?.resolve(a.name, a.location_key) ?? null;
    const effectiveName = aliasHit?.canonical_name ?? a.name;
    const normalizedName = actorBucketKeyWithLocation(effectiveName, a.role, a.location_key);
    if (!normalizedName.split("|")[0]) continue;

    const key = normalizedName;
    if (!buckets.has(key)) {
      buckets.set(key, {
        role: aliasHit?.canonical_role ?? a.role,
        name: effectiveName,
        court_or_county: a.court_or_county,
        state_code: a.state_code,
        location_key: a.location_key,
        families: new Set(),
        roleCounts: new Map(),
        casingCounts: new Map(),
        courtCounts: new Map(),
      });
    }

    const b = buckets.get(key)!;
    b.families.add(a.submission_id);
    b.roleCounts.set(a.role, (b.roleCounts.get(a.role) ?? 0) + 1);
    // Track casing using the original reporter name so the most-common
    // spelling still wins when no canonical override is present.
    const casingName = aliasHit?.canonical_name ?? a.name;
    b.casingCounts.set(casingName, (b.casingCounts.get(casingName) ?? 0) + 1);
    if (a.court_or_county) {
      b.courtCounts.set(a.court_or_county, (b.courtCounts.get(a.court_or_county) ?? 0) + 1);
    }
  }

  function mostFrequent<T>(m: Map<T, number>): T | null {
    let best: T | null = null;
    let max = 0;
    for (const entry of Array.from(m.entries())) {
      const [k, v] = entry;
      if (v > max) { max = v; best = k; }
    }
    return best;
  }

  function roleSummary(roles: Map<string, number>) {
    const sorted = Array.from(roles.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (sorted.length === 0) return "Court Actor";
    if (sorted.length === 1) return sorted[0][0];
    return `${sorted[0][0]} + ${sorted.length - 1} role${sorted.length === 2 ? "" : "s"}`;
  }

  return Array.from(buckets.values())
    .filter(b => b.families.size >= COURT_ACTOR_PUBLIC_THRESHOLD)
    .map(b => ({
      role: roleSummary(b.roleCounts),
      name: mostFrequent(b.casingCounts) ?? b.name,
      court_or_county: mostFrequent(b.courtCounts),
      state_code: b.state_code,
      location_key: b.location_key,
      count: b.families.size,
    }))
    .sort((a, b) => b.count - a.count);
}
