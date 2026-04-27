const ROLE_PREFIX_RE = /^(hon\.?|honorable|judge|justice|magistrate|commissioner|referee|attorney|atty\.?|gal|guardian ad litem|minor'?s counsel|minor counsel|dr\.?|doctor)\s+/i;
const SUFFIX_RE = /\s+(jr\.?|sr\.?|ii|iii|iv|esq\.?|esquire)$/i;

export function actorNameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(ROLE_PREFIX_RE, "")
    .replace(SUFFIX_RE, "")
    .replace(/\s+[a-z]\s+/g, " ")
    .trim();
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
