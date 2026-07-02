import { createAdminSupabaseClient } from "../../../lib/supabase-admin";
import { rateLimit, rateLimitPresets } from "../../../lib/rate-limit";
import { corsJsonResponse, handleCorsPreflight } from "../../../lib/shawn-lee-cors";
import { isValidCoachingInterest } from "../../../lib/shawn-lee-prompts";

export const runtime = "nodejs";

type Body = {
  name?: string;
  email?: string;
  state?: string;
  interest?: string;
  message?: string;
  source?: string;
  who?: string;
  need?: string;
};

export async function OPTIONS(request: Request) {
  return handleCorsPreflight(request) ?? corsJsonResponse(request, { ok: true });
}

export async function POST(request: Request) {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const limit = rateLimit(request, rateLimitPresets.contact);
  if (limit) return limit;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return corsJsonResponse(request, { error: "Invalid request." }, 400);
  }

  const name = String(body.name || "").trim().slice(0, 200);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const interest = String(body.interest || "").trim();
  const stateRaw = String(body.state || "").trim().slice(0, 80);
  const who = String(body.who || "").trim().slice(0, 40);
  const need = String(body.need || "").trim().slice(0, 500);
  let message = String(body.message || "").trim().slice(0, 2000);
  const source = String(body.source || "shawn_lee_report").trim().slice(0, 80);

  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return corsJsonResponse(request, { error: "Name and a valid email are required." }, 400);
  }
  if (!isValidCoachingInterest(interest)) {
    return corsJsonResponse(request, { error: "Please select a valid interest type." }, 400);
  }

  if (interest === "general-inquiry") {
    const validWho = new Set(["shawn", "meg", "both"]);
    if (!validWho.has(who)) {
      return corsJsonResponse(request, { error: "Please select who you want to reach." }, 400);
    }
    if (!stateRaw) {
      return corsJsonResponse(request, { error: "State is required." }, 400);
    }
    if (!need) {
      return corsJsonResponse(request, { error: "Please tell us what you need." }, 400);
    }
    if (!message) {
      return corsJsonResponse(request, { error: "Message is required." }, 400);
    }
    const whoLabel = who === "both" ? "Shawn & Meg" : who === "shawn" ? "Shawn" : "Meg";
    message = `[Contact: ${whoLabel}] [Need: ${need}]\n\n${message}`;
  }

  const state = stateRaw || null;

  try {
    const sb = createAdminSupabaseClient();
    const { error } = await sb.from("coaching_inquiries").insert({
      name,
      email,
      state,
      interest_type: interest,
      message: message || null,
      source,
    });

    if (error) {
      console.error("coaching_inquiries insert failed:", error.message);
      return corsJsonResponse(request, { error: "We could not save your request. Please try again shortly." }, 500);
    }

    return corsJsonResponse(request, { ok: true });
  } catch (err) {
    console.error("coaching-inquiry error:", err);
    return corsJsonResponse(request, { error: "Something went wrong. Please try again." }, 500);
  }
}