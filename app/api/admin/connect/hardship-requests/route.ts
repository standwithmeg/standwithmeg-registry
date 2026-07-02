import { after } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { addDaysIso, appOrigin, cleanSingleLine, CONNECT_HARDSHIP_DAYS } from "../../../../../lib/connection-circles";
import { writeAudit } from "../../../../../lib/connection-circle-matching";
import { sendCircleAccessGrantedEmail } from "../../../../../lib/connection-circle-emails";
import { summarizeEmailError } from "../../../../../lib/smtp-email";
import { isAdminEmail } from "../../../../../lib/require-auth";

async function requireAdminEmail() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email) ? user.email.toLowerCase() : null;
}

type HardshipRequestRow = {
  id: string;
  email: string;
  request_note: string | null;
  status: "pending" | "fulfilled" | "declined" | "cancelled";
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  fulfilled_access_id: string | null;
};

type EnrichedHardshipRequest = HardshipRequestRow & {
  state_code: string | null;
  court_actor_count: number;
  submission_id: string | null;
  survey_url: string | null;
};

async function enrichHardshipRequests(
  sb: ReturnType<typeof createAdminSupabaseClient>,
  requests: HardshipRequestRow[],
): Promise<EnrichedHardshipRequest[]> {
  const emails = Array.from(new Set(requests.map(r => r.email.toLowerCase()).filter(Boolean)));
  if (emails.length === 0) {
    return requests.map(r => ({ ...r, state_code: null, court_actor_count: 0, submission_id: null, survey_url: null }));
  }



  // Case-insensitive match for each email. Supabase `.in` is exact-case,
  // and survey emails may have been stored in mixed case. Pass raw values to
  // `.or()`; the Supabase client URL-encodes the filter string, so pre-encoding
  // would double-encode special characters like `@`.
  const orFilter = emails.map(e => `email.ilike.${e}`).join(",");
  const [{ data: submissions, error: subError }, { data: legacySubs, error: legacyError }] = await Promise.all([
    sb.from("survey_submissions").select("id, email, state_of_occurrence, outside_us_country, created_at").or(orFilter),
    sb.from("legacy_submissions").select("id, email, state_of_occurrence, outside_us_country, created_at").or(orFilter),
  ]);
  if (subError) {
    console.error("enrichHardshipRequests submission lookup error:", subError.message);
  }
  if (legacyError) {
    console.error("enrichHardshipRequests legacy lookup error:", legacyError.message);
  }

  type LatestSubmission = { id: string; state_code: string | null; created_at: string; is_legacy: boolean };
  const latestByEmail = new Map<string, LatestSubmission>();
  for (const row of (submissions ?? []) as Array<{
    id: string;
    email: string;
    state_of_occurrence: string | null;
    outside_us_country: string | null;
    created_at: string;
  }>) {
    const email = row.email.toLowerCase();
    const stateCode =
      String(row.state_of_occurrence || "").trim().toUpperCase() ||
      String(row.outside_us_country || "").trim() ||
      null;
    const existing = latestByEmail.get(email);
    if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
      latestByEmail.set(email, { id: row.id, state_code: stateCode, created_at: row.created_at, is_legacy: false });
    }
  }
  for (const row of (legacySubs ?? []) as Array<{
    id: string;
    email: string;
    state_of_occurrence: string | null;
    outside_us_country: string | null;
    created_at: string;
  }>) {
    const email = row.email.toLowerCase();
    const stateCode =
      String(row.state_of_occurrence || "").trim().toUpperCase() ||
      String(row.outside_us_country || "").trim() ||
      null;
    const existing = latestByEmail.get(email);
    if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
      latestByEmail.set(email, { id: row.id, state_code: stateCode, created_at: row.created_at, is_legacy: true });
    }
  }

  const surveySubmissionIds = Array.from(new Set(
    Array.from(latestByEmail.values()).filter(s => !s.is_legacy).map(s => s.id)
  ));
  const actorCounts = new Map<string, number>();
  if (surveySubmissionIds.length > 0) {
    const { data: actors, error: actorError } = await sb
      .from("court_actors")
      .select("submission_id")
      .in("submission_id", surveySubmissionIds);
    if (actorError) {
      console.error("enrichHardshipRequests court_actor lookup error:", actorError.message);
    }
    for (const row of (actors ?? []) as Array<{ submission_id: string }>) {
      actorCounts.set(row.submission_id, (actorCounts.get(row.submission_id) ?? 0) + 1);
    }
  }

  return requests.map(r => {
    const latest = latestByEmail.get(r.email.toLowerCase());
    const submissionId = latest?.id ?? null;
    return {
      ...r,
      state_code: latest?.state_code ?? null,
      court_actor_count: submissionId && !latest?.is_legacy ? (actorCounts.get(submissionId) ?? 0) : 0,
      submission_id: submissionId,
      survey_url: submissionId ? `/admin/survey-submission/${submissionId}` : null,
    };
  });
}

export async function GET() {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) return Response.json({ error: "Not authorized." }, { status: 403 });

    const sb = createAdminSupabaseClient();
    const { data: requests, error: requestError } = await sb
      .from("connection_circle_hardship_requests")
      .select("id, email, request_note, status, requested_at, decided_at, decided_by, fulfilled_access_id")
      .in("status", ["pending", "fulfilled", "declined"])
      .order("requested_at", { ascending: true })
      .limit(100);
    if (requestError) {
      console.error("GET /api/admin/connect/hardship-requests error:", requestError.message);
      return Response.json({ error: "Could not load hardship requests." }, { status: 500 });
    }

    const { data: contributions, error: contributionError } = await sb
      .from("connection_circle_sponsor_contributions")
      .select("id, contribution_type, sponsor_email, sponsor_name, tag_permission, social_handle, amount_cents, currency, created_at")
      .in("contribution_type", ["pool_month", "pool_year", "pool_custom"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (contributionError) {
      console.error("GET /api/admin/connect/hardship-requests contribution lookup error:", contributionError.message);
    }

    const enriched = await enrichHardshipRequests(sb, (requests ?? []) as HardshipRequestRow[]);
    const poolTotalCents = (contributions ?? []).reduce((sum, row: { amount_cents: number | null }) => sum + Number(row.amount_cents ?? 0), 0);
    return Response.json({
      requests: enriched,
      sponsor_pool: {
        recent_total_cents: poolTotalCents,
        recent_count: contributions?.length ?? 0,
        recent_contributions: (contributions ?? []).slice(0, 10),
      },
    });
  } catch (err) {
    console.error("GET /api/admin/connect/hardship-requests error:", err);
    return Response.json({ error: "Could not load hardship requests." }, { status: 500 });
  }
}

async function grantSingleRequest(
  sb: ReturnType<typeof createAdminSupabaseClient>,
  requestId: string,
  adminEmail: string,
  origin: string,
): Promise<{ request: HardshipRequestRow; access: { id: string } | null }> {
  const { data: hardshipRequest, error: lookupError } = await sb
    .from("connection_circle_hardship_requests")
    .select("id, email, status")
    .eq("id", requestId)
    .maybeSingle();
  if (lookupError) {
    throw new Error(`Could not load hardship request: ${lookupError.message}`);
  }
  if (!hardshipRequest || hardshipRequest.status !== "pending") {
    throw new Error("This request is not pending anymore.");
  }

  const { data: access, error: accessError } = await sb
    .from("connection_circle_access")
    .insert({
      email: hardshipRequest.email,
      access_type: "hardship",
      status: "active",
      expires_at: addDaysIso(CONNECT_HARDSHIP_DAYS),
    })
    .select("id, email, access_type, status, granted_at, expires_at")
    .single();
  if (accessError) {
    if (accessError.code !== "23505") {
      throw new Error(`Could not grant access: ${accessError.message}`);
    }
  }

  const fulfilledAccessId = access?.id ?? null;
  const { data: updated, error: updateError } = await sb
    .from("connection_circle_hardship_requests")
    .update({
      status: "fulfilled",
      decided_at: new Date().toISOString(),
      decided_by: adminEmail,
      fulfilled_access_id: fulfilledAccessId,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id, email, request_note, status, requested_at, decided_at, decided_by, fulfilled_access_id")
    .single();
  if (updateError) {
    throw new Error(`Access may have been granted, but the waitlist row could not be updated: ${updateError.message}`);
  }

  await writeAudit({
    actorEmail: adminEmail,
    event: "hardship.waitlist_granted",
    detail: { request_id: requestId, requester_email: hardshipRequest.email, access_id: fulfilledAccessId },
  });

  // Tell the family their access is live so they know to log in. Non-blocking:
  // a failed email must never roll back a grant that already succeeded.
  after(async () => {
    try {
      await sendCircleAccessGrantedEmail({ email: hardshipRequest.email, appOrigin: origin, reason: "hardship" });
    } catch (mailErr) {
      console.error("hardship grant notification email failed:", summarizeEmailError(mailErr));
    }
  });

  return { request: updated, access };
}

export async function POST(request: Request) {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) return Response.json({ error: "Not authorized." }, { status: 403 });

    const body = await request.json();
    const id = cleanSingleLine(body.id, 80);
    const action = cleanSingleLine(body.action, 20);
    if (!["grant", "decline", "grant-all"].includes(action)) {
      return Response.json({ error: "A valid action is required." }, { status: 400 });
    }

    const sb = createAdminSupabaseClient();

    if (action === "grant-all") {
      const { data: pending, error: pendingError } = await sb
        .from("connection_circle_hardship_requests")
        .select("id")
        .eq("status", "pending")
        .order("requested_at", { ascending: true });
      if (pendingError) {
        console.error("POST /api/admin/connect/hardship-requests grant-all lookup error:", pendingError.message);
        return Response.json({ error: "Could not load pending requests." }, { status: 500 });
      }

      const origin = appOrigin(request);
      const results: { request: HardshipRequestRow; access: { id: string } | null }[] = [];
      const failed: { id: string; reason: string }[] = [];
      for (const row of (pending ?? []) as { id: string }[]) {
        try {
          results.push(await grantSingleRequest(sb, row.id, adminEmail, origin));
        } catch (err) {
          failed.push({ id: row.id, reason: err instanceof Error ? err.message : String(err) });
        }
      }

      await writeAudit({
        actorEmail: adminEmail,
        event: "hardship.waitlist_grant_all",
        detail: { granted_count: results.length, failed_count: failed.length },
      });

      return Response.json({
        granted: results.length,
        failed,
        requests: results.map(r => r.request),
      });
    }

    if (!id) {
      return Response.json({ error: "A request id is required." }, { status: 400 });
    }

    if (action === "decline") {
      const { data: hardshipRequest, error: lookupError } = await sb
        .from("connection_circle_hardship_requests")
        .select("id, email, status")
        .eq("id", id)
        .maybeSingle();
      if (lookupError) {
        console.error("POST /api/admin/connect/hardship-requests lookup error:", lookupError.message);
        return Response.json({ error: "Could not load hardship request." }, { status: 500 });
      }
      if (!hardshipRequest || hardshipRequest.status !== "pending") {
        return Response.json({ error: "This request is not pending anymore." }, { status: 409 });
      }

      const { data, error } = await sb
        .from("connection_circle_hardship_requests")
        .update({ status: "declined", decided_at: new Date().toISOString(), decided_by: adminEmail })
        .eq("id", id)
        .eq("status", "pending")
        .select("id, email, status, requested_at, decided_at, decided_by")
        .single();
      if (error) {
        console.error("POST /api/admin/connect/hardship-requests decline error:", error.message);
        return Response.json({ error: "Could not decline request." }, { status: 500 });
      }
      await writeAudit({ actorEmail: adminEmail, event: "hardship.waitlist_declined", detail: { request_id: id, requester_email: hardshipRequest.email } });
      return Response.json({ request: data });
    }

    const origin = appOrigin(request);
    const { request: updated, access } = await grantSingleRequest(sb, id, adminEmail, origin);
    return Response.json({ request: updated, access });
  } catch (err) {
    console.error("POST /api/admin/connect/hardship-requests error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Could not update hardship request." }, { status: 500 });
  }
}
