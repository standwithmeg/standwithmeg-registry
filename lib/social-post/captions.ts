import { publicAssetOrigin } from "../court-actor-public-assets";
import { buildLegislatorBlock, formatFirstComment, stateCapitolTag } from "./legislators";
import { stateName } from "./legislators";
import { enforceInstagramCaptionLimit } from "./caption-limits";

function sanitizeActorName(name: string): string {
  // Remove parenthetical nicknames and other parens that can break downstream parsers / deserializers in Blotato or platform APIs.
  // e.g. "James (Jim) Roeder" -> "James Roeder"; "O'Grady" kept but ' is ok.
  return name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type CaptionInput = {
  actorName: string;
  role: string;
  county: string | null;
  stateAbbr: string;
  familyCount: number;
  stateFamilyCount: number | null;
  medianFinancialLoss: number | null;
  proSePct: number | null;
  medianMonthsLost: number | null;
  movementTotal: number | null;
  quotes: string[];
  shareUrl?: string;
  rotationKey?: string;
};

export type GeneratedCaptions = {
  facebook: string;
  instagram: string;
  x: string;
  firstComment: string;
  legislatorComment: string;
  locationTag: string;
  hashtags: string;
  missingLegislators: string[];
};

function formatProfessionalPageShare(input: CaptionInput, hashtags: string): string {
  const role = roleLabelForCaption(input.role);
  const location = countyDisplay(input.county, input.stateAbbr);
  const shareLink = actorShareLink(input);
  const families = `${input.familyCount} ${input.familyCount === 1 ? "family" : "families"}`;

  return [
    "🔥 This just went live on the Stand With Meg business page — share it to your profile so your network actually sees it.",
    "",
    `⚖️ ${role} ${input.actorName} · ${location}`,
    `${families} independently placed this name on the public record.`,
    "",
    "👀 If it landed on the business page first, use Share → Share to your page/profile. Court actors stay searchable. Families are watching.",
    "",
    "Read the full report + add your story 👇",
    shareLink,
    "",
    hashtags,
  ].join("\n");
}

function roleEmoji(role: string): string {
  const normalized = role.toLowerCase();
  // Magistrate maps to 📋 per playbook; check before judge.
  if (normalized.includes("magistrate")) return "📋";
  if (normalized.includes("judge") || normalized.includes("commissioner")) return "⚖️";
  if (normalized.includes("therapist") || normalized.includes("counselor") || normalized.includes("doctor")) return "🩺";
  if (normalized.includes("gal") || normalized.includes("child representative") || normalized.includes("guardian")) return "🛡️";
  if (normalized.includes("attorney") || normalized.includes("lawyer") || normalized.includes("counsel")) return "📜";
  if (normalized.includes("cps") || normalized.includes("evaluator")) return "📋";
  return "⚠️";
}

function roleLabelForCaption(role: string): string {
  const normalized = role.toLowerCase();
  if (normalized.includes("judge")) return "Judge";
  if (normalized.includes("magistrate")) return "Magistrate";
  if (normalized.includes("attorney")) return "Attorney";
  if (normalized.includes("gal") || normalized.includes("guardian") || normalized.includes("child representative")) return "GAL / Child Representative";
  if (normalized.includes("therapist") || normalized.includes("counselor")) return "Therapist / Counselor";
  if (normalized.includes("cps")) return "CPS";
  if (normalized.includes("evaluator")) return "Custody Evaluator";
  if (normalized.includes("mediator")) return "Mediator";
  return role;
}

function roleLabelForHashtag(role: string): string {
  const label = roleLabelForCaption(role);
  if (label === "Judge" || label === "Magistrate") return "Judge";
  if (label === "Attorney") return "Attorney";
  if (label === "GAL / Child Representative") return "GAL";
  if (label === "Therapist / Counselor") return "Therapist";
  if (label === "Custody Evaluator") return "Evaluator";
  return label.replace(/\//g, "").replace(/\s+/g, "");
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "$0";
  return "$" + Math.round(n).toLocaleString();
}

const ISSUE_TAG_POOLS: Record<string, string[]> = {
  judge: ["JudicialBias", "JudicialAccountability", "FamilyCourtCorruption", "JudgeAccountability"],
  magistrate: ["JudicialBias", "JudicialAccountability", "FamilyCourtCorruption"],
  attorney: ["FamilyCourtCorruption", "ParentRights", "DueProcess"],
  gal: ["GALaccountability", "GuardianAdLitem", "BestInterestOfTheChild"],
  cps: ["CPSAccountability", "FamilyCourtCorruption", "SystemicAbuse"],
  therapist: ["ReunificationTherapy", "FamilyCourtCorruption", "ParentRights"],
  evaluator: ["CustodyEvaluator", "JudicialBias", "FamilyCourtCorruption"],
  default: ["FamilyCourtCorruption", "ParentRights", "DueProcess", "JudicialAccountability"],
};

function stableChoice(seed: string, pool: string[]): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return pool[Math.abs(hash) % pool.length];
}

function issueTag(role: string, actorName: string): string {
  const label = roleLabelForCaption(role).toLowerCase();
  let pool = ISSUE_TAG_POOLS.default;
  if (label.includes("judge")) pool = ISSUE_TAG_POOLS.judge;
  else if (label.includes("magistrate")) pool = ISSUE_TAG_POOLS.magistrate;
  else if (label.includes("attorney")) pool = ISSUE_TAG_POOLS.attorney;
  else if (label.includes("gal") || label.includes("child representative")) pool = ISSUE_TAG_POOLS.gal;
  else if (label.includes("cps")) pool = ISSUE_TAG_POOLS.cps;
  else if (label.includes("therapist") || label.includes("counselor")) pool = ISSUE_TAG_POOLS.therapist;
  else if (label.includes("evaluator")) pool = ISSUE_TAG_POOLS.evaluator;
  return stableChoice(`${role}-${actorName}`, pool);
}

function sanitizeHashtagInput(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function buildHashtags(input: CaptionInput): { line: string; nameTag: string; countyTag: string; issueTag: string } {
  const nameTag = sanitizeHashtagInput(roleLabelForHashtag(input.role) + input.actorName);
  const isLouisiana = input.stateAbbr.toUpperCase() === "LA";
  const isParish = /\bparish\b/i.test(input.county ?? "");
  const countySuffix = isLouisiana || isParish ? "Parish" : "County";
  const countyBase = input.county
    ? sanitizeHashtagInput(input.county.replace(/\bcounty\b/gi, "").replace(/\bparish\b/gi, "").trim()) + countySuffix
    : stateName(input.stateAbbr).replace(/\s+/g, "");
  const countyTag = `${countyBase}${input.stateAbbr.toUpperCase()}`;
  const issue = issueTag(input.role, input.actorName);
  const line = `#StandWithMeg #${nameTag} #${input.stateAbbr.toUpperCase()}FamilyCourt #${countyTag} #${issue}`;
  return { line, nameTag, countyTag, issueTag: issue };
}

function liabilityScrub(text: string): string {
  // Remove case-number-like tokens and explicit minor names if they appear.
  return text
    .replace(/\b\d{2,4}[-/]\d{1,4}[-/]?\d{0,4}\b/g, "")
    .replace(/\b[A-Z]{2}\d{4,}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function pickQuotes(rawQuotes: string[], max = 2): string[] {
  const scrubbed = rawQuotes.map(q => liabilityScrub(q)).filter(q => q.length > 8);
  return scrubbed.slice(0, max);
}

const MAX_CAPTION_QUOTE_CHARS = 280;

function excerptQuote(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_CAPTION_QUOTE_CHARS) return clean;

  const clipped = clean.slice(0, MAX_CAPTION_QUOTE_CHARS).trimEnd();
  const sentenceEnd = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("! "),
    clipped.lastIndexOf("? "),
  );
  if (sentenceEnd >= 120) {
    return `${clipped.slice(0, sentenceEnd + 1)}...`;
  }

  const wordEnd = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, wordEnd > 120 ? wordEnd : clipped.length)}...`;
}

function formatQuote(text: string, stateAbbr: string): string {
  const t = excerptQuote(text);
  return `“${t}” — Anonymous Parent · ${stateAbbr.toUpperCase()}`;
}

function countyDisplay(county: string | null, stateAbbr: string): string {
  if (!county) return stateName(stateAbbr);
  const trimmed = county.trim();
  // If the value already includes "County" or "Parish", keep it as-is (just clean spacing).
  if (/\b(county|parish)\b/i.test(trimmed)) {
    const clean = trimmed.replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").trim();
    return `${clean}, ${stateName(stateAbbr)}`;
  }
  return `${trimmed} County, ${stateName(stateAbbr)}`;
}

function framingParagraph(input: CaptionInput): string {
  const name = sanitizeActorName(input.actorName);
  const role = roleLabelForCaption(input.role);
  const location = countyDisplay(input.county, input.stateAbbr);
  return `${name} is a family court ${role.toLowerCase()} in ${location}. ${input.familyCount} separate ${stateName(input.stateAbbr)} families placed ${input.familyCount === 1 ? "their name" : "their names"} in the Stand With Meg registry, independently — reporting concerns about their experience in court.`;
}

function actorShareLink(input: CaptionInput): string {
  const raw = input.shareUrl?.trim();
  if (!raw) return "https://my.standwithmeg.com";
  if (raw.startsWith("http")) return raw.replace(/\/+$/, "");
  const origin = publicAssetOrigin().replace(/\/+$/, "");
  return `${origin}${raw.startsWith("/") ? "" : "/"}${raw}`.replace(/\/+$/, "");
}

function cta(input: CaptionInput): string {
  const role = roleLabelForCaption(input.role);
  const location = countyDisplay(input.county, input.stateAbbr);
  const shareLink = actorShareLink(input);
  const safeName = sanitizeActorName(input.actorName);
  return `If you've faced ${role} ${safeName} in ${location} — mothers and fathers alike — your story belongs on the public record. Read the public report and add your story here 👇\n${shareLink}`;
}

function statsBlock(input: CaptionInput): string[] {
  const hasAny =
    input.stateFamilyCount || input.medianFinancialLoss || input.proSePct || input.medianMonthsLost;
  if (!hasAny) return [];

  const lines: string[] = [`📊 What ${stateName(input.stateAbbr)} families report:`];
  if (input.stateFamilyCount) {
    lines.push(`• ${input.stateFamilyCount.toLocaleString()} families on the record`);
  }
  if (input.medianFinancialLoss) {
    lines.push(`• ${fmtMoney(input.medianFinancialLoss)} median family burden`);
  }
  if (input.proSePct) {
    lines.push(`• ${input.proSePct}% of parents forced pro se`);
  }
  if (input.medianMonthsLost) {
    lines.push(`• ${input.medianMonthsLost} months median time lost with their kids`);
  }
  return lines;
}

const SIGNOFF = `🤍 Stand With Meg — putting the family court on the public record, one family at a time. Subscribe, share, and donate at standwithmeg.com to keep these names searchable.`;
const DISCLAIMER = "FAMILY-REPORTED SUBMISSIONS.";

function buildBody(input: CaptionInput, hashtags: string): string {
  const quotes = pickQuotes(input.quotes);
  const role = roleLabelForCaption(input.role);
  const location = countyDisplay(input.county, input.stateAbbr);

  const safeName = sanitizeActorName(input.actorName);
  const parts: string[] = [
    `${roleEmoji(input.role)} ${safeName} — ${role} — ${location} — has now been named on the public record by ${input.familyCount} ${input.familyCount === 1 ? "family" : "families"} at Stand With Meg.`,
    "",
    framingParagraph(input),
    "",
    "In their own words:",
    "",
  ];

  if (quotes.length === 0) {
    parts.push(`“Families in ${stateName(input.stateAbbr)} continue to add their stories.” — Anonymous Parent · ${input.stateAbbr.toUpperCase()}`);
  } else {
    parts.push(...quotes.map(q => formatQuote(q, input.stateAbbr)));
  }

  parts.push("", cta(input));

  const stats = statsBlock(input);
  if (stats.length > 0) {
    parts.push("", ...stats);
  }

  if (input.movementTotal) {
    parts.push(
      "",
      `${input.movementTotal.toLocaleString()} families nationwide — and now global. Not an isolated incident. A pattern.`
    );
  }

  parts.push("", actorShareLink(input), "", SIGNOFF, "", DISCLAIMER, "", hashtags);

  return parts.join("\n");
}

export function generateCaptions(input: CaptionInput): GeneratedCaptions {
  const legislatorResult = buildLegislatorBlock({
    stateAbbr: input.stateAbbr,
    county: input.county,
    rotationKey: input.rotationKey,
  });
  const { line: hashtags } = buildHashtags(input);

  const role = roleLabelForCaption(input.role);
  const location = countyDisplay(input.county, input.stateAbbr);
  const safeName = sanitizeActorName(input.actorName);

  const opener = `⚠️ 🚨 NAMED ON THE PUBLIC RECORD: ${role.toUpperCase()} ${safeName.toUpperCase()} 🚨 ⚠️`;
  const body = buildBody(input, hashtags);

  const facebook = [opener, "", body].join("\n");
  const instagram = enforceInstagramCaptionLimit([opener, "", body].join("\n"));

  // X: keep it under 270 chars plus hashtags.
  const shortQuotes = pickQuotes(input.quotes, 1);
  const quoteBit = shortQuotes.length > 0 ? `"${shortQuotes[0].slice(0, 80)}${shortQuotes[0].length > 80 ? "…" : ""}" ` : "";
  const xCore = `⚠️ 🚨 ${role} ${safeName} — ${location} — named by ${input.familyCount} ${input.familyCount === 1 ? "family" : "families"} on the public record at Stand With Meg. ${quoteBit}Add your story → standwithmeg.com  ${DISCLAIMER} ${hashtags}`;

  let x = xCore;
  if (x.length > 270) {
    x = `⚠️ 🚨 ${role} ${safeName} — ${location} — named by ${input.familyCount} ${input.familyCount === 1 ? "family" : "families"} on the public record. Add your story → standwithmeg.com  ${DISCLAIMER} ${hashtags}`;
  }

  const legislatorComment = legislatorResult.block
    ? formatFirstComment(legislatorResult.block, input.stateAbbr, input.county)
    : "";
  const firstComment = formatProfessionalPageShare(input, hashtags);

  return {
    facebook,
    instagram,
    x,
    firstComment,
    legislatorComment,
    locationTag: legislatorResult.block?.locationTag ?? stateCapitolTag(input.stateAbbr),
    hashtags,
    missingLegislators: legislatorResult.missing,
  };
}

export { stateCapitolTag } from "./legislators";
