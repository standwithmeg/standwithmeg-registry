import { createAdminSupabaseClient } from "../../../lib/supabase-admin";
import { createHash } from "crypto";
import { rateLimit, rateLimitPresets } from "../../../lib/rate-limit";

const VALID_ROLES = new Set([
  "impacted_parent",
  "family_member",
  "advocate",
  "journalist",
  "legislator",
  "researcher",
  "public",
]);

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export async function POST(request: Request) {
  const limit = rateLimit(request, rateLimitPresets.contact);
  if (limit) return limit;

  try {
    const body = await request.json();

    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }

    const first_name = cleanText(body.first_name, 80);
    if (!first_name) {
      return Response.json({ error: "First name is required." }, { status: 400 });
    }

    const last_name = cleanText(body.last_name, 80);
    if (!last_name) {
      return Response.json({ error: "Last name is required." }, { status: 400 });
    }

    const role = String(body.role || "").trim();
    if (!VALID_ROLES.has(role)) {
      return Response.json({ error: "A valid role is required." }, { status: 400 });
    }

    if (body.agreed_terms !== true) {
      return Response.json({ error: "You must agree to the terms to access the dashboard." }, { status: 400 });
    }

    const state_of_interest = String(body.state_of_interest || "").trim() || null;
    const organization = cleanText(body.organization, 160) || null;
    const reason = String(body.reason || "").trim() || null;

    // IP hash — same pattern as survey POST
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
    const ip_hash = createHash("sha256").update(ip).digest("hex");

    const adminSupabase = createAdminSupabaseClient();

    const { error } = await adminSupabase
      .from("dashboard_access_log")
      .insert({
        email,
        first_name,
        last_name,
        organization,
        state_of_interest,
        role,
        reason,
        agreed_terms: true,
        ip_hash,
      });

    if (error) {
      // Log the error but still grant access — the gate should not block
      // visitors if the audit table is missing or temporarily unavailable.
      console.error("POST /api/dashboard-access insert error (non-blocking):", error.message);
    }

    return Response.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("POST /api/dashboard-access error:", err);
    return Response.json({ error: "Access request failed." }, { status: 500 });
  }
}
