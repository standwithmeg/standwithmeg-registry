/**
 * actor_publications — the single source of truth for a public court actor's
 * report visibility + photo/slide/social state (migration 061).
 *
 * This module is the ONLY writer. The freshness pipeline calls:
 *   - onActorPromotedToReport  → an actor crossed threshold/review (photo NOT required)
 *   - onActorPhotoAssigned     → Meg approved a portrait; triggers regen + publish
 *   - reconcileFromLiveActors  → periodic safety net that re-syncs from the live list
 *
 * Reads (getActorPublication / listReportVisible) are what the report page,
 * actor cards, share pages, and admin slide-check will eventually consume so
 * they can never disagree again.
 *
 * Nothing here touches families' survey rows — it only writes actor_publications.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { actorBucketKeyWithLocation } from "./court-actors";

// A service-role client scoped to this module. Not `server-only`-gated so the
// freshness pipeline can also run from tsx scripts (backfill, cron, tests).
let cached: SupabaseClient | null = null;
function createAdminSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("actor-publications: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  cached = createClient(url, serviceKey, { auth: { persistSession: false } });
  return cached;
}

export type PhotoStatus = "none" | "requested" | "received" | "approved";
export type SocialStatus = "not_posted" | "queued" | "auto_published" | "manually_posted" | "rejected";

export interface ActorPublication {
  actor_bucket_key: string;
  display_name: string;
  state_code: string | null;
  location_key: string | null;
  report_visible: boolean;
  report_visible_at: string | null;
  family_count: number;
  photo_status: PhotoStatus;
  photo_storage_path: string | null;
  slides_stale: boolean;
  social_status: SocialStatus;
  updated_at: string;
}

/** Canonical key for an actor, matching the rest of the system. */
export function publicationKey(name: string, role: string, locationKey: string | null | undefined): string {
  return actorBucketKeyWithLocation(name, role, locationKey);
}

/** Read one actor's publication row (null if not present yet). */
export async function getActorPublication(bucketKey: string): Promise<ActorPublication | null> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("actor_publications")
    .select("*")
    .eq("actor_bucket_key", bucketKey)
    .maybeSingle();
  if (error) throw new Error(`getActorPublication: ${error.message}`);
  return (data as ActorPublication | null) ?? null;
}

/** All report-visible actors (optionally scoped to one state) — for the report page. */
export async function listReportVisible(stateCode?: string): Promise<ActorPublication[]> {
  const sb = createAdminSupabaseClient();
  let q = sb.from("actor_publications").select("*").eq("report_visible", true);
  if (stateCode) q = q.eq("state_code", stateCode);
  const { data, error } = await q;
  if (error) throw new Error(`listReportVisible: ${error.message}`);
  return (data ?? []) as ActorPublication[];
}

export interface PromoteInput {
  name: string;
  role: string;
  stateCode: string | null;
  locationKey: string | null;
  familyCount: number;
  visibleAt?: string;
}

/**
 * An actor crossed the public threshold/review. They go live on the REPORT
 * immediately — a photo is NOT required (Meg's rule). Idempotent: re-promoting
 * just refreshes the family count and keeps existing photo/social state.
 */
export async function onActorPromotedToReport(input: PromoteInput): Promise<ActorPublication> {
  const sb = createAdminSupabaseClient();
  const key = publicationKey(input.name, input.role, input.locationKey ?? input.stateCode);
  const existing = await getActorPublication(key);
  const row = {
    actor_bucket_key: key,
    display_name: input.name,
    state_code: input.stateCode,
    location_key: input.locationKey ?? input.stateCode,
    report_visible: true,
    report_visible_at: existing?.report_visible_at ?? input.visibleAt ?? new Date().toISOString(),
    family_count: input.familyCount,
  };
  const { data, error } = await sb
    .from("actor_publications")
    .upsert(row, { onConflict: "actor_bucket_key" })
    .select("*")
    .single();
  if (error) throw new Error(`onActorPromotedToReport: ${error.message}`);
  return data as ActorPublication;
}

export interface PhotoAssignInput {
  bucketKey: string;
  storagePath: string;
  approvedBy: string;
}

/**
 * Meg approved a portrait for a report-visible actor. This flips photo_status
 * to approved and marks slides stale so the pipeline regenerates them and (per
 * Meg's rule) queues the social auto-publish. Returns the updated row; the
 * caller enqueues the actual regen/publish jobs (Trigger.dev) off social_status.
 */
export async function onActorPhotoAssigned(input: PhotoAssignInput): Promise<ActorPublication> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("actor_publications")
    .update({
      photo_status: "approved",
      photo_storage_path: input.storagePath,
      photo_approved_by: input.approvedBy,
      photo_approved_at: new Date().toISOString(),
      slides_stale: true,
      social_status: "queued", // photo drop → queue the auto-publish
    })
    .eq("actor_bucket_key", input.bucketKey)
    .select("*")
    .single();
  if (error) throw new Error(`onActorPhotoAssigned: ${error.message}`);
  return data as ActorPublication;
}

/** Mark an actor's slides freshly built (pipeline calls this after a successful regen). */
export async function markSlidesCurrent(bucketKey: string, shareVersionId: string | null): Promise<void> {
  const sb = createAdminSupabaseClient();
  const { error } = await sb
    .from("actor_publications")
    .update({ slides_stale: false, share_version_id: shareVersionId })
    .eq("actor_bucket_key", bucketKey);
  if (error) throw new Error(`markSlidesCurrent: ${error.message}`);
}

/** Delete a publication row — used only by tests/cleanup, never in the app path. */
export async function deletePublication(bucketKey: string): Promise<void> {
  const sb = createAdminSupabaseClient();
  const { error } = await sb.from("actor_publications").delete().eq("actor_bucket_key", bucketKey);
  if (error) throw new Error(`deletePublication: ${error.message}`);
}

export interface LiveActorInput {
  name: string;
  role: string;
  state_code: string | null;
  location_key: string | null;
  count: number;
  photo_url: string | null;
  latest_reported_at: string | null;
}

export interface ReconcileResult {
  total: number;
  promoted: number;          // actors newly added / made report-visible
  photoNewlyApproved: number; // photo appeared since last sync → queued for publish
  countUpdated: number;       // family count changed
}

/**
 * Reconcile actor_publications against the current live public-actor list.
 * Idempotent safety net: promotes new actors, refreshes counts, and flips
 * photo_status → approved (queuing the auto-publish) the first time a photo
 * appears. Caller provides the list (real fetch in prod, synthetic in tests),
 * so this is pure, injectable, and easy to prove.
 */
export async function reconcileActorPublications(actors: LiveActorInput[], opts: { dryRun?: boolean } = {}): Promise<ReconcileResult> {
  const { dryRun = false } = opts;
  // Collapse spelling variants to one row per person (richest wins).
  const byKey = new Map<string, LiveActorInput>();
  for (const a of actors) {
    const key = publicationKey(a.name, a.role, a.location_key ?? a.state_code);
    const cur = byKey.get(key);
    if (!cur || (a.photo_url && !cur.photo_url) || a.count > cur.count) byKey.set(key, a);
  }

  const result: ReconcileResult = { total: byKey.size, promoted: 0, photoNewlyApproved: 0, countUpdated: 0 };

  for (const [key, a] of byKey) {
    const existing = await getActorPublication(key);
    if (!existing) {
      if (!dryRun) {
        await onActorPromotedToReport({
          name: a.name, role: a.role, stateCode: a.state_code,
          locationKey: a.location_key ?? a.state_code, familyCount: a.count,
          visibleAt: a.latest_reported_at ?? undefined,
        });
      }
      result.promoted += 1;
    } else if (existing.family_count !== a.count) {
      if (!dryRun) {
        await onActorPromotedToReport({
          name: a.name, role: a.role, stateCode: a.state_code,
          locationKey: a.location_key ?? a.state_code, familyCount: a.count,
        });
      }
      result.countUpdated += 1;
    }

    // A photo appeared since last sync (and wasn't already approved) → publish path.
    if (a.photo_url && (!existing || existing.photo_status !== "approved")) {
      if (!dryRun) {
        await onActorPhotoAssigned({ bucketKey: key, storagePath: a.photo_url, approvedBy: "system:reconcile" });
      }
      result.photoNewlyApproved += 1;
    }
  }
  return result;
}

/** Production wrapper: fetch the live public actor list and reconcile. */
export async function reconcileFromLiveApi(
  opts: { dryRun?: boolean; apiBase?: string } = {},
): Promise<ReconcileResult> {
  const apiBase = opts.apiBase ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://my.standwithmeg.com";
  const res = await fetch(`${apiBase}/api/survey/court-actors?limit=1000`);
  if (!res.ok) throw new Error(`reconcileFromLiveApi: court-actors ${res.status}`);
  const data = (await res.json()) as { actors?: LiveActorInput[] };
  return reconcileActorPublications(data.actors ?? [], { dryRun: opts.dryRun });
}
