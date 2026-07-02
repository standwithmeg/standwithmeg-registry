import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../lib/supabase-admin";
import { rateLimit, rateLimitPresets } from "../../../lib/rate-limit";

export const runtime = "nodejs";

interface InquiryBody {
  business_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  state?: string;
  tier?: string;
  message?: string;
}

function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

// Uppercase real two-letter codes ("wa" -> "WA") but keep full region names
// ("Canada", "Texas") intact — blindly slicing to 2 chars turned Canada into CA.
function normalizeState(value: string | undefined): string | null {
  const clean = (value ?? "").trim().slice(0, 80);
  if (!clean) return null;
  return /^[A-Za-z]{2}$/.test(clean) ? clean.toUpperCase() : clean;
}

/**
 * POST /api/sponsor-inquiry
 * Saves a lead from the public "Become a Sponsor" page. Meg follows up
 * manually before any sponsor is published.
 */
export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit(request, rateLimitPresets.contact);
  if (limit) return limit;

  let body: InquiryBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const businessName = (body.business_name ?? "").trim();
  const email = (body.email ?? "").trim();

  if (!businessName || !email) {
    return NextResponse.json(
      { error: "Business name and email are required." },
      { status: 400 }
    );
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase.from("sponsor_inquiries").insert({
      business_name: businessName.slice(0, 200),
      contact_name: (body.contact_name ?? "").trim().slice(0, 200) || null,
      email: email.slice(0, 200),
      phone: (body.phone ?? "").trim().slice(0, 50) || null,
      state: normalizeState(body.state),
      tier: (body.tier ?? "").trim().slice(0, 40) || null,
      message: (body.message ?? "").trim().slice(0, 2000) || null,
    });

    if (error) {
      console.error("sponsor_inquiries insert failed:", error.message);
      return NextResponse.json(
        { error: "We couldn't save your request. Please email sponsors@standwithmeg.com directly." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("sponsor inquiry error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
