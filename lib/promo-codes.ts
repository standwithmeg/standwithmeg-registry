import { createAdminSupabaseClient } from "./supabase-admin";
import { normalizeEmail } from "./connection-circles";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

export type PromoCode = {
  id: string;
  code: string;
  access_type: string;
  access_days: number;
  expires_at: string | null;
  disabled: boolean;
  max_uses: number | null;
  requires_approval: boolean;
  created_at: string;
};

export type PromoValidationResult =
  | { ok: true; promo: PromoCode }
  | { ok: false; reason: string };

export type ApplyPromoResult =
  | { kind: "granted"; accessId: string; expiresAt: string; alreadyActive?: boolean }
  | { kind: "pending"; requestId: string };

export type PromoRequest = {
  id: string;
  email: string;
  code: string;
  status: "pending" | "approved" | "denied";
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  access_id: string | null;
};

export async function validatePromoCode(
  sb: AdminClient,
  code: string,
): Promise<PromoValidationResult> {
  const { data, error } = await sb
    .from("connection_circle_promo_codes")
    .select("id, code, access_type, access_days, expires_at, disabled, max_uses, requires_approval, created_at")
    .ilike("code", code)
    .maybeSingle();

  if (error) {
    throw new Error(`Promo code lookup failed: ${error.message}`);
  }
  if (!data) {
    return { ok: false, reason: "Invalid promo code." };
  }

  const promo = data as PromoCode;
  if (promo.disabled) {
    return { ok: false, reason: "This promo code has been disabled." };
  }
  if (promo.expires_at && new Date(promo.expires_at) <= new Date()) {
    return { ok: false, reason: "This promo code has expired." };
  }

  if (promo.max_uses) {
    const { count, error: countError } = await sb
      .from("connection_circle_access")
      .select("id", { count: "exact", head: true })
      .ilike("promo_code", promo.code);
    if (countError) {
      throw new Error(`Promo usage count failed: ${countError.message}`);
    }
    if ((count ?? 0) >= promo.max_uses) {
      return { ok: false, reason: "This promo code has reached its usage limit." };
    }
  }

  return { ok: true, promo };
}

export async function applyPromoCode(
  sb: AdminClient,
  email: string,
  code: string,
): Promise<ApplyPromoResult> {
  const validation = await validatePromoCode(sb, code);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const { promo } = validation;
  const normalizedEmail = normalizeEmail(email);

  // If they already have active access (from any source), don't duplicate it.
  const { data: existing } = await sb
    .from("connection_circle_access")
    .select("id, expires_at, promo_code")
    .ilike("email", normalizedEmail)
    .eq("status", "active")
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { kind: "granted", accessId: existing.id, expiresAt: existing.expires_at, alreadyActive: true };
  }

  if (promo.requires_approval) {
    // Check for an existing pending request first.
    const { data: existingRequest } = await sb
      .from("connection_circle_promo_requests")
      .select("id, status")
      .ilike("email", normalizedEmail)
      .ilike("code", promo.code)
      .eq("status", "pending")
      .maybeSingle();

    if (existingRequest) {
      return { kind: "pending", requestId: existingRequest.id };
    }

    const { data: request, error: requestError } = await sb
      .from("connection_circle_promo_requests")
      .insert({
        email: normalizedEmail,
        code: promo.code,
        status: "pending",
      })
      .select("id")
      .single();

    if (requestError) {
      // If a pending request was created concurrently, surface it gracefully.
      if (requestError.code === "23505") {
        const { data: concurrent } = await sb
          .from("connection_circle_promo_requests")
          .select("id, status")
          .ilike("email", normalizedEmail)
          .ilike("code", promo.code)
          .eq("status", "pending")
          .maybeSingle();
        if (concurrent) return { kind: "pending", requestId: concurrent.id };
      }
      throw new Error(`Promo request failed: ${requestError.message}`);
    }

    if (!request) {
      throw new Error("Could not create promo request.");
    }

    return { kind: "pending", requestId: request.id };
  }

  const grantedAt = new Date();
  const expiresAt = new Date(grantedAt.getTime() + promo.access_days * 24 * 60 * 60 * 1000);

  const { data: access, error } = await sb
    .from("connection_circle_access")
    .insert({
      email: normalizedEmail,
      access_type: "promo",
      status: "active",
      granted_at: grantedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      promo_code: promo.code,
    })
    .select("id, expires_at")
    .single();

  if (error || !access) {
    throw new Error(error?.message || "Could not create promo access.");
  }

  return { kind: "granted", accessId: access.id, expiresAt: access.expires_at };
}

export async function getPromoUsage(sb: AdminClient, code: string): Promise<number> {
  const { count, error } = await sb
    .from("connection_circle_access")
    .select("id", { count: "exact", head: true })
    .ilike("promo_code", code);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listPromoCodes(sb: AdminClient): Promise<PromoCode[]> {
  const { data, error } = await sb
    .from("connection_circle_promo_codes")
    .select("id, code, access_type, access_days, expires_at, disabled, max_uses, requires_approval, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PromoCode[];
}

export async function listPromoRequests(
  sb: AdminClient,
  status?: "pending" | "approved" | "denied",
): Promise<PromoRequest[]> {
  let query = sb
    .from("connection_circle_promo_requests")
    .select("id, email, code, status, requested_at, decided_at, decided_by, access_id")
    .order("requested_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new Error(`list promo requests failed: ${error.message}`);
  return (data ?? []) as PromoRequest[];
}

export async function approvePromoRequest(
  sb: AdminClient,
  requestId: string,
  adminEmail: string,
): Promise<{ request: PromoRequest; access?: { id: string; expires_at: string | null } }> {
  const { data: request, error: lookupError } = await sb
    .from("connection_circle_promo_requests")
    .select("id, email, code, status")
    .eq("id", requestId)
    .maybeSingle();

  if (lookupError) throw new Error(`lookup promo request failed: ${lookupError.message}`);
  if (!request || request.status !== "pending") {
    throw new Error("This promo request is not pending anymore.");
  }

  const { data: promo, error: promoError } = await sb
    .from("connection_circle_promo_codes")
    .select("access_days")
    .ilike("code", request.code)
    .maybeSingle();

  if (promoError) throw new Error(`lookup promo code failed: ${promoError.message}`);

  const accessDays = promo?.access_days ?? 30;
  const grantedAt = new Date();
  const expiresAt = new Date(grantedAt.getTime() + accessDays * 24 * 60 * 60 * 1000);

  const { data: access, error: accessError } = await sb
    .from("connection_circle_access")
    .insert({
      email: request.email,
      access_type: "promo",
      status: "active",
      granted_at: grantedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      promo_code: request.code,
    })
    .select("id, expires_at")
    .single();

  if (accessError) {
    if (accessError.code === "23505") {
      // Access already exists; fetch it and continue.
      const { data: existing } = await sb
        .from("connection_circle_access")
        .select("id, expires_at")
        .ilike("email", request.email)
        .eq("status", "active")
        .order("granted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        const { data: updated, error: updateError } = await sb
          .from("connection_circle_promo_requests")
          .update({
            status: "approved",
            decided_at: new Date().toISOString(),
            decided_by: adminEmail.toLowerCase(),
            access_id: existing.id,
          })
          .eq("id", requestId)
          .eq("status", "pending")
          .select("id, email, code, status, requested_at, decided_at, decided_by, access_id")
          .single();
        if (updateError) throw new Error(`approve promo request failed: ${updateError.message}`);
        return { request: updated as PromoRequest, access: existing };
      }
    }
    throw new Error(`create promo access failed: ${accessError.message}`);
  }

  const { data: updated, error: updateError } = await sb
    .from("connection_circle_promo_requests")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: adminEmail.toLowerCase(),
      access_id: access.id,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id, email, code, status, requested_at, decided_at, decided_by, access_id")
    .single();

  if (updateError) throw new Error(`approve promo request failed: ${updateError.message}`);

  return { request: updated as PromoRequest, access };
}

export async function denyPromoRequest(
  sb: AdminClient,
  requestId: string,
  adminEmail: string,
): Promise<PromoRequest> {
  const { data: updated, error } = await sb
    .from("connection_circle_promo_requests")
    .update({
      status: "denied",
      decided_at: new Date().toISOString(),
      decided_by: adminEmail.toLowerCase(),
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id, email, code, status, requested_at, decided_at, decided_by, access_id")
    .single();

  if (error) throw new Error(`deny promo request failed: ${error.message}`);
  return updated as PromoRequest;
}
