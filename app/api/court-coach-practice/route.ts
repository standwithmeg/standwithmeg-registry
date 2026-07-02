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

const MAX_INPUT_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CONTENT = 2000;

function sanitizeText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function sanitizeSituation(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return ALLOWED_SITUATIONS.has(raw) ? raw : "general";
}

function sanitizeState(value: unknown): string {
  return String(value || "").trim().replace(/[^a-zA-Z\s,.\-]/g, "").slice(0, 60);
}

function sanitizeHistory(value: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const msg of value.slice(-MAX_HISTORY_MESSAGES)) {
    if (!msg || typeof msg !== "object") continue;
    const role = msg.role === "assistant" ? "assistant" : "user";
    const content = sanitizeText(msg.content, MAX_HISTORY_CONTENT);
    if (content) out.push({ role, content });
  }
  return out;
}

function getApiKey(): string {
  // Env-only on purpose: never read .env.local from disk inside a request
  // handler — that file holds every secret, not just this key.
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey.length > 10) return envKey;
  return "";
}

const JUDGE_SYSTEM = `You are playing the role of a realistic family court judge in a practice session for a pro se litigant.

YOUR JOB: Help them get better at speaking in court by giving realistic judicial responses and feedback.

RULES:
- Stay in character as the judge — use "Counsel" or "[their name]"
- Be realistic — not always easy, not always harsh. Like a real judge.
- If they forget to say "Your Honor" — correct them immediately
- If they cite case law correctly — acknowledge it and push deeper
- If they make a legal error — gently redirect without lecturing
- After 2-3 exchanges, break character briefly to give a coaching tip in [COACH'S NOTE: ...]
- Keep responses short — judges don't monologue. 1-3 sentences max.
- Push them to be MORE specific when they're vague
- Be harder on procedural errors than substance — judges care about respect for the court

VOICE: Firm but fair. A judge who wants pro se litigants to succeed but holds them to the standard.`;

export async function POST(request: Request) {
  const limit = rateLimit(request, rateLimitPresets.ai);
  if (limit) return limit;

  try {
    const raw = await request.json();
    const userInput = sanitizeText(raw.userInput, MAX_INPUT_LENGTH);
    const situation = sanitizeSituation(raw.situation);
    const state = sanitizeState(raw.state);
    const conversationHistory = sanitizeHistory(raw.conversationHistory);

    if (!userInput) {
      return Response.json({ error: "No input provided." }, { status: 400 });
    }

    const apiKey = getApiKey();
    if (!apiKey) return Response.json({ error: "API key not configured." }, { status: 500 });

    const client = new Anthropic({ apiKey });

    const messages: { role: "user" | "assistant"; content: string }[] = [];

    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    messages.push({ role: "user", content: userInput });

    const context = `Practice scenario: ${situation.replace(/_/g, " ")} in ${state || "your state"}.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: `${JUDGE_SYSTEM}\n\n${context}`,
      messages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("\n");

    return Response.json({ response: text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Practice session failed: ${message}` }, { status: 500 });
  }
}
