import "server-only";

import { COURT_ACTOR_PUBLIC_THRESHOLD } from "./court-actors";
import { loadCourtActorBuckets } from "./court-actor-buckets";
import { queueStateRegeneration } from "./state-regeneration";
import type { createAdminSupabaseClient } from "./supabase-admin";

const REPORT_THRESHOLD = 30;

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

export type CourtActorThresholdSnapshot = Map<string, number>;

function normalizeLocation(location: string | null | undefined) {
  const trimmed = String(location ?? "").trim();
  if (!trimmed) return null;
  return /^[a-z]{2}$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}

function bucketLocation(bucket: { location_key: string | null; state_code: string | null }) {
  return normalizeLocation(bucket.location_key || bucket.state_code);
}

export async function loadCourtActorThresholdSnapshot(
  sb: AdminClient,
  location: string | null | undefined,
): Promise<CourtActorThresholdSnapshot | null> {
  const normalizedLocation = normalizeLocation(location);
  if (!normalizedLocation) return null;

  try {
    const buckets = await loadCourtActorBuckets(sb);
    const snapshot: CourtActorThresholdSnapshot = new Map();
    for (const bucket of buckets.values()) {
      if (bucketLocation(bucket) === normalizedLocation) {
        snapshot.set(bucket.bucketKey, bucket.families.size);
      }
    }
    return snapshot;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`court actor threshold snapshot failed for ${normalizedLocation}:`, message);
    return null;
  }
}

export async function queueStateRegenerationIfCourtActorThresholdCrossed(args: {
  sb: AdminClient;
  location: string | null | undefined;
  before: CourtActorThresholdSnapshot | null;
  reason: string;
}) {
  const normalizedLocation = normalizeLocation(args.location);
  if (!normalizedLocation || !args.before) return false;

  try {
    await args.sb.rpc("refresh_mv_court_actors_public_safe");
  } catch (err) {
    console.error(`court actor threshold MV refresh failed for ${normalizedLocation}:`, err);
  }

  const after = await loadCourtActorThresholdSnapshot(args.sb, normalizedLocation);
  if (!after) return false;

  for (const [bucketKey, afterCount] of after.entries()) {
    const beforeCount = args.before.get(bucketKey) ?? 0;
    if (beforeCount < COURT_ACTOR_PUBLIC_THRESHOLD && afterCount >= COURT_ACTOR_PUBLIC_THRESHOLD) {
      queueStateRegeneration(normalizedLocation, args.reason);
      return true;
    }
  }

  console.log(`state regen skipped for ${normalizedLocation}: no court actor crossed public threshold (${args.reason})`);
  return false;
}

export async function queueStateRegenerationIfReportThresholdReached(
  sb: AdminClient,
  location: string | null | undefined,
  reason: string,
) {
  const normalizedLocation = normalizeLocation(location);
  if (!normalizedLocation) return false;

  const { data, error } = await sb
    .from("movement_stats_by_state")
    .select("total_submissions")
    .eq("state", normalizedLocation)
    .maybeSingle();

  if (error) {
    console.error(`report threshold lookup failed for ${normalizedLocation}:`, error.message);
    return false;
  }

  if (Number(data?.total_submissions ?? 0) === REPORT_THRESHOLD) {
    queueStateRegeneration(normalizedLocation, reason);
    return true;
  }

  console.log(`state regen skipped for ${normalizedLocation}: report threshold was not newly reached (${reason})`);
  return false;
}
