import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, rateLimitPresets } from "../../../lib/rate-limit";

export const runtime = "nodejs";

const ALLOWED_SITUATIONS = new Set([
  "opening_statement",
  "objection",
  "cross_examination",
  "direct_examination",
  "closing_argument",
  "pro_se_intro",
  "hearsay_challenge",
  "custody_argument",
  "visitation_argument",
  "contempt_response",
  "general",
]);

const ALLOWED_CASE_TYPES = new Set([
  "family_court",
  "dcf_cps",
  "child_support",
  "divorce",
  "civil",
  "general",
]);

function sanitize(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function sanitizeSituation(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return ALLOWED_SITUATIONS.has(raw) ? raw : "general";
}

function sanitizeCaseType(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return ALLOWED_CASE_TYPES.has(raw) ? raw : "family_court";
}

function sanitizeState(value: unknown): string {
  return String(value || "").trim().replace(/[^a-zA-Z\s,.\-]/g, "").slice(0, 60);
}

function getApiKey(): string {
  // Env-only on purpose: never read .env.local from disk inside a request
  // handler — that file holds every secret, not just this key.
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey.length > 10) return envKey;
  return "";
}

const SYSTEM = `You are the Courtroom Coach for My Court Guide — a platform built by Meg Miller, who spent 12 years fighting in family court pro se.

Your job: Give pro se litigants EXACT word-for-word scripts they can use in court, tailored to their specific situation.

RULES:
- Always give 3-5 specific, usable scripts — not vague advice
- Each script must be word-for-word, ready to say out loud
- Format each script clearly: SITUATION: [label] / SAY THIS: [exact words]
- Include [BRACKETS] for the user to fill in their specific details
- Always include the key rules to remember for that court situation
- Cite relevant case law when applicable (Troxel, Santosky, Stanley v. Illinois, etc.)
- Always say "Your Honor" in every script
- End with: "These are legal information scripts, not legal advice. Adapt them to your judge and jurisdiction."

VOICE: Direct, practical, no fluff. Like a coach in a locker room, not a textbook.`;

export async function POST(request: Request) {
  const limit = rateLimit(request, rateLimitPresets.ai);
  if (limit) return limit;

  try {
    const raw = await request.json();
    const situation = sanitizeSituation(raw.situation);
    const state = sanitizeState(raw.state);
    const caseType = sanitizeCaseType(raw.caseType);
    const userSituation = sanitize(raw.userSituation, 2000);

    if (!state) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }

    const apiKey = getApiKey();
    if (!apiKey) return Response.json({ error: "API key not configured." }, { status: 500 });

    const client = new Anthropic({ apiKey });

    const userMessage = `Generate courtroom scripts for this pro se litigant:

SITUATION TYPE: ${situation.replace(/_/g, " ")}
STATE: ${state}
CASE TYPE: ${caseType.replace(/_/g, " ")}
THEIR SPECIFIC SITUATION: ${userSituation || "Not provided"}

Give me:
1. The 3-5 most important rules to know for this situation
2. 4-6 word-for-word scripts they can use, each labeled with when to use it
3. The key case law citations they should know
4. One "danger zone" — the most common mistake pro se litigants make in this situation

Make every script specific to ${state} where relevant (reference state procedures, ${state} case law if applicable).`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("\n");

    return Response.json({ response: text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Court Coach failed: ${message}` }, { status: 500 });
  }
}
