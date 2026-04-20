import { createAdminSupabaseClient } from "../../../lib/supabase-admin";
import { createHash } from "crypto";

const VALID_ROLES = new Set([
  "impacted_parent",
  "family_member",
  "advocate",
  "journalist",
  "legislator",
  "researcher",
  "public",
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }

    const role = String(body.role || "").trim();
    if (!VALID_ROLES.has(role)) {
      return Response.json({ error: "A valid role is required." }, { status: 400 });
    }

    if (body.agreed_terms !== true) {
      return Response.json({ error: "You must agree to the terms to access the dashboard." }, { status: 400 });
    }

    const state_of_interest = String(body.state_of_interest || "").trim() || null;
    const reason = String(body.reason || "").trim() || null;

    // IP hash — same pattern as survey POST
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
    const ip_hash = createHash("sha256").update(ip).digest("hex");

    const adminSupabase = createAdminSupabaseClient();

    const { error } = await adminSupabase
      .from("dashboard_access_log")
      .insert({ email, state_of_interest, role, reason, agreed_terms: true, ip_hash });

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
