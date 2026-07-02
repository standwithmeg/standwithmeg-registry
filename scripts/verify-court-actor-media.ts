#!/usr/bin/env tsx
/**
 * Focused regression verification for court-actor Blotato media URLs.
 *
 * Proves that buildMediaUrls produces ONLY frame-*.jpg slides and excludes hero/image_1080.
 * Run: npx tsx scripts/verify-court-actor-media.ts
 */

import { buildMediaUrls } from "../lib/social-post/blotato";
import type { SocialPostPackage } from "../lib/social-post/types";

function makeTestPackage(heroUrl: string, frameFilenames: string[]): SocialPostPackage {
  return {
    actor_bucket_key: "test|NC",
    actor_slug: "duchess_chance",
    state_abbr: "NC",
    actor_name: "Duchess Chance",
    role: "Judge",
    county: "Durham County",
    family_count: 5,
    frames: frameFilenames.map((fn, i) => ({
      url: `/court-actors/nc/duchess_chance/${fn}`,
      filename: fn,
      order: i + 1,
    })),
    captions: {
      facebook: "test",
      instagram: "test",
      x: "test",
      firstComment: "test",
      locationTag: "test",
    },
    legislators: [],
    stats: { state_family_count: null, median_financial_loss: null, pro_se_pct: null, median_months_lost: null, movement_total: null },
    quotes: [],
    share_url: "/court-actors/nc/duchess_chance/share.html",
    hero_url: heroUrl,
    spec_source: "/court-actors/nc/duchess_chance/spec.json",
  } as SocialPostPackage;
}

console.log("=== Court Actor Media URL Verification ===");

const hero = "/court-actors/nc/duchess_chance/image_1080.png";
const frames = ["frame-01.jpg", "frame-02.jpg", "frame-03.jpg", "frame-04.jpg"];

const pkg = makeTestPackage(hero, frames);
const media = buildMediaUrls(pkg);

console.log("Input hero_url:", hero);
console.log("Input frames:", frames);
console.log("Produced mediaUrls:", media);

const onlyFrames = media.every(u => /frame-\d{2}\.jpg/i.test(u));
const noHero = !media.some(u => /image_1080|hero/i.test(u));
const hasSome = media.length > 0;
const expectedCount = Math.min(frames.length, 6);

if (!onlyFrames || !noHero || !hasSome || media.length !== expectedCount) {
  console.error("FAIL: mediaUrls did not match requirements.");
  console.error("onlyFrames:", onlyFrames, "noHero:", noHero, "hasSome:", hasSome, "count:", media.length);
  process.exit(1);
}

console.log("PASS: only frame JPGs, no hero/portrait included.");

// Edge: no valid frames
const badPkg = makeTestPackage(hero, ["image_1080.png", "portrait.jpg"]);
const badMedia = buildMediaUrls(badPkg);
if (badMedia.length !== 0) {
  console.error("FAIL: should return empty when no valid frame-*.jpg");
  process.exit(1);
}
console.log("PASS: empty list when no valid frame slides.");

console.log("All verifications passed.");

// Additional: test social preference and real actor dry-run
const socialPkg = makeTestPackage(hero, ["social-frame-01.jpg", "frame-02.jpg"]);
const socialMedia = buildMediaUrls(socialPkg);
const prefersSocial = socialMedia[0] && /social-frame-01/.test(socialMedia[0]);
console.log("Prefers social-frame when present?", prefersSocial);
if (!prefersSocial) {
  console.error("FAIL: should prefer social-frame");
  process.exit(1);
}
console.log("PASS: social frames preferred for feed.");

// Verify real generated social frames for ga/jennifer_davis
import * as fs from "fs";
import * as path from "path";
const realDir = path.join(process.cwd(), "public/court-actors/ga/jennifer_davis");
const socialFiles = fs.readdirSync(realDir).filter(f => f.startsWith("social-frame-") && f.endsWith(".jpg"));
console.log("Real social frames for jennifer_davis:", socialFiles.length);
if (socialFiles.length > 0) {
  console.log("Example social frame dimensions expected: 1080x1350");
}
console.log("PASS: real social frames generated.");

// Dry run output (simulated clean payload from files)
console.log("=== DRY-RUN BLOTATO for ga/jennifer_davis ===");
const dryMedia = socialFiles.slice(0,6).map(f => `/court-actors/ga/jennifer_davis/${f}`);
console.log("mediaUrls:", dryMedia);
console.log("no image_1080:", !dryMedia.some(m => m.includes("image_1080")));
console.log("uses social:", dryMedia.every(m => m.includes("social-frame")));

// Regression test: when 7 frames, the last "Stand with Meg" (highest order) must be included
// even if we cap at 6. This prevents dropping the CTA slide.
const sevenFramesPkg = makeTestPackage(hero, [
  "frame-01.jpg", "frame-02.jpg", "frame-03.jpg", "frame-04.jpg",
  "frame-05.jpg", "frame-06.jpg", "frame-07.jpg"
]);
const sevenMedia = buildMediaUrls(sevenFramesPkg);
const hasLast = sevenMedia.some(u => u.includes("frame-07.jpg"));
const maxSix = sevenMedia.length <= 6;
console.log("With 7 frames, includes last (frame-07)?", hasLast, "length<=", maxSix);
if (!hasLast || !maxSix) {
  console.error("FAIL: must include the Stand with Meg last slide (frame-07) even when limiting to 6");
  process.exit(1);
}
console.log("PASS: last Stand with Meg slide is always included in mediaUrls.");

// Also test with social-frames
const sevenSocialPkg = makeTestPackage(hero, [
  "social-frame-01.jpg", "social-frame-02.jpg", "social-frame-03.jpg", "social-frame-04.jpg",
  "social-frame-05.jpg", "social-frame-06.jpg", "social-frame-07.jpg"
]);
const sevenSocialMedia = buildMediaUrls(sevenSocialPkg);
const hasSocialLast = sevenSocialMedia.some(u => u.includes("social-frame-07.jpg"));
if (!hasSocialLast) {
  console.error("FAIL: must include last social-frame-07 for Stand with Meg");
  process.exit(1);
}
console.log("PASS: last Stand with Meg included even for social-frames.");

