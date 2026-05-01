/**
 * One-time scan of existing survey_submissions free-text fields for
 * named court actors (judges, attorneys, GALs, etc.).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/extract-court-actors.ts            # dry run, writes CSV
 *   npx tsx --env-file=.env.local scripts/extract-court-actors.ts --commit   # actually inserts
 *   npx tsx --env-file=.env.local scripts/extract-court-actors.ts --ai       # include AI pass for uncertain rows (costs money)
 *   npx tsx --env-file=.env.local scripts/extract-court-actors.ts --commit --ai
 *
 * Two passes:
 *   1. Regex pass — pattern-match Judge/Attorney/GAL/Evaluator names.
 *      Free, fast, catches ~40-60% of named actors.
 *   2. AI pass (opt-in) — for submissions with substantial free-text
 *      (>100 chars) that the regex pass found nothing in, send to Claude
 *      Haiku to extract names. Costs ~$0.002 per submission.
 *
 * All extracted rows get source='extracted_regex' or 'extracted_ai' so
 * they're flagged as machine-extracted and excluded from the public
 * threshold until an admin promotes them.
 *
 * Writes /tmp/court-actors-extraction-preview.csv for review.
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { courtActorLocationKey } from "../lib/court-actors";

// Fallback: tsx's --env-file has parsing quirks around comment lines, so
// we also read .env.local ourselves and fill in anything missing.
function loadEnvFallback() {
  if (!existsSync(".env.local")) return;
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFallback();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const COMMIT = process.argv.includes("--commit");
const USE_AI = process.argv.includes("--ai");

// Columns we'll scan — all the free-text ones where people tend to name people.
const TEXT_FIELDS = [
  "impact_quote",
  "conflict_description",
  "other_allegation_details",
  "allegation_root_cause",
  "lost_milestones_description",
  "allegation_other_detail",
] as const;

type Submission = {
  id: string;
  state_of_occurrence: string | null;
  outside_us_country: string | null;
  case_county: string | null;
  impact_quote: string | null;
  conflict_description: string | null;
  other_allegation_details: string | null;
  allegation_root_cause: string | null;
  lost_milestones_description: string | null;
  allegation_other_detail: string | null;
};

type Extracted = {
  submission_id: string;
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  notes: string | null;
  source: "extracted_regex" | "extracted_ai";
  snippet: string; // for CSV/audit
};

// ─────────────────────────────────────────────────────────────
// Regex pass
// ─────────────────────────────────────────────────────────────
//
// Patterns match things like:
//   "Judge Smith"          → Judge
//   "Judge John Smith"     → Judge
//   "Attorney Jane Doe"    → Attorney
//   "GAL Susan Miller"     → GAL / Child Representative
//   "our GAL, Mary Lee"    → GAL
//   "evaluator Dr. Kim"    → Psychological Evaluator
//   "Commissioner Brown"   → Judge (commissioners act as judges)
//
// Name part: a capitalized word, optionally followed by another cap word
// (first + last). We skip common false positives (stopwords, all caps).

// NAME = strict first word with optional last word. Both must start with
// a capital letter followed by lowercase letters. No case-insensitive flag.
// REQUIRE at least one of these to be followed by another capitalized
// word (so "Smith" alone won't match — "Roy Smith" will). This massively
// reduces false positives like "Judge Then" or "GAL And".
const NAME_STRICT = "([A-Z][a-z]{2,}(?:[\\-'][A-Z][a-z]+)?(?:\\s+(?:[A-Z]\\.\\s*)?[A-Z][a-z]+(?:[\\-'][A-Z][a-z]+)?)+)";

// For single-word names (rare, only accepted for Dr./Hon./Judge prefix)
const NAME_SINGLE = "([A-Z][a-z]{3,}(?:[\\-'][A-Z][a-z]+)?)";

const ROLE_PATTERNS: Array<{ regex: RegExp; role: string; requireTwoWord?: boolean }> = [
  // Judge / Commissioner / Magistrate / Referee / Hon. — single-word OK because
  // "Judge Smith" is common. Still case-sensitive for the NAME portion.
  { regex: new RegExp(`\\b(?:Judge|judge|JUDGE|Commissioner|commissioner|Magistrate|magistrate|Referee|referee|Hon\\.?|hon\\.?|HON\\.?)\\s+${NAME_STRICT}`, "g"), role: "Judge" },
  { regex: new RegExp(`\\b(?:Judge|judge|JUDGE|Commissioner|commissioner|Magistrate|magistrate|Hon\\.?|hon\\.?)\\s+${NAME_SINGLE}`, "g"), role: "Judge" },

  // Attorney / Lawyer / Counsel — require 2-word name (too many false positives otherwise)
  { regex: new RegExp(`\\b(?:Attorney|attorney|ATTORNEY|Lawyer|lawyer|LAWYER|Counsel|counsel)\\s+${NAME_STRICT}`, "g"), role: "Attorney (Other)" },

  // GAL / Guardian ad Litem / Child Representative — require 2-word name
  { regex: new RegExp(`\\b(?:GAL|gal|Gal|Guardian\\s+[Aa]d\\s+[Ll]item|Child\\s+Representative|child\\s+representative|Child[''']s\\s+Attorney|Child[''']s\\s+attorney)\\s+${NAME_STRICT}`, "g"), role: "GAL / Child Representative" },

  // Custody/Psychological Evaluator — require 2-word name
  { regex: new RegExp(`\\b(?:Custody\\s+[Ee]valuator|custody\\s+evaluator|Psychological\\s+[Ee]valuator|psychological\\s+evaluator|Evaluator|evaluator|Psychologist|psychologist)\\s+${NAME_STRICT}`, "g"), role: "Custody Evaluator" },
  // Dr. + name (single word OK — "Dr. Kim" is fine)
  { regex: new RegExp(`\\b(?:Dr\\.?|dr\\.?)\\s+${NAME_STRICT}`, "g"), role: "Custody Evaluator" },

  // CPS / DCF / Social Worker — REQUIRE 2-word name (single words here are almost always junk)
  { regex: new RegExp(`\\b(?:CPS|cps|Cps|DCF|dcf|Dcf|DSS|dss|Dss|Social\\s+[Ww]orker|social\\s+worker|Case\\s+[Ww]orker|case\\s+worker|Caseworker|caseworker)\\s+${NAME_STRICT}`, "g"), role: "CPS Worker" },

  // Mediator — require 2-word
  { regex: new RegExp(`\\b(?:Mediator|mediator|MEDIATOR)\\s+${NAME_STRICT}`, "g"), role: "Mediator" },

  // Reunification therapist/counselor — require 2-word
  { regex: new RegExp(`\\b(?:Reunification\\s+[Tt]herapist|reunification\\s+therapist|Reunification\\s+[Cc]ounselor|reunification\\s+counselor)\\s+${NAME_STRICT}`, "g"), role: "Reunification Therapist" },
];

// Any word in the extracted name that matches this list → reject the whole name.
// These are common English words + pronouns that capitalize at start of sentences
// and slip through.
const NON_NAME_WORDS = new Set([
  // pronouns & determiners
  "The", "A", "An", "My", "Our", "His", "Her", "Their", "Your", "This", "That", "These", "Those",
  "I", "You", "We", "He", "She", "It", "They", "Them", "Me", "Us", "Him",
  // common sentence-starters
  "And", "But", "Or", "So", "Then", "Now", "Also", "Yet", "However", "Furthermore",
  "When", "Where", "While", "Who", "Whom", "Whose", "What", "Which", "Why", "How",
  "After", "Before", "Since", "Until", "During", "Throughout",
  // verbs people capitalize
  "Took", "Told", "Said", "Says", "Tried", "Tries", "Made", "Makes", "Got", "Gets", "Saw", "Sees",
  "Went", "Goes", "Came", "Comes", "Did", "Does", "Was", "Were", "Been", "Being",
  "Have", "Has", "Had", "Will", "Would", "Could", "Should", "Might",
  "Like", "Love", "Hate", "Want", "Need", "Know", "Knows", "Knew",
  // abuse-court context words
  "Court", "Courts", "Family", "County", "State", "States", "Case", "Cases", "Justice",
  "Department", "Services", "Protection", "Protective", "Child", "Children", "Children's",
  "Social", "Civil", "Criminal", "Minor", "Minors", "Custody", "Visitation", "Parent",
  "Parents", "Parenting", "Father", "Mother", "Dad", "Mom", "Husband", "Wife", "Ex",
  "Attorney", "Lawyer", "Judge", "Judges", "GAL", "Evaluator",
  // honorifics (matched by the pattern prefix, not a name)
  "Dr", "Mr", "Mrs", "Ms", "Sir", "Madam",
  // geography
  "North", "South", "East", "West", "Central", "United",
  // misc
  "Mine", "Ours", "Yes", "No", "Okay", "Ok",
  // prepositions / connectives that Title-Case easily
  "Between", "Within", "Among", "Through", "Across", "Beyond", "Behind",
  "Above", "Below", "Under", "Over", "Into", "Onto", "Upon", "Toward", "Towards",
  // other legalese that trips the pattern
  "Practices", "Practice", "Office", "Offices", "Firm", "Law", "Legal",
  "Bar", "Pro", "Per", "Regarding", "Re",
]);

function cleanName(n: string): string | null {
  const trimmed = n.trim().replace(/\s+/g, " ").replace(/['']/g, "'");
  if (trimmed.length < 3) return null;

  const words = trimmed.split(/\s+/);

  // Reject if ANY word is in the non-name list
  for (const w of words) {
    const stripped = w.replace(/[\.,;:]/g, ""); // strip trailing punctuation for the check
    if (NON_NAME_WORDS.has(stripped)) return null;
  }

  // Reject all-caps (probably acronym)
  if (trimmed === trimmed.toUpperCase() && trimmed.length < 8) return null;

  // Reject names shorter than 4 chars total
  if (trimmed.replace(/\s/g, "").length < 4) return null;

  return trimmed;
}

function regexExtract(sub: Submission): Extracted[] {
  const rawResults: Extracted[] = [];

  for (const field of TEXT_FIELDS) {
    const text = (sub as Record<string, string | null>)[field];
    if (!text || text.length < 5) continue;

    for (const { regex, role } of ROLE_PATTERNS) {
      const re = new RegExp(regex.source, regex.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const rawName = m[1];
        const cleaned = cleanName(rawName);
        if (!cleaned) continue;

        const snippet = text.slice(Math.max(0, m.index - 30), Math.min(text.length, m.index + m[0].length + 30));
        rawResults.push({
          submission_id: sub.id,
          role,
          name: cleaned,
          court_or_county: sub.case_county || null,
          state_code: sub.state_of_occurrence,
          location_key: courtActorLocationKey(sub.state_of_occurrence, sub.outside_us_country),
          notes: `[extracted] ${snippet.trim()}`,
          source: "extracted_regex",
          snippet,
        });
      }
    }
  }

  // Dedup within the submission. When one name CONTAINS another (same role),
  // prefer the longer one. "Jennifer" vs "Jennifer Johnson" → keep "Jennifer Johnson".
  // Also drop exact duplicates (same role + same name lowercased).
  const byRole = new Map<string, Extracted[]>();
  for (const r of rawResults) {
    if (!byRole.has(r.role)) byRole.set(r.role, []);
    byRole.get(r.role)!.push(r);
  }

  const final: Extracted[] = [];
  for (const entry of Array.from(byRole.entries())) {
    const [, group] = entry;
    // Sort longest name first within each role
    const sorted = Array.from(group).sort((a, b) => b.name.length - a.name.length);
    const keptNamesLower: string[] = [];
    for (const item of sorted) {
      const nameLower = item.name.toLowerCase();
      // Skip if this name is already a substring of (or equal to) a kept longer name
      const redundant = keptNamesLower.some(kept =>
        kept === nameLower ||
        kept.startsWith(nameLower + " ") ||
        kept.endsWith(" " + nameLower) ||
        kept.includes(" " + nameLower + " ")
      );
      if (redundant) continue;
      keptNamesLower.push(nameLower);
      final.push(item);
    }
  }

  return final;
}

// ─────────────────────────────────────────────────────────────
// AI pass (Claude Haiku)
// ─────────────────────────────────────────────────────────────
//
// Only called when --ai flag is set AND the submission has substantial
// free text (>100 chars) that the regex pass found nothing in.
//
// Returns a list of extracted actors or empty array.

type AIActor = { role: string; name: string };

// AI sometimes returns placeholder strings instead of real names when
// the text implies someone exists but doesn't name them. Filter those out.
function isValidAIName(raw: string): boolean {
  const name = raw.trim();
  if (name.length < 3) return false;

  const lower = name.toLowerCase();
  // Placeholder words
  const placeholders = [
    "unknown", "unnamed", "not named", "not specified", "no name",
    "n/a", "none", "anonymous", "tbd", "pending", "undisclosed",
    "withheld", "first name", "last name",
  ];
  for (const p of placeholders) {
    if (lower.includes(p)) return false;
  }

  // "Judge X - description" → AI is describing, not naming
  if (name.includes(" - ")) return false;
  if (name.includes(" – ")) return false;

  // Must contain at least one capital letter (real names do)
  if (!/[A-Z]/.test(name)) return false;

  // Must contain at least some letters (not just digits/punctuation)
  if (!/[a-zA-Z]{3,}/.test(name)) return false;

  return true;
}

// Cache AI responses to a local JSON file so dry-run iterations don't
// re-hit the API after the first run. Cleared only if you delete the cache.
const AI_CACHE_PATH = "/tmp/swm-ai-extract-cache.json";
const aiCache: Record<string, AIActor[]> = (() => {
  try { return existsSync(AI_CACHE_PATH) ? JSON.parse(readFileSync(AI_CACHE_PATH, "utf8")) : {}; }
  catch { return {}; }
})();
let aiCacheDirty = false;
function saveAICache() {
  if (aiCacheDirty) { writeFileSync(AI_CACHE_PATH, JSON.stringify(aiCache), "utf8"); aiCacheDirty = false; }
}

async function aiExtract(sub: Submission): Promise<Extracted[]> {
  const text = TEXT_FIELDS
    .map(f => (sub as Record<string, string | null>)[f])
    .filter(Boolean)
    .join("\n\n");
  if (text.length < 50) return [];

  // Check cache first — key by submission id since text is static
  let parsed: AIActor[];
  if (aiCache[sub.id] !== undefined) {
    parsed = aiCache[sub.id];
  } else {
    parsed = await callAIForExtraction(text, sub.id);
    aiCache[sub.id] = parsed;
    aiCacheDirty = true;
    if (Object.keys(aiCache).length % 50 === 0) saveAICache(); // periodic flush
  }

  return parsed
    .filter(p => p && typeof p.role === "string" && typeof p.name === "string")
    .map(p => ({ role: p.role.trim(), name: p.name.trim() }))
    .filter(p => isValidAIName(p.name))
    .map(p => ({
      submission_id: sub.id,
      role: p.role,
      name: p.name,
      court_or_county: sub.case_county || null,
      state_code: sub.state_of_occurrence,
      location_key: courtActorLocationKey(sub.state_of_occurrence, sub.outside_us_country),
      notes: `[AI-extracted from free-text]`,
      source: "extracted_ai" as const,
      snippet: text.slice(0, 200),
    }));
}

async function callAIForExtraction(text: string, subId: string): Promise<AIActor[]> {

  const systemPrompt = `You are an assistant extracting named court actors from family-court survey responses. Only extract proper names of real people (judges, attorneys, GALs, evaluators, CPS workers, therapists, mediators). Ignore first names alone unless clearly tied to a role. Return JSON. Do not include speculative names.

Allowed roles (choose best match):
- Judge
- Attorney (Mine)
- Attorney (Opposing)
- Attorney (Other)
- GAL / Child Representative
- Custody Evaluator
- Psychological Evaluator
- CPS Worker
- Therapist / Counselor
- Mediator
- Reunification Therapist
- Other`;

  const userPrompt = `Extract any named court actors from this text. Return ONLY a JSON array in the form:
[{"role": "...", "name": "..."}]
If no names are present, return [].

Text:
"""
${text.slice(0, 4000)}
"""`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const raw = res.content[0]?.type === "text" ? res.content[0].text : "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`  AI extract failed for ${subId}:`, (err as Error).message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${COMMIT ? "COMMIT" : "DRY RUN"}${USE_AI ? " + AI pass" : ""}`);
  console.log("Fetching all submissions with free-text…");

  // Fetch all submissions (paginated past 1000-row limit)
  const submissions: Submission[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from("survey_submissions")
      .select("id, state_of_occurrence, outside_us_country, case_county, impact_quote, conflict_description, other_allegation_details, allegation_root_cause, lost_milestones_description, allegation_other_detail")
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    submissions.push(...(data as Submission[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`Loaded ${submissions.length} submissions.\n`);

  // Fetch existing court_actors so we don't create duplicates
  const existing = new Set<string>();
  let f2 = 0;
  while (true) {
    const { data } = await sb.from("court_actors").select("submission_id, role, name").range(f2, f2 + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      existing.add(`${r.submission_id}|${r.role}|${r.name.toLowerCase().trim()}`);
    }
    if (data.length < 1000) break;
    f2 += 1000;
  }
  console.log(`${existing.size} actors already exist in DB (skipping duplicates).\n`);

  // Regex pass
  console.log("Running regex pass…");
  const regexHits: Extracted[] = [];
  const submissionsWithoutRegexHits: Submission[] = [];
  for (const sub of submissions) {
    const hits = regexExtract(sub);
    if (hits.length > 0) regexHits.push(...hits);
    else {
      // Would AI have anything to work with?
      const hasText = TEXT_FIELDS.some(f => {
        const v = (sub as Record<string, string | null>)[f];
        return v && v.length >= 100;
      });
      if (hasText) submissionsWithoutRegexHits.push(sub);
    }
  }
  console.log(`  Regex extracted ${regexHits.length} actor mentions from ${new Set(regexHits.map(h => h.submission_id)).size} submissions.`);
  console.log(`  ${submissionsWithoutRegexHits.length} submissions have substantial free text but no regex hits${USE_AI ? " — will try AI." : " — skip (use --ai to try AI on these)."}\n`);

  // AI pass (opt-in)
  const aiHits: Extracted[] = [];
  if (USE_AI && submissionsWithoutRegexHits.length > 0) {
    console.log("Running AI pass (rate-limited)…");
    let done = 0;
    for (const sub of submissionsWithoutRegexHits) {
      const hits = await aiExtract(sub);
      aiHits.push(...hits);
      done++;
      if (done % 10 === 0) {
        process.stdout.write(`\r  ${done}/${submissionsWithoutRegexHits.length}`);
      }
      // Tiny delay to stay well under rate limits
      await new Promise(r => setTimeout(r, 100));
    }
    console.log(`\n  AI extracted ${aiHits.length} actor mentions.\n`);
    saveAICache();
  }

  // Combine + dedup against existing rows
  const allHits = [...regexHits, ...aiHits];
  const newHits = allHits.filter(h => {
    const k = `${h.submission_id}|${h.role}|${h.name.toLowerCase().trim()}`;
    return !existing.has(k);
  });
  console.log(`Total new actors to insert: ${newHits.length}`);
  console.log(`  Regex: ${newHits.filter(h => h.source === "extracted_regex").length}`);
  console.log(`  AI:    ${newHits.filter(h => h.source === "extracted_ai").length}\n`);

  // Write CSV preview
  const csvPath = "/tmp/court-actors-extraction-preview.csv";
  const csvLines = [
    "source,role,name,state_code,court_or_county,submission_id,snippet",
    ...newHits.map(h => [
      h.source,
      csv(h.role),
      csv(h.name),
      h.state_code ?? "",
      csv(h.court_or_county ?? ""),
      h.submission_id,
      csv(h.snippet.slice(0, 100)),
    ].join(",")),
  ];
  writeFileSync(csvPath, csvLines.join("\n"), "utf8");
  console.log(`Preview CSV written: ${csvPath}\n`);

  // Top extracted names (quick sanity check)
  const byName = new Map<string, number>();
  for (const h of newHits) {
    const k = `${h.role} — ${h.name}${h.location_key ? ` (${h.location_key})` : h.state_code ? ` (${h.state_code})` : ""}`;
    byName.set(k, (byName.get(k) ?? 0) + 1);
  }
  const topNames = Array.from(byName.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (topNames.length > 0) {
    console.log("Top 15 most-extracted names:");
    for (const entry of topNames) {
      const [name, count] = entry;
      console.log(`  ${count.toString().padStart(3)}  ${name}`);
    }
    console.log();
  }

  if (!COMMIT) {
    console.log("DRY RUN — no changes written to the database.");
    console.log("If the preview looks right, run again with --commit.");
    return;
  }

  // Commit
  console.log("Inserting into court_actors…");
  const rowsToInsert = newHits.map(h => ({
    submission_id: h.submission_id,
    role: h.role,
    name: h.name,
    court_or_county: h.court_or_county,
    state_code: h.state_code,
    notes: h.notes,
    source: h.source,
  }));

  let inserted = 0;
  for (let i = 0; i < rowsToInsert.length; i += 100) {
    const batch = rowsToInsert.slice(i, i + 100);
    const { error } = await sb.from("court_actors").insert(batch);
    if (error) { console.error(`  Batch error:`, error.message); continue; }
    inserted += batch.length;
    process.stdout.write(`\r  ${inserted}/${rowsToInsert.length}`);
  }
  console.log(`\n\nDone. Inserted ${inserted} extracted actors.`);
}

function csv(s: string): string {
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

main().catch(err => { console.error(err); process.exit(1); });
