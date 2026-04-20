import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

function getApiKey(): string {
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey.length > 10) return envKey;
  try {
    const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    const match = envFile.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match && match[1].length > 10) return match[1].trim();
  } catch {}
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
  try {
    const { userInput, situation, state, conversationHistory } = await request.json();

    if (!userInput) {
      return Response.json({ error: "No input provided." }, { status: 400 });
    }

    const apiKey = getApiKey();
    if (!apiKey) return Response.json({ error: "API key not configured." }, { status: 500 });

    const client = new Anthropic({ apiKey });

    const messages: { role: "user" | "assistant"; content: string }[] = [];

    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-8)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: userInput });

    const context = `Practice scenario: ${situation?.replace(/_/g, " ") || "general court hearing"} in ${state || "your state"}.`;

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
