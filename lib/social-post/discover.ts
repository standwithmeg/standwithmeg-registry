import { actorBucketKeyWithLocation } from "../court-actors";
import { getPublicActorsWithReporters } from "../court-actor-public-notifications";
import { computePublicActorsDirect } from "../../app/api/survey/court-actors/route";
import { createAdminSupabaseClient } from "../supabase-admin";
import { buildSocialPostPackage, type PublicActorLike } from "./package";
import { socialPostPackageSignature } from "./signature";
import { getQueuedPostsByBucketKey, type QueueRow } from "./db";

export type DiscoverCandidate = {
  actor_bucket_key: string;
  actor_name: string;
  role: string;
  state_abbr: string;
  county: string | null;
  family_count: number;
  share_url: string | null;
  reason: "not_queued" | "staged_today" | "stale_package" | "new_families";
  queue_id: string | null;
  queue_status: string | null;
  updated_at: string | null;
  created_at: string | null;
  /** True when share_url exists — staging is likely to succeed. */
  likely_stageable: boolean;
  photo_url: string | null;
  has_photo: boolean;
  crossed_threshold_at: string | null;
  crossed_threshold_today: boolean;
  /** 0 = crossed threshold today, 1 = more families since queue, 2 = staged today, 3 = other */
  priority_tier: number;
};

export type DiscoverPayload = {
  not_queued: DiscoverCandidate[];
  staged_today: DiscoverCandidate[];
  stale_open: DiscoverCandidate[];
  total_public: number;
  mode: "lite" | "full";
  cached: boolean;
  stale_scan_truncated?: boolean;
};

type DiscoverOptions = {
  mode?: "lite" | "full";
  refresh?: boolean;
};

const DISCOVER_CACHE_TTL_MS = 2 * 60 * 1000;
const FULL_PACKAGE_CHECK_LIMIT = 24;
const FULL_PACKAGE_CHECK_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) break;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
let discoverCache: { at: number; lite: DiscoverPayload; full: DiscoverPayload | null } | null = null;

function actorBucketKey(actor: PublicActorLike): string {
  const state = (actor.location_key ?? actor.state_code ?? "").toUpperCase();
  return actorBucketKeyWithLocation(actor.name, actor.role, state).toLowerCase();
}

function startOfTodayUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return iso >= startOfTodayUtc();
}

const OPEN_STATUSES = new Set(["pending_review", "needs_review", "approved_to_post"]);

function priorityTier(args: {
  reason: DiscoverCandidate["reason"];
  crossed_threshold_today: boolean;
  staged_today: boolean;
  family_delta: number;
}): number {
  if (args.crossed_threshold_today && args.reason === "not_queued") return 0;
  if (args.family_delta > 0 || args.reason === "stale_package" || args.reason === "new_families") return 1;
  if (args.staged_today) return 2;
  return 3;
}

function baseCandidate(
  actor: PublicActorLike,
  bucketKey: string,
  existing: QueueRow | null,
  crossedThresholdAt: string | null,
  reason: DiscoverCandidate["reason"],
  stagedToday: boolean,
  familyDelta: number,
): DiscoverCandidate {
  const state = (actor.location_key ?? actor.state_code ?? "").toUpperCase();
  const crossed_threshold_today = isToday(crossedThresholdAt);
  return {
    actor_bucket_key: bucketKey,
    actor_name: actor.name,
    role: actor.role,
    state_abbr: state,
    county: actor.court_or_county,
    family_count: actor.count,
    share_url: actor.share_url,
    queue_id: existing?.id ?? null,
    queue_status: existing?.status ?? null,
    updated_at: existing?.updated_at ?? null,
    created_at: existing?.created_at ?? null,
    likely_stageable: Boolean(actor.share_url?.trim()),
    photo_url: actor.photo_url,
    has_photo: Boolean(actor.photo_url?.trim()),
    crossed_threshold_at: crossedThresholdAt,
    crossed_threshold_today,
    reason,
    priority_tier: priorityTier({
      reason,
      crossed_threshold_today,
      staged_today: stagedToday,
      family_delta: familyDelta,
    }),
  };
}

function cheapStaleReason(
  existing: QueueRow,
  actor: PublicActorLike,
): DiscoverCandidate["reason"] | null {
  const queuedFamilies = existing.package_json.family_count ?? 0;
  if (OPEN_STATUSES.has(existing.status) && actor.count !== queuedFamilies) {
    return "stale_package";
  }
  if (existing.status === "posted" && actor.count > queuedFamilies) {
    return "new_families";
  }
  return null;
}

async function computeDiscover(mode: "lite" | "full"): Promise<DiscoverPayload> {
  const sb = createAdminSupabaseClient();
  if (mode === "full") {
    try {
      await sb.rpc("refresh_mv_court_actors_public_safe");
    } catch {
      // Best-effort refresh.
    }
  }

  const [publicActors, queuedByKey, thresholdBuckets] = await Promise.all([
    computePublicActorsDirect(sb, null, null, { bypassRowCache: mode === "full" }),
    getQueuedPostsByBucketKey(),
    getPublicActorsWithReporters(),
  ]);
  const crossedAtByKey = new Map(
    thresholdBuckets.map(bucket => [bucket.actor_bucket_key.toLowerCase(), bucket.crossed_threshold_at]),
  );

  const notQueued: DiscoverCandidate[] = [];
  const stagedToday: DiscoverCandidate[] = [];
  const staleOpen: DiscoverCandidate[] = [];
  const needsPackageCheck: Array<{
    actor: PublicActorLike;
    existing: QueueRow;
    crossedThresholdAt: string | null;
    familyDelta: number;
    stagedToday: boolean;
  }> = [];

  for (const actor of publicActors) {
    const bucketKey = actorBucketKey(actor);
    const existing = queuedByKey.get(bucketKey) ?? null;
    const crossedThresholdAt = crossedAtByKey.get(bucketKey) ?? null;
    const queuedFamilies = existing?.package_json.family_count ?? 0;
    const familyDelta = existing ? Math.max(0, actor.count - queuedFamilies) : 0;
    const stagedTodayFlag = Boolean(existing && isToday(existing.created_at));

    if (!existing) {
      notQueued.push(baseCandidate(
        actor,
        bucketKey,
        existing,
        crossedThresholdAt,
        "not_queued",
        false,
        0,
      ));
      continue;
    }

    if (stagedTodayFlag) {
      stagedToday.push(baseCandidate(
        actor,
        bucketKey,
        existing,
        crossedThresholdAt,
        "staged_today",
        true,
        familyDelta,
      ));
    }

    const mightBeStale = OPEN_STATUSES.has(existing.status)
      || (existing.status === "posted" && actor.count > queuedFamilies);
    if (!mightBeStale) continue;

    if (mode === "lite") {
      const reason = cheapStaleReason(existing, actor);
      if (reason) {
        staleOpen.push(baseCandidate(
          actor,
          bucketKey,
          existing,
          crossedThresholdAt,
          reason,
          stagedTodayFlag,
          familyDelta,
        ));
      }
      continue;
    }

    needsPackageCheck.push({
      actor,
      existing,
      crossedThresholdAt,
      familyDelta,
      stagedToday: stagedTodayFlag,
    });
  }

  const packageCheckBatch = needsPackageCheck.slice(0, FULL_PACKAGE_CHECK_LIMIT);
  const staleScanTruncated = needsPackageCheck.length > packageCheckBatch.length;

  const packageResults = await mapWithConcurrency(
    packageCheckBatch,
    FULL_PACKAGE_CHECK_CONCURRENCY,
    async item => {
      const buildResult = await buildSocialPostPackage(item.actor);
      if (!buildResult.ok) return null;

      const pkg = buildResult.package;
      const nextSignature = pkg.content_signature ?? socialPostPackageSignature(pkg);
      const existingSignature = item.existing.package_json.content_signature
        ?? socialPostPackageSignature(item.existing.package_json);

      if (OPEN_STATUSES.has(item.existing.status) && existingSignature !== nextSignature) {
        return baseCandidate(
          item.actor,
          actorBucketKey(item.actor),
          item.existing,
          item.crossedThresholdAt,
          "stale_package",
          item.stagedToday,
          item.familyDelta,
        );
      }
      if (
        item.existing.status === "posted"
        && existingSignature !== nextSignature
        && pkg.family_count > (item.existing.package_json.family_count ?? 0)
      ) {
        return baseCandidate(
          item.actor,
          actorBucketKey(item.actor),
          item.existing,
          item.crossedThresholdAt,
          "new_families",
          item.stagedToday,
          item.familyDelta,
        );
      }
      return null;
    },
  );

  for (const hit of packageResults) {
    if (hit) staleOpen.push(hit);
  }

  const sortByPriority = (a: DiscoverCandidate, b: DiscoverCandidate) =>
    a.priority_tier - b.priority_tier
    || b.family_count - a.family_count
    || (b.crossed_threshold_at ?? "").localeCompare(a.crossed_threshold_at ?? "")
    || a.actor_name.localeCompare(b.actor_name);

  return {
    not_queued: notQueued.sort(sortByPriority),
    staged_today: stagedToday.sort(sortByPriority),
    stale_open: staleOpen.sort(sortByPriority),
    total_public: publicActors.length,
    mode,
    cached: false,
    ...(staleScanTruncated ? { stale_scan_truncated: true } : {}),
  };
}

export function invalidateDiscoverCache(): void {
  discoverCache = null;
}

export async function discoverSocialPostCandidates(options: DiscoverOptions = {}): Promise<DiscoverPayload> {
  const mode = options.mode === "full" ? "full" : "lite";
  const refresh = options.refresh === true;
  const now = Date.now();

  if (!refresh && discoverCache && now - discoverCache.at < DISCOVER_CACHE_TTL_MS) {
    if (mode === "full" && discoverCache.full) {
      return { ...discoverCache.full, cached: true };
    }
    if (mode === "lite") {
      return { ...discoverCache.lite, cached: true };
    }
  }

  const result = await computeDiscover(mode);
  discoverCache = {
    at: now,
    lite: mode === "lite" ? result : (discoverCache?.lite ?? result),
    full: mode === "full" ? result : (discoverCache?.full ?? null),
  };
  return result;
}

export function queueRowToDiscoverCandidate(row: QueueRow, reason: DiscoverCandidate["reason"]): DiscoverCandidate {
  const crossed_threshold_today = isToday(row.created_at);
  return {
    actor_bucket_key: row.actor_bucket_key,
    actor_name: row.actor_name,
    role: row.role,
    state_abbr: row.state_abbr,
    county: row.county,
    family_count: row.package_json.family_count,
    share_url: row.package_json.share_url,
    reason,
    queue_id: row.id,
    queue_status: row.status,
    updated_at: row.updated_at,
    created_at: row.created_at,
    likely_stageable: Boolean(row.package_json.share_url?.trim()),
    photo_url: row.package_json.hero_url
      ?? row.package_json.frames.find(frame => frame.order === 1)?.url
      ?? null,
    has_photo: Boolean(
      row.package_json.portrait_verified
      || row.package_json.frames.some(frame => frame.order === 1),
    ),
    crossed_threshold_at: row.created_at,
    crossed_threshold_today,
    priority_tier: priorityTier({
      reason,
      crossed_threshold_today,
      staged_today: crossed_threshold_today,
      family_delta: 0,
    }),
  };
}

export function readyToQueueCandidates(payload: DiscoverPayload): DiscoverCandidate[] {
  return payload.not_queued.filter(candidate => candidate.likely_stageable && candidate.has_photo);
}

export function crossedThresholdTodayCandidates(payload: DiscoverPayload): DiscoverCandidate[] {
  return payload.not_queued.filter(candidate => candidate.crossed_threshold_today);
}

export function missingPhotoCandidates(payload: DiscoverPayload): DiscoverCandidate[] {
  const sortByPriority = (a: DiscoverCandidate, b: DiscoverCandidate) =>
    (b.crossed_threshold_today ? 1 : 0) - (a.crossed_threshold_today ? 1 : 0)
    || b.family_count - a.family_count
    || a.actor_name.localeCompare(b.actor_name);

  return payload.not_queued
    .filter(candidate => !candidate.has_photo)
    .sort(sortByPriority);
}

export function autoQueueTodayCandidates(payload: DiscoverPayload): DiscoverCandidate[] {
  return crossedThresholdTodayCandidates(payload).filter(
    candidate => candidate.likely_stageable && candidate.has_photo,
  );
}