/**
 * Proves the actor_publications freshness pipeline works — on a THROWAWAY test
 * actor whose key ("zzz pipeline testactor|ZZ") cannot collide with any real
 * actor. Touches only actor_publications, never surveys/report/real actors, and
 * deletes the test row at the end.
 *
 *   npx tsx scripts/test-actor-publications-pipeline.ts
 */

import { existsSync, readFileSync } from "fs";
import path from "path";

function loadDotEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadDotEnvLocal();

import {
  onActorPromotedToReport,
  onActorPhotoAssigned,
  markSlidesCurrent,
  getActorPublication,
  deletePublication,
  publicationKey,
} from "../lib/actor-publications";

const TEST_NAME = "ZZZ Pipeline Testactor";
const TEST_ROLE = "Judge";
const TEST_STATE = "ZZ";
const KEY = publicationKey(TEST_NAME, TEST_ROLE, TEST_STATE);

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}`);
  }
}

async function main() {
  console.log(`Test actor key: ${KEY}\n`);

  // Clean slate in case a previous run left the row behind.
  await deletePublication(KEY);

  console.log("1) A new family pushes this actor across the threshold →");
  const promoted = await onActorPromotedToReport({
    name: TEST_NAME,
    role: TEST_ROLE,
    stateCode: TEST_STATE,
    locationKey: TEST_STATE,
    familyCount: 3,
  });
  check("row created", !!promoted);
  check("report_visible = true (live on the report immediately)", promoted.report_visible === true);
  check("family_count recorded (3)", promoted.family_count === 3);
  check("photo_status = none (photo NOT required to be on the report)", promoted.photo_status === "none");
  check("social_status = not_posted (nothing auto-posts without a photo)", promoted.social_status === "not_posted");

  console.log("\n2) Another family reports the same actor (count goes 3 → 5) →");
  const bumped = await onActorPromotedToReport({
    name: TEST_NAME, role: TEST_ROLE, stateCode: TEST_STATE, locationKey: TEST_STATE, familyCount: 5,
  });
  check("family_count updated to 5", bumped.family_count === 5);
  check("still report_visible (idempotent, no duplicate row)", bumped.report_visible === true);
  check("report_visible_at unchanged (kept original go-live time)", bumped.report_visible_at === promoted.report_visible_at);

  console.log("\n3) Meg drops in an approved photo →");
  const withPhoto = await onActorPhotoAssigned({
    bucketKey: KEY,
    storagePath: "court-actors/zz/zzz_pipeline_testactor/image_1080.png",
    approvedBy: "founder@standwithmeg.com",
  });
  check("photo_status = approved", withPhoto.photo_status === "approved");
  check("slides marked stale (need regeneration with the photo)", withPhoto.slides_stale === true);
  check("social_status = queued (auto-publish queued per Meg's rule)", withPhoto.social_status === "queued");

  console.log("\n4) The pipeline regenerates the slides →");
  await markSlidesCurrent(KEY, null);
  const current = await getActorPublication(KEY);
  check("slides no longer stale", current?.slides_stale === false);
  check("photo still approved (survived the regen)", current?.photo_status === "approved");

  console.log("\n5) Cleanup →");
  await deletePublication(KEY);
  const gone = await getActorPublication(KEY);
  check("test row deleted (nothing left behind)", gone === null);

  console.log(`\n${failed === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
