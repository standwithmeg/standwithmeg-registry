import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../lib/supabase-admin";
import {
  sendPartnerNotificationEmail,
  sendPartnerAutoReplyEmail,
  type PartnerApplication,
} from "../../../lib/partner-application-email";
import { after } from "next/server";

export const runtime = "nodejs";

// Reject submissions faster than this — real people take longer to fill a form.
const MIN_ELAPSED_MS = 2000;

interface Body extends Partial<PartnerApplication> {
  agreed?: boolean;
  company?: string; // honeypot
  elapsed_ms?: number;
}

function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function clean(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

/**
 * POST /api/partner-application
 * Accepts a State Partner application. Stores it (best-effort) and emails the
 * team + an auto-reply to the applicant. Honeypot + time-trap drop bots quietly.
 */
export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Anti-abuse: pretend success so bots don't learn they were caught.
  if (clean(body.company, 100) || (typeof body.elapsed_ms === "number" && body.elapsed_ms < MIN_ELAPSED_MS)) {
    return NextResponse.json({ ok: true });
  }

  const app: PartnerApplication = {
    full_name: clean(body.full_name, 200),
    email: clean(body.email, 200),
    phone: clean(body.phone, 50),
    region: clean(body.region, 80),
    connection: clean(body.connection, 80),
    why: clean(body.why, 2000),
    role_interest: clean(body.role_interest, 80) || undefined,
    businesses_in_mind: clean(body.businesses_in_mind, 2000) || undefined,
    experience: clean(body.experience, 500) || undefined,
    socials: clean(body.socials, 300) || undefined,
    heard_from: clean(body.heard_from, 300) || undefined,
  };

  if (!app.full_name || !app.email || !app.phone || !app.region || !app.connection || !app.why) {
    return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
  }
  if (!isValidEmail(app.email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (body.agreed !== true) {
    return NextResponse.json({ error: "Please accept the integrity agreement." }, { status: 400 });
  }

  // Best-effort store. The table may not exist yet (see migration
  // 031_partner_applications.sql) — never fail the application over storage.
  try {
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase.from("partner_applications").insert({
      full_name: app.full_name,
      email: app.email,
      phone: app.phone,
      region: app.region,
      connection: app.connection,
      why: app.why,
      role_interest: app.role_interest ?? null,
      businesses_in_mind: app.businesses_in_mind ?? null,
      experience: app.experience ?? null,
      socials: app.socials ?? null,
      heard_from: app.heard_from ?? null,
    });
    if (error) {
      console.warn("partner_applications insert skipped:", error.message);
    }
  } catch (err) {
    console.warn("partner_applications storage unavailable:", err);
  }

  // Emails are the source of truth for now — notify the team + reassure the
  // applicant. Fire-and-forget so a slow mail server doesn't block the response.
  after(async () => {
    const results = await Promise.allSettled([
      sendPartnerNotificationEmail(app),
      sendPartnerAutoReplyEmail(app),
    ]);
    for (const r of results) {
      if (r.status === "rejected") console.error("partner application email failed:", r.reason);
    }
  });

  return NextResponse.json({ ok: true });
}
