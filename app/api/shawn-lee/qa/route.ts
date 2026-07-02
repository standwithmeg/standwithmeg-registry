import Anthropic from "@anthropic-ai/sdk";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { rateLimit, rateLimitPresets } from "../../../../lib/rate-limit";
import { corsJsonResponse, handleCorsPreflight } from "../../../../lib/shawn-lee-cors";
import { loadShawnLeeKnowledge } from "../../../../lib/shawn-lee-knowledge";
import { SHAWN_LEE_QA_DISCLAIMER, SHAWN_LEE_QA_SYSTEM_PROMPT } from "../../../../lib/shawn-lee-prompts";

export const runtime = "nodejs";

const MAX_QUESTION = 1200;
const MAX_EMAIL = 200;

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  return key && key.length > 10 ? key : "";
}

export async function OPTIONS(request: Request) {
  return handleCorsPreflight(request) ?? corsJsonResponse(request, { ok: true });
}

export async function POST(request: Request) {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const limit = rateLimit(request, { ...rateLimitPresets.ai, maxRequests: 8, keyPrefix: "shawn-qa" });
  if (limit) return limit;

  let body: { email?: string; question?: string; preset?: string };
  try {
    body = await request.json();
  } catch {
    return corsJsonResponse(request, { error: "Invalid request." }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase().slice(0, MAX_EMAIL);
  const question = String(body.question || body.preset || "").trim().slice(0, MAX_QUESTION);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return corsJsonResponse(request, { error: "A valid email is required before we can answer." }, 400);
  }
  if (!question || question.length < 8) {
    return corsJsonResponse(request, { error: "Please enter a question (at least 8 characters)." }, 400);
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return corsJsonResponse(request, { error: "Q&A is temporarily unavailable." }, 503);
  }

  try {
    const knowledge = loadShawnLeeKnowledge();
    const system = `${SHAWN_LEE_QA_SYSTEM_PROMPT}\n\nREFERENCE MATERIAL:\n${knowledge}\n\nAlways end with: ${SHAWN_LEE_QA_DISCLAIMER}`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: question }],
    });

    const answer = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map(block => block.text)
      .join("\n")
      .trim();

    const sb = createAdminSupabaseClient();
    const { error: logError } = await sb.from("shawn_lee_qa_log").insert({
      email,
      question,
      answer: answer.slice(0, 12000),
    });
    if (logError) {
      console.error("shawn_lee_qa_log insert failed:", logError.message);
    }

    return corsJsonResponse(request, {
      answer,
      disclaimer: SHAWN_LEE_QA_DISCLAIMER,
    });
  } catch (err) {
    console.error("shawn-lee/qa error:", err);
    return corsJsonResponse(request, { error: "Could not generate an answer. Try again in a moment." }, 500);
  }
}