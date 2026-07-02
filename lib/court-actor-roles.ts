export const COURT_ACTOR_ROLE_OPTIONS = [
  "Judge",
  "Commissioner",
  "Attorney",
  "GAL / Child Representative",
  "Attorney / GAL / Child Representative",
  "CPS Worker",
  "Custody Evaluator",
  "Psychological Evaluator",
  "Therapist / Counselor",
  "Reunification Therapist",
  "Mediator",
  "Supervised Visitation Supervisor",
  "Parenting Coordinator",
  "Family Doctor",
  "Hospital",
  "Government Agency",
  "Law Enforcement",
  "Court Clerk / Court Staff",
  "School / District",
  "Expert Witness",
  "Other",
] as const;

export type CourtActorRole = (typeof COURT_ACTOR_ROLE_OPTIONS)[number];

const ROLE_OPTION_SET = new Set<string>(COURT_ACTOR_ROLE_OPTIONS);

function roleKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[()]/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

const ROLE_ALIASES = new Map<string, CourtActorRole>([
  ["attorney mine", "Attorney"],
  ["attorney opposing", "Attorney"],
  ["attorney other", "Attorney"],
  ["lawyer", "Attorney"],
  ["counsel", "Attorney"],
  ["gal/child representative", "GAL / Child Representative"],
  ["gal/childre representative", "GAL / Child Representative"],
  ["guardian ad litem", "GAL / Child Representative"],
  ["child representative", "GAL / Child Representative"],
  ["judge/gal/child representative", "GAL / Child Representative"],
  ["attorney/gal", "Attorney / GAL / Child Representative"],
  ["attorney/gal/child representative", "Attorney / GAL / Child Representative"],
  ["attorney/guardian ad litem", "Attorney / GAL / Child Representative"],
  ["therapist", "Therapist / Counselor"],
  ["counselor", "Therapist / Counselor"],
  ["family physician", "Family Doctor"],
  ["doctor", "Family Doctor"],
  ["medical doctor", "Family Doctor"],
  ["agency", "Government Agency"],
  ["government", "Government Agency"],
  ["police", "Law Enforcement"],
  ["sheriff", "Law Enforcement"],
  ["court clerk", "Court Clerk / Court Staff"],
  ["court staff", "Court Clerk / Court Staff"],
  ["school", "School / District"],
  ["school district", "School / District"],
  ["expert", "Expert Witness"],
]);

export function normalizeCourtActorRoleLabel(value: string | null | undefined): string {
  const clean = (value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const direct = COURT_ACTOR_ROLE_OPTIONS.find(option => roleKey(option) === roleKey(clean));
  if (direct) return direct;
  return ROLE_ALIASES.get(roleKey(clean)) ?? clean;
}

export function isCourtActorRoleOption(value: string | null | undefined): value is CourtActorRole {
  return ROLE_OPTION_SET.has(normalizeCourtActorRoleLabel(value));
}

export function courtActorRoleOptionOrOther(value: string | null | undefined): CourtActorRole {
  const normalized = normalizeCourtActorRoleLabel(value);
  return ROLE_OPTION_SET.has(normalized) ? normalized as CourtActorRole : "Other";
}
