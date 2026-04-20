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
  try {
    const { situation, state, caseType, userSituation } = await request.json();

    if (!situation || !state) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }

    const apiKey = getApiKey();
    if (!apiKey) return Response.json({ error: "API key not configured." }, { status: 500 });

    const client = new Anthropic({ apiKey });

    const userMessage = `Generate courtroom scripts for this pro se litigant:

SITUATION TYPE: ${situation.replace(/_/g, " ")}
STATE: ${state}
CASE TYPE: ${caseType?.replace(/_/g, " ") || "family court"}
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
