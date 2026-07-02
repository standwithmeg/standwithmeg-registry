import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import {
  PartnerPortalRecord,
  sendPartnerPortalRecordEmail,
} from "../../../../lib/partner-portal-email";
import { rateLimit, rateLimitPresets } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const FALLBACK_MARKER = "[PARTNER_PORTAL_RECORD]";
const ALLOWED_STATUSES = new Set([
  "new",
  "contacted",
  "interested",
  "packet_sent",
  "submitted",
  "reviewing",
  "approved",
  "won",
  "lost",
  "passed",
]);

type PortalRecordInput = Partial<PartnerPortalRecord> & {
  admin_notes?: string;
  monthly_amount?: number | string;
  commission_rate?: number | string;
  sponsor_payment_status?: string;
  commission_status?: string;
  square_customer_url?: string;
  square_contract_url?: string;
  square_subscription_url?: string;
};

type LogoAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

type SponsorInquiryFallback = {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string;
  phone: string | null;
  state: string | null;
  tier: string | null;
  message: string | null;
  status: string;
  created_at: string;
};

function adminCode(): string {
  return process.env.PARTNER_PORTAL_ADMIN_CODE || "";
}

function constantTimeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf-8");
  const bBuf = Buffer.from(b, "utf-8");
  if (aBuf.length !== bBuf.length) return false;
  try {
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

function adminAuthError(request: Request, providedCode?: string): Response | null {
  const expected = adminCode();
  if (!expected) {
    return NextResponse.json(
      { error: "Admin inbox is not configured. Set PARTNER_PORTAL_ADMIN_CODE in Vercel.", code: "admin_not_configured" },
      { status: 503 }
    );
  }

  const fromHeader = request.headers.get("x-admin-code") || "";
  const fromQuery = new URL(request.url).searchParams.get("code") || "";
  const provided = fromHeader || providedCode || fromQuery || "";

  if (!constantTimeCompare(provided, expected)) {
    return NextResponse.json(
      { error: "Invalid admin code.", code: "invalid_admin_code" },
      { status: 401 }
    );
  }

  return null;
}

function text(value: unknown, max = 2000): string | null {
  if (value == null) return null;
  const clean = String(value).trim();
  if (!clean) return null;
  return clean.slice(0, max);
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(value: unknown): string | null {
  const clean = text(value, 20);
  if (!clean) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
}

function tableMissing(message: string | null | undefined): boolean {
  return /partner_portal_records|schema cache|does not exist|Could not find the table/i.test(message || "");
}

function inquiryTableMissing(message: string | null | undefined): boolean {
  return /sponsor_inquiries|schema cache|does not exist|Could not find the table/i.test(message || "");
}

function statusFor(input: PortalRecordInput): string {
  const requested = text(input.status, 40);
  if (requested && ALLOWED_STATUSES.has(requested)) return requested;
  return input.record_type === "sponsor_submission" ? "submitted" : "new";
}

function normalizeRecord(input: PortalRecordInput, logo?: File): PartnerPortalRecord & Record<string, unknown> {
  const recordType = input.record_type === "sponsor_submission" ? "sponsor_submission" : "prospect";
  const businessName = text(input.business_name, 220);
  if (!businessName) {
    throw new Error("Business name is required.");
  }

  return {
    record_type: recordType,
    status: statusFor({ ...input, record_type: recordType }),
    partner_name: text(input.partner_name, 160),
    partner_email: text(input.partner_email, 220),
    partner_state: text(input.partner_state, 120),
    business_name: businessName,
    display_name: text(input.display_name, 220),
    contact_name: text(input.contact_name, 220),
    contact_email: text(input.contact_email, 220),
    phone: text(input.phone, 80),
    website: text(input.website, 500),
    requested_tier: text(input.requested_tier, 120),
    quoted_price: text(input.quoted_price, 80),
    state_placement: text(input.state_placement, 120),
    law_firm_status: text(input.law_firm_status, 120),
    logo_status: text(input.logo_status, 160),
    logo_file_name: text(input.logo_file_name || logo?.name, 260),
    logo_file_size: logo ? logo.size : null,
    logo_content_type: text(input.logo_content_type || logo?.type, 120),
    logo_link_notes: text(input.logo_link_notes, 2000),
    ad_wording: text(input.ad_wording, 2000),
    public_contact_line: text(input.public_contact_line, 1000),
    business_description: text(input.business_description, 2000),
    conversation_notes: text(input.conversation_notes, 4000),
    prospect_stage: text(input.prospect_stage, 80),
    interest_level: text(input.interest_level, 80),
    best_signal: text(input.best_signal, 1000),
    next_follow_up: dateOrNull(input.next_follow_up),
    monthly_amount: numberOrNull(input.monthly_amount),
    commission_rate: numberOrNull(input.commission_rate),
    sponsor_payment_status: text(input.sponsor_payment_status, 80),
    commission_status: text(input.commission_status, 80),
    square_customer_url: text(input.square_customer_url, 1000),
    square_contract_url: text(input.square_contract_url, 1000),
    square_subscription_url: text(input.square_subscription_url, 1000),
    admin_notes: text(input.admin_notes, 4000),
    payload: input,
  };
}

async function parseRequest(request: Request): Promise<{ input: PortalRecordInput; logo?: File }> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const rawRecord = formData.get("record");
    if (typeof rawRecord !== "string") {
      throw new Error("Missing record payload.");
    }
    const logo = formData.get("logo");
    return {
      input: JSON.parse(rawRecord) as PortalRecordInput,
      logo: logo instanceof File && logo.size > 0 ? logo : undefined,
    };
  }

  return { input: (await request.json()) as PortalRecordInput };
}

async function logoAttachment(logo?: File): Promise<LogoAttachment[]> {
  if (!logo) return [];
  if (logo.size > MAX_LOGO_BYTES) {
    throw new Error("Logo file is larger than 5 MB. Send a link or email it separately.");
  }
  return [
    {
      filename: logo.name,
      content: Buffer.from(await logo.arrayBuffer()),
      contentType: logo.type || undefined,
    },
  ];
}

function fallbackEmail(record: PartnerPortalRecord & Record<string, unknown>): string {
  return (
    text(record.contact_email, 220) ||
    text(record.partner_email, 220) ||
    "no-email+partner-portal@standwithmeg.com"
  );
}

function fallbackMessage(record: PartnerPortalRecord & Record<string, unknown>): string {
  return `${FALLBACK_MARKER}\n${JSON.stringify(record)}`;
}

function parseFallbackMessage(row: SponsorInquiryFallback): Record<string, unknown> {
  const message = row.message || "";
  if (!message.startsWith(FALLBACK_MARKER)) return {};
  try {
    return JSON.parse(message.slice(FALLBACK_MARKER.length).trim()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function fallbackStatus(status: unknown): string {
  const clean = text(status, 40) || "new";
  if (clean === "won") return "won";
  if (clean === "lost" || clean === "passed") return "passed";
  if (["contacted", "interested", "packet_sent", "submitted", "reviewing", "approved"].includes(clean)) {
    return "contacted";
  }
  return "new";
}

function fallbackRowToPortalRecord(row: SponsorInquiryFallback): Record<string, unknown> {
  const payload = parseFallbackMessage(row);
  const hasPortalPayload = Object.keys(payload).length > 0;
  const recordType =
    payload.record_type === "sponsor_submission" || payload.record_type === "prospect"
      ? payload.record_type
      : "prospect";
  return {
    ...payload,
    id: `sponsor_inquiry:${row.id}`,
    record_type: recordType,
    status: row.status || payload.status || "new",
    partner_name: payload.partner_name || (hasPortalPayload ? null : "Public sponsor inquiry"),
    business_name: payload.business_name || row.business_name,
    contact_name: payload.contact_name || row.contact_name,
    contact_email: payload.contact_email || row.email,
    phone: payload.phone || row.phone,
    state_placement: payload.state_placement || row.state,
    requested_tier: payload.requested_tier || row.tier,
    conversation_notes: payload.conversation_notes || row.message,
    created_at: row.created_at,
    source_store: "sponsor_inquiries",
    fallback_store: hasPortalPayload ? "sponsor_inquiries" : null,
  };
}

async function listSponsorInquiryRecords(): Promise<{
  records: Record<string, unknown>[];
  error: string | null;
  tableMissing: boolean;
}> {
  const { data, error } = await createAdminSupabaseClient()
    .from("sponsor_inquiries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) {
    return {
      records: [],
      error: error.message,
      tableMissing: inquiryTableMissing(error.message),
    };
  }

  return {
    records: (data ?? []).map((row) => fallbackRowToPortalRecord(row as SponsorInquiryFallback)),
    error: null,
    tableMissing: false,
  };
}

function filteredRecords(
  records: Record<string, unknown>[],
  type: string | null,
  status: string | null
): Record<string, unknown>[] {
  return records
    .filter((record) => {
      if ((type === "sponsor_submission" || type === "prospect") && record.record_type !== type) return false;
      if (status && ALLOWED_STATUSES.has(status) && record.status !== status) return false;
      return true;
    })
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, 250);
}

async function insertFallbackRecord(
  record: PartnerPortalRecord & Record<string, unknown>
): Promise<{ stored: boolean; id: string | null; error: string | null }> {
  const { data, error } = await createAdminSupabaseClient()
    .from("sponsor_inquiries")
    .insert({
      business_name: String(record.business_name).slice(0, 200),
      contact_name: text(record.contact_name, 200),
      email: fallbackEmail(record),
      phone: text(record.phone, 50),
      state: text(record.state_placement || record.partner_state, 80),
      tier: text(record.requested_tier, 40),
      message: fallbackMessage(record),
      status: fallbackStatus(record.status),
    })
    .select("id")
    .single();

  if (error) return { stored: false, id: null, error: error.message };
  return { stored: true, id: data?.id ? `sponsor_inquiry:${data.id}` : null, error: null };
}

export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit(request, rateLimitPresets.contact);
  if (limit) return limit;

  let record: PartnerPortalRecord & Record<string, unknown>;
  let attachments: LogoAttachment[] = [];

  try {
    const { input, logo } = await parseRequest(request);
    record = normalizeRecord(input, logo);
    attachments = await logoAttachment(logo);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid sponsor record." },
      { status: 400 }
    );
  }

  let storedId: string | null = null;
  let stored = false;
  let storageError: string | null = null;

  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("partner_portal_records")
      .insert(record)
      .select("id")
      .single();

    if (error) {
      storageError = error.message;
      console.error("partner_portal_records insert failed:", error.message);
      if (tableMissing(error.message)) {
        const fallback = await insertFallbackRecord(record);
        stored = fallback.stored;
        storedId = fallback.id;
        storageError = fallback.error;
      }
    } else {
      stored = true;
      storedId = data?.id ?? null;
    }
  } catch (err) {
    storageError = err instanceof Error ? err.message : "Storage failed.";
    console.error("partner portal storage error:", err);
  }

  after(() => {
    sendPartnerPortalRecordEmail(record, attachments).catch((err) => {
      console.error("partner portal email failed:", err);
    });
  });

  return NextResponse.json({
    ok: true,
    stored,
    id: storedId,
    storage_error: storageError,
    emailed: true,
  });
}

export async function GET(request: Request): Promise<Response> {
  const limit = rateLimit(request, rateLimitPresets.auth);
  if (limit) return limit;

  const authError = adminAuthError(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const type = text(url.searchParams.get("type"), 40);
    const status = text(url.searchParams.get("status"), 40);
    const portalQuery = createAdminSupabaseClient()
      .from("partner_portal_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(250);

    const [{ data, error }, inquiries] = await Promise.all([
      portalQuery,
      listSponsorInquiryRecords(),
    ]);

    if (error && !tableMissing(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (inquiries.error && !inquiries.tableMissing) {
      return NextResponse.json({ error: inquiries.error }, { status: 500 });
    }

    const portalRecords = error && tableMissing(error.message) ? [] : data ?? [];
    const mergedRecords = filteredRecords(
      [...portalRecords, ...inquiries.records],
      type,
      status
    );

    if (error && tableMissing(error.message)) {
      return NextResponse.json({
        ok: true,
        fallback_store: "sponsor_inquiries",
        records: mergedRecords,
        sources: {
          partner_portal_records: 0,
          sponsor_inquiries: inquiries.records.length,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      records: mergedRecords,
      sources: {
        partner_portal_records: portalRecords.length,
        sponsor_inquiries: inquiries.records.length,
      },
    });
  } catch (err) {
    console.error("partner portal records list failed:", err);
    return NextResponse.json({ error: "Could not load partner portal records." }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const limit = rateLimit(request, rateLimitPresets.auth);
  if (limit) return limit;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const authError = adminAuthError(request, text(body.code, 200) || undefined);
  if (authError) return authError;

  const id = text(body.id, 80);
  if (!id) {
    return NextResponse.json({ error: "Record id is required." }, { status: 400 });
  }

  if (id.startsWith("sponsor_inquiry:")) {
    const inquiryId = id.replace("sponsor_inquiry:", "");
    const { data, error } = await createAdminSupabaseClient()
      .from("sponsor_inquiries")
      .update({ status: fallbackStatus(body.status) })
      .eq("id", inquiryId)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      fallback_store: "sponsor_inquiries",
      record: fallbackRowToPortalRecord(data as SponsorInquiryFallback),
    });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowedText = [
    "status",
    "admin_notes",
    "prospect_stage",
    "sponsor_payment_status",
    "commission_status",
    "square_customer_url",
    "square_contract_url",
    "square_subscription_url",
  ];

  allowedText.forEach((key) => {
    if (key in body) update[key] = text(body[key], key.endsWith("_url") ? 1000 : 4000);
  });
  if (typeof update.status === "string" && !ALLOWED_STATUSES.has(update.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  if ("next_follow_up" in body) update.next_follow_up = dateOrNull(body.next_follow_up);
  if ("monthly_amount" in body) update.monthly_amount = numberOrNull(body.monthly_amount);
  if ("commission_rate" in body) update.commission_rate = numberOrNull(body.commission_rate);

  try {
    const { data, error } = await createAdminSupabaseClient()
      .from("partner_portal_records")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, record: data });
  } catch (err) {
    console.error("partner portal record update failed:", err);
    return NextResponse.json({ error: "Could not update partner portal record." }, { status: 500 });
  }
}
