#!/usr/bin/env tsx
"use strict";

import "./_register-server-only-stub";

/**
 * Dry-run the court-actor auto-posting workflow.
 *
 * Reads (but does NOT write):
 *   - Desktop photo drop folder + Gmail photo submissions
 *   - Supabase social_post_queue to see who is already staged
 *   - Live public assets (spec.json, frames, hero photo, share.html)
 *
 * Reports what photo intake + social staging would do, without committing to
 * GitHub, inserting queue rows, sending emails, or posting to Blotato.
 *
 * Run:
 *   npx tsx scripts/dry-run-court-actor-posts.ts
 *
 * With a local dev server:
 *   NEXT_PUBLIC_APP_URL=http://localhost:3001 npx tsx scripts/dry-run-court-actor-posts.ts
 */

import { loadEnvConfig } from "@next/env";
import { promises as fs } from "fs";
import path from "path";
import {
  scanPhotoIntake,
  verifyLiveShareAssets,
  type PhotoIntakeItem,
} from "../lib/photo-intake";
import {
  getQueuedPostsByBucketKey,
  type QueueRow,
} from "../lib/social-post/db";
import {
  buildSocialPostPackage,
  type PublicActorLike,
} from "../lib/social-post/package";
import { socialPostPackageSignature } from "../lib/social-post/signature";
import { publicAssetOrigin } from "../lib/court-actor-public-assets";
import { actorBucketKeyWithLocation } from "../lib/court-actors";

loadEnvConfig(process.cwd());

function actorBucketKey(actor: PublicActorLike): string {
  const state = (actor.location_key ?? actor.state_code ?? "").toUpperCase();
  return actorBucketKeyWithLocation(actor.name, actor.role, state).toLowerCase();
}

async function fetchPublicActors(): Promise<PublicActorLike[]> {
  const origin = publicAssetOrigin();
  const res = await fetch(`${origin}/api/survey/court-actors?limit=1000`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch public actors: ${res.status}`);
  }
  const json = (await res.json()) as { actors?: PublicActorLike[] };
  return json.actors ?? [];
}

async function loadManifestSnapshot(): Promise<PublicActorLike[]> {
  try {
    const manifestPath = path.join(process.cwd(), "public", "court-actors", "manifest.json");
    const text = await fs.readFile(manifestPath, "utf-8");
    const data = JSON.parse(text) as { actors?: Array<{
      slug: string;
      state_abbr: string | null;
      display_name: string | null;
      canonical_name: string | null;
      photo_url: string | null;
      share_url: string | null;
    }> };
    return (data.actors ?? []).map(entry => ({
      role: "Court Actor",
      name: entry.display_name || entry.canonical_name || entry.slug.replace(/_/g, " "),
      court_or_county: null,
      state_code: entry.state_abbr,
      location_key: entry.state_abbr,
      count: 3,
      photo_url: entry.photo_url,
      share_url: entry.share_url,
    }));
  } catch {
    return [];
  }
}

async function runWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = items.slice();
  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i += 1) {
    workers.push((async () => {
      while (true) {
        const item = queue.shift();
        if (!item) return;
        await fn(item);
      }
    })());
  }
  await Promise.all(workers);
}

function isMissingTableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /Could not find the table/i.test(message) || /42P01/i.test(message) || /PGRST205/i.test(message);
}

function spotlightSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function deriveStateSlug(actor: PublicActorLike): { state: string; slug: string } | null {
  const fromShare = actor.share_url?.match(/\/court-actors\/([a-z]{2})\/([^/]+)\/(?:share\.html|)$/i);
  if (fromShare) return { state: fromShare[1].toLowerCase(), slug: fromShare[2] };
  const fromPhoto = actor.photo_url?.match(/\/court-actors\/([a-z]{2})\/([^/]+)\//i);
  if (fromPhoto) return { state: fromPhoto[1].toLowerCase(), slug: fromPhoto[2] };
  const state = (actor.location_key ?? actor.state_code)?.toLowerCase();
  if (!state) return null;
  return { state, slug: spotlightSlug(actor.name) };
}

function actorDir(state: string, slug: string): string {
  return path.join(process.cwd(), "public", "court-actors", state.toLowerCase(), slug);
}

async function actorHasLocalAssets(state: string, slug: string): Promise<{
  hasSpec: boolean;
  hasShare: boolean;
  hasPhoto: boolean;
  frameCount: number;
}> {
  const dir = actorDir(state, slug);
  const [hasSpec, hasShare, hasPhoto] = await Promise.all([
    fs.stat(path.join(dir, "spec.json")).then(s => s.isFile()).catch(() => false),
    fs.stat(path.join(dir, "share.html")).then(s => s.isFile()).catch(() => false),
    fs.stat(path.join(dir, "image_1080.png")).then(s => s.isFile()).catch(() => false),
  ]);
  let frameCount = 0;
  for (let i = 1; i <= 7; i += 1) {
    const exists = await fs.stat(path.join(dir, `frame-${String(i).padStart(2, "0")}.jpg`))
      .then(s => s.isFile())
      .catch(() => false);
    if (exists) frameCount += 1;
  }
  return { hasSpec, hasShare, hasPhoto, frameCount };
}

function statusEmoji(status: PhotoIntakeItem["status"]) {
  switch (status) {
    case "matched": return "✅";
    case "ambiguous": return "🔀";
    case "needs_review": return "⚠️";
    case "unmatched": return "❓";
    default: return "⏺";
  }
}

async function main() {
  const origin = publicAssetOrigin();
  console.log(`\n🎬 Court-Actor Auto-Posting Dry Run`);
  console.log(`Public asset origin: ${origin}`);
  console.log(`Dry-run: true (no commits, no queue inserts, no emails, no posts)\n`);

  // ---------------------------------------------------------------------------
  // Photo intake
  // ---------------------------------------------------------------------------
  console.log("--- Photo Intake ---");
  let items: PhotoIntakeItem[] = [];
  try {
    items = await scanPhotoIntake();
  } catch (err) {
    console.error("Photo intake scan failed:", err instanceof Error ? err.message : String(err));
  }

  if (items.length === 0) {
    console.log("No photos waiting in intake (desktop drop folder or Gmail).");
  } else {
    console.log(`Found ${items.length} photo intake item(s):\n`);
    for (const item of items) {
      console.log(`${statusEmoji(item.status)} ${item.filename}`);
      console.log(`   Source: ${item.source}`);
      console.log(`   Guess:  ${item.display_name_guess}${item.state_abbr_guess ? ` · ${item.state_abbr_guess}` : ""}`);
      console.log(`   Status: ${item.status}${item.confidence ? ` (${item.confidence})` : ""}`);
      if (item.review_notes) {
        console.log(`   Note:   ${item.review_notes}`);
      }
      if (item.candidates.length > 0) {
        for (const c of item.candidates) {
          const flag = c.already_deployed
            ? (c.photo_url ? "[photo already deployed]" : "[deployed, no photo]")
            : "[not yet deployed]";
          console.log(`   → ${c.name} · ${c.role} · ${c.state_abbr} · ${c.family_count} families ${flag}`);
        }
      }
      if (item.status === "matched" && item.candidates[0]) {
        const c = item.candidates[0];
        const v = await verifyLiveShareAssets(c.state_abbr, c.slug);
        console.log(`   Live assets: ${v.ready ? "READY" : "NOT READY"} (photo=${v.photo_ready}, share=${v.share_ready}, frames=${v.frames_ready})`);
        if (v.notes.length > 0) {
          console.log(`      ${v.notes.join("; ")}`);
        }
      }
      console.log("");
    }

    const matched = items.filter(i => i.status === "matched");
    const needsReview = items.filter(i => i.status === "needs_review" || i.status === "ambiguous");
    console.log(`Summary: ${matched.length} matched, ${needsReview.length} need review, ${items.length - matched.length - needsReview.length} unmatched.\n`);
  }

  // ---------------------------------------------------------------------------
  // Social post queue staging
  // ---------------------------------------------------------------------------
  console.log("--- Social Post Queue Staging ---");
  let publicActors: PublicActorLike[] = [];
  let queuedPostsByBucketKey: Map<string, QueueRow> = new Map();
  let usedManifestFallback = false;

  try {
    publicActors = await fetchPublicActors();
  } catch (err) {
    console.warn("Live public actors unavailable; falling back to manifest snapshot:", err instanceof Error ? err.message : String(err));
    publicActors = await loadManifestSnapshot();
    usedManifestFallback = true;
  }

  try {
    queuedPostsByBucketKey = await getQueuedPostsByBucketKey();
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn("social_post_queue table not found; assuming no queued posts.");
    } else {
      console.warn("Could not load queued posts; assuming no queued posts:", err instanceof Error ? err.message : String(err));
    }
    queuedPostsByBucketKey = new Map();
  }

  console.log(`Public actors above threshold: ${publicActors.length}${usedManifestFallback ? " (manifest snapshot)" : ""}`);
  console.log(`Already queued/staged:         ${queuedPostsByBucketKey.size}\n`);

  const staged: Array<{
    name: string;
    state: string;
    status: string;
    reason?: string;
    reviewNotes?: string | null;
    frames: number;
    hasPhoto: boolean;
  }> = [];

  await runWithConcurrency(publicActors, 5, async (actor) => {
    const bucketKey = actorBucketKey(actor);
    const existing = queuedPostsByBucketKey.get(bucketKey);

    const derived = deriveStateSlug(actor);
    if (!derived) {
      staged.push({
        name: actor.name,
        state: actor.location_key ?? actor.state_code ?? "?",
        status: "skipped",
        reason: "Could not derive state/slug",
        frames: 0,
        hasPhoto: false,
      });
      return;
    }

    const localAssets = await actorHasLocalAssets(derived.state, derived.slug);
    if (!localAssets.hasSpec || !localAssets.hasShare || !localAssets.hasPhoto || localAssets.frameCount === 0) {
      staged.push({
        name: actor.name,
        state: actor.location_key ?? actor.state_code ?? "?",
        status: "skipped",
        reason: `Local assets incomplete (spec=${localAssets.hasSpec}, share=${localAssets.hasShare}, photo=${localAssets.hasPhoto}, frames=${localAssets.frameCount})`,
        frames: localAssets.frameCount,
        hasPhoto: localAssets.hasPhoto,
      });
      return;
    }

    const buildResult = await buildSocialPostPackage(actor);
    if (!buildResult.ok) {
      staged.push({
        name: actor.name,
        state: actor.location_key ?? actor.state_code ?? "?",
        status: "skipped",
        reason: buildResult.reason,
        frames: 0,
        hasPhoto: false,
      });
      return;
    }

    const pkg = buildResult.package;
    const existingSignature = existing?.package_json?.content_signature
      ?? (existing?.package_json ? socialPostPackageSignature(existing.package_json) : null);
    const nextSignature = pkg.content_signature ?? socialPostPackageSignature(pkg);
    if (existing && existingSignature === nextSignature) {
      return;
    }

    const status = "pending_review";
    const reviewNotes = existing
      ? "Updated with new parent quote/slides since the last queue item; review before posting."
      : null;

    staged.push({
      name: pkg.actor_name,
      state: pkg.state_abbr,
      status,
      reviewNotes,
      frames: pkg.frames.length,
      hasPhoto: true,
    });
  });

  if (staged.length === 0) {
    console.log("No new actors would be staged.");
  } else {
    const toStage = staged.filter(s => s.status !== "skipped");
    const skipped = staged.filter(s => s.status === "skipped");
    console.log(`Would stage ${toStage.length} new post(s) and skip ${skipped.length} actor(s):\n`);
    for (const s of staged) {
      if (s.status === "skipped") {
        console.log(`⏭  ${s.name} (${s.state}) — skipped: ${s.reason}`);
      } else {
        console.log(`${s.status === "needs_review" ? "⚠️" : "✅"} ${s.name} (${s.state}) — ${s.status}`);
        console.log(`   Frames: ${s.frames} · Hero photo: ${s.hasPhoto ? "yes" : "no"}`);
        if (s.reviewNotes) console.log(`   Note:   ${s.reviewNotes}`);
      }
    }
  }

  console.log("\n✅ Dry run complete. No changes were made.\n");
}

main().catch(err => {
  console.error("\nDry run failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
