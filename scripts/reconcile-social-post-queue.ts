#!/usr/bin/env tsx
"use strict";

import "./_register-server-only-stub";

import { loadEnvConfig } from "@next/env";
import { computePublicActorsDirect } from "../app/api/survey/court-actors/route";
import { loadAliasResolver } from "../lib/court-actor-buckets";
import { actorBucketKeyWithLocation, actorLooseNameKey } from "../lib/court-actors";
import { createAdminSupabaseClient } from "../lib/supabase-admin";
import { socialPostPackageSignature } from "../lib/social-post/signature";
import type { SocialPostPackage, SocialPostStatus } from "../lib/social-post/types";

loadEnvConfig(process.cwd());

type QueueRow = {
  id: string;
  actor_bucket_key: string;
  actor_slug: string;
  state_abbr: string;
  actor_name: string;
  role: string;
  status: SocialPostStatus;
  package_json: SocialPostPackage;
  posted_at: string | null;
  posted_by: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
};

type PlannedUpdate = {
  row: QueueRow;
  canonicalKey: string;
  status?: SocialPostStatus;
  posted_at?: string | null;
  posted_by?: string | null;
  review_notes?: string | null;
  actor_name?: string;
  role?: string;
  updateKey: boolean;
  reason: string;
};

const apply = process.argv.includes("--apply");

const STATUS_RANK: Record<SocialPostStatus, number> = {
  posted: 0,
  approved_to_post: 1,
  needs_review: 2,
  pending_review: 3,
  rejected: 4,
};

type AliasResolverLike = Awaited<ReturnType<typeof loadAliasResolver>>;

function aliasTarget(row: QueueRow, aliasResolver: AliasResolverLike): {
  actorName: string;
  role: string;
  key: string;
  aliased: boolean;
} {
  const hit = aliasResolver?.resolve(row.actor_name, row.state_abbr) ?? null;
  const actorName = hit?.canonical_name ?? row.actor_name;
  const role = hit?.canonical_role ?? row.role;
  return {
    actorName,
    role,
    key: actorBucketKeyWithLocation(actorName, role, row.state_abbr).toLowerCase(),
    aliased: Boolean(hit),
  };
}

function familyCount(row: QueueRow): number {
  return Number(row.package_json?.family_count ?? 0);
}

function timestamp(row: QueueRow): number {
  return new Date(row.posted_at ?? row.updated_at ?? row.created_at).getTime();
}

function chooseOpenSurvivor(rows: QueueRow[], canonical: string): QueueRow {
  return [...rows].sort((a, b) => {
    const aIsCanonical = a.actor_bucket_key.toLowerCase() === canonical ? 0 : 1;
    const bIsCanonical = b.actor_bucket_key.toLowerCase() === canonical ? 0 : 1;
    if (aIsCanonical !== bIsCanonical) return aIsCanonical - bIsCanonical;
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    const families = familyCount(b) - familyCount(a);
    if (families !== 0) return families;
    return timestamp(b) - timestamp(a);
  })[0];
}

function chooseIdentitySurvivor(rows: QueueRow[], publicKeys: Set<string>): QueueRow {
  return [...rows].sort((a, b) => {
    const aIsPublic = publicKeys.has(a.actor_bucket_key.toLowerCase()) ? 0 : 1;
    const bIsPublic = publicKeys.has(b.actor_bucket_key.toLowerCase()) ? 0 : 1;
    if (aIsPublic !== bIsPublic) return aIsPublic - bIsPublic;
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    const families = familyCount(b) - familyCount(a);
    if (families !== 0) return families;
    return timestamp(b) - timestamp(a);
  })[0];
}

function appendNote(existing: string | null, note: string): string {
  const clean = existing?.trim();
  return clean ? `${clean}\n${note}` : note;
}

function canonicalPackage(row: QueueRow, key: string, actorName?: string, role?: string): SocialPostPackage {
  const pkg: SocialPostPackage = {
    ...row.package_json,
    actor_bucket_key: key,
    actor_name: actorName ?? row.package_json.actor_name,
    role: role ?? row.package_json.role,
  };
  pkg.content_signature = socialPostPackageSignature(pkg);
  return pkg;
}

function planGroup(rows: QueueRow[], canonical: string, publicKeys: Set<string>): PlannedUpdate[] {
  const planned: PlannedUpdate[] = [];
  const postedRows = rows.filter(row => row.status === "posted");
  const openRows = rows.filter(row => row.status !== "posted" && row.status !== "rejected");

  if (postedRows.length > 0) {
    const latestPosted = [...postedRows].sort((a, b) => timestamp(b) - timestamp(a))[0];
    const postedFamilyMax = Math.max(...postedRows.map(familyCount));

    for (const row of openRows) {
      if (familyCount(row) <= postedFamilyMax) {
        planned.push({
          row,
          canonicalKey: canonical,
          status: "posted",
          posted_at: latestPosted.posted_at ?? latestPosted.updated_at,
          posted_by: latestPosted.posted_by ?? "reconcile:legacy-posted",
          review_notes: appendNote(
            row.review_notes,
            `Marked posted during social queue reconciliation because duplicate ${latestPosted.actor_bucket_key} was already posted.`,
          ),
          updateKey: false,
          reason: "duplicate active row already posted under legacy key",
        });
      }
    }
  }

  const activeRowsAfterPostedMerge = rows.filter(row =>
    row.status !== "posted"
    && row.status !== "rejected"
    && !planned.some(update => update.row.id === row.id && update.status === "posted")
  );

  if (activeRowsAfterPostedMerge.length > 1) {
    const survivor = chooseOpenSurvivor(activeRowsAfterPostedMerge, canonical);
    for (const row of activeRowsAfterPostedMerge) {
      if (row.id === survivor.id) continue;
      planned.push({
        row,
        canonicalKey: canonical,
        status: "rejected",
        review_notes: appendNote(
          row.review_notes,
          `Superseded during social queue reconciliation by ${survivor.actor_bucket_key} (${survivor.id}).`,
        ),
        updateKey: false,
        reason: "duplicate active queue row",
      });
    }
  }

  const keyOwners = new Set(rows.map(row => row.actor_bucket_key.toLowerCase()));
  for (const row of rows) {
    if (row.actor_bucket_key.toLowerCase() === canonical) continue;
    if (!publicKeys.has(canonical)) continue;
    const alreadyPlanned = planned.some(update => update.row.id === row.id);
    if (keyOwners.has(canonical)) continue;
    if (alreadyPlanned && planned.find(update => update.row.id === row.id)?.status === "rejected") continue;
    planned.push({
      row,
      canonicalKey: canonical,
      updateKey: true,
      reason: "legacy bucket key canonicalization",
    });
    keyOwners.add(canonical);
  }

  return planned;
}

function planDisplayedIdentityDuplicates(
  rows: QueueRow[],
  publicKeys: Set<string>,
  existingPlans: PlannedUpdate[],
): PlannedUpdate[] {
  const plannedIds = new Set(existingPlans.map(plan => plan.row.id));
  const activeRows = rows.filter(row =>
    row.status !== "posted"
    && row.status !== "rejected"
    && !plannedIds.has(row.id)
  );
  const byIdentity = new Map<string, QueueRow[]>();
  for (const row of activeRows) {
    const key = `${actorLooseNameKey(row.actor_name)}|${row.state_abbr.toUpperCase()}`;
    const group = byIdentity.get(key) ?? [];
    group.push(row);
    byIdentity.set(key, group);
  }

  const updates: PlannedUpdate[] = [];
  for (const group of byIdentity.values()) {
    if (group.length < 2) continue;
    const survivor = chooseIdentitySurvivor(group, publicKeys);
    for (const row of group) {
      if (row.id === survivor.id) continue;
      updates.push({
        row,
        canonicalKey: row.actor_bucket_key.toLowerCase(),
        status: "rejected",
        review_notes: appendNote(
          row.review_notes,
          `Superseded during social queue reconciliation by displayed-identity match ${survivor.actor_bucket_key} (${survivor.id}).`,
        ),
        updateKey: false,
        reason: "duplicate active displayed identity",
      });
    }
  }
  return updates;
}

async function main() {
  const sb = createAdminSupabaseClient();
  const [{ data, error }, publicActors, aliasResolver] = await Promise.all([
    sb
      .from("social_post_queue")
      .select("id,actor_bucket_key,actor_slug,state_abbr,actor_name,role,status,package_json,posted_at,posted_by,review_notes,created_at,updated_at")
      .order("updated_at", { ascending: false }),
    computePublicActorsDirect(sb, null, null, { bypassRowCache: true }),
    loadAliasResolver(sb),
  ]);

  if (error) throw new Error(`Failed to load social_post_queue: ${error.message}`);

  const rows = (data ?? []) as QueueRow[];
  const publicKeys = new Set(publicActors.map(actor =>
    actorBucketKeyWithLocation(
      actor.name,
      actor.role,
      (actor.location_key ?? actor.state_code ?? "").toUpperCase(),
    ).toLowerCase(),
  ));
  const byCanonical = new Map<string, QueueRow[]>();
  const aliasTargetsByRow = new Map<string, ReturnType<typeof aliasTarget>>();
  for (const row of rows) {
    const actualKey = row.actor_bucket_key.toLowerCase();
    const target = aliasTarget(row, aliasResolver);
    aliasTargetsByRow.set(row.id, target);
    const key = publicKeys.has(actualKey) ? actualKey : target.key;
    const group = byCanonical.get(key) ?? [];
    group.push(row);
    byCanonical.set(key, group);
  }

  const keyAndStatusUpdates = Array.from(byCanonical.entries()).flatMap(([key, group]) => planGroup(group, key, publicKeys));
  const displayedIdentityUpdates = planDisplayedIdentityDuplicates(rows, publicKeys, keyAndStatusUpdates);
  const updates = [...keyAndStatusUpdates, ...displayedIdentityUpdates];
  const plannedIds = new Set(updates.map(update => update.row.id));
  const actualKeyOwners = new Map(rows.map(row => [row.actor_bucket_key.toLowerCase(), row.id]));
  for (const row of rows) {
    if (plannedIds.has(row.id)) continue;
    const target = aliasTargetsByRow.get(row.id);
    if (!target?.aliased) continue;
    const needsKey = row.actor_bucket_key.toLowerCase() !== target.key;
    const needsName = row.actor_name !== target.actorName;
    const needsRole = row.role !== target.role;
    if (!needsKey && !needsName && !needsRole) continue;
    const targetOwner = actualKeyOwners.get(target.key);
    const canUpdateKey = needsKey && publicKeys.has(target.key) && (!targetOwner || targetOwner === row.id);
    if (!canUpdateKey) continue;
    updates.push({
      row,
      canonicalKey: target.key,
      actor_name: target.actorName,
      role: target.role,
      updateKey: true,
      reason: "admin alias canonicalization",
    });
    plannedIds.add(row.id);
  }
  const keyUpdates = updates.filter(update => update.updateKey).length;
  const postedUpdates = updates.filter(update => update.status === "posted").length;
  const rejectedUpdates = updates.filter(update => update.status === "rejected").length;

  console.log(`social_post_queue rows: ${rows.length}`);
  console.log(`current public actor keys: ${publicKeys.size}`);
  console.log(`canonical identity groups: ${byCanonical.size}`);
  console.log(`planned updates: ${updates.length} (${keyUpdates} key canonicalizations, ${postedUpdates} mark posted, ${rejectedUpdates} reject duplicates)`);
  console.log(`mode: ${apply ? "APPLY" : "dry-run"}`);

  for (const update of updates.slice(0, 80)) {
    const changes = [
      update.updateKey ? `key ${update.row.actor_bucket_key} -> ${update.canonicalKey}` : null,
      update.actor_name ? `name ${update.row.actor_name} -> ${update.actor_name}` : null,
      update.role ? `role ${update.row.role} -> ${update.role}` : null,
      update.status ? `status ${update.row.status} -> ${update.status}` : null,
    ].filter(Boolean).join("; ");
    console.log(`- ${update.row.actor_name} [${update.row.state_abbr}] ${changes} (${update.reason})`);
  }
  if (updates.length > 80) {
    console.log(`... ${updates.length - 80} more update(s) omitted from preview`);
  }

  if (!apply || updates.length === 0) return;

  for (const update of updates) {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (update.updateKey) {
      patch.actor_bucket_key = update.canonicalKey;
      patch.package_json = canonicalPackage(update.row, update.canonicalKey, update.actor_name, update.role);
    } else if (update.actor_name || update.role) {
      patch.package_json = canonicalPackage(
        update.row,
        update.row.actor_bucket_key,
        update.actor_name,
        update.role,
      );
    }
    if (update.actor_name) patch.actor_name = update.actor_name;
    if (update.role) patch.role = update.role;
    if (update.status) patch.status = update.status;
    if (update.posted_at !== undefined) patch.posted_at = update.posted_at;
    if (update.posted_by !== undefined) patch.posted_by = update.posted_by;
    if (update.review_notes !== undefined) patch.review_notes = update.review_notes;

    const { error: updateError } = await sb
      .from("social_post_queue")
      .update(patch)
      .eq("id", update.row.id);
    if (updateError) {
      throw new Error(`Failed to update ${update.row.actor_name} (${update.row.id}): ${updateError.message}`);
    }
  }

  console.log(`Applied ${updates.length} social_post_queue reconciliation update(s).`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
