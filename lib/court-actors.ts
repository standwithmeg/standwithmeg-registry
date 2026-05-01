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
