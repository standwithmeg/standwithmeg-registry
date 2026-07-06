/**
 * Proves reconcileActorPublications keeps the source-of-truth table fresh —
 * on THROWAWAY test actors (state "ZZ") that can't collide with real data.
 * Injects a synthetic live-actor list, so it never touches the real API,
 * surveys, or the report. Deletes its test rows at the end.
 *
 *   npx tsx scripts/test-reconcile-actor-publications.ts
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
  reconcileActorPublications,
  getActorPublication,
  deletePublication,
  publicationKey,
  type LiveActorInput,
} from "../lib/actor-publications";

const A_NAME = "ZZZ Reconcile Alpha";
const B_NAME = "ZZZ Reconcile Beta";
const ST = "ZZ";
const A_KEY = publicationKey(A_NAME, "Judge", ST);
const B_KEY = publicationKey(B_NAME, "Attorney", ST);

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.log(`  ✗ ${label}`); }
}

function live(name: string, role: string, count: number, photo: string | null): LiveActorInput {
  return { name, role, state_code: ST, location_key: ST, count, photo_url: photo, latest_reported_at: null };
}

async function main() {
  await deletePublication(A_KEY);
  await deletePublication(B_KEY);

  console.log("Round 1 — two brand-new actors appear on the public list (no photos yet) →");
  const r1 = await reconcileActorPublications([
    live(A_NAME, "Judge", 3, null),
    live(B_NAME, "Attorney", 4, null),
  ]);
  check("2 promoted", r1.promoted === 2);
  check("0 photos", r1.photoNewlyApproved === 0);
  const a1 = await getActorPublication(A_KEY);
  check("Alpha is report_visible", a1?.report_visible === true);
  check("Alpha photo_status = none", a1?.photo_status === "none");

  console.log("\nRound 2 — re-run with the SAME data (nothing changed) →");
  const r2 = await reconcileActorPublications([
    live(A_NAME, "Judge", 3, null),
    live(B_NAME, "Attorney", 4, null),
  ]);
  check("nothing re-promoted (idempotent)", r2.promoted === 0 && r2.countUpdated === 0 && r2.photoNewlyApproved === 0);

  console.log("\nRound 3 — Alpha gets a new family (4→ wait, 3→6) and Beta gets a photo →");
  const r3 = await reconcileActorPublications([
    live(A_NAME, "Judge", 6, null),
    live(B_NAME, "Attorney", 4, "court-actors/zz/beta/image_1080.png"),
  ]);
  check("1 count updated (Alpha)", r3.countUpdated === 1);
  check("1 photo newly approved (Beta)", r3.photoNewlyApproved === 1);
  const a3 = await getActorPublication(A_KEY);
  const b3 = await getActorPublication(B_KEY);
  check("Alpha family_count now 6", a3?.family_count === 6);
  check("Beta photo_status = approved", b3?.photo_status === "approved");
  check("Beta slides marked stale", b3?.slides_stale === true);
  check("Beta social queued for auto-publish", b3?.social_status === "queued");

  console.log("\nRound 4 — re-run again; Beta's photo already approved, shouldn't re-queue →");
  const r4 = await reconcileActorPublications([
    live(A_NAME, "Judge", 6, null),
    live(B_NAME, "Attorney", 4, "court-actors/zz/beta/image_1080.png"),
  ]);
  check("no photo re-approved (won't double-post)", r4.photoNewlyApproved === 0);

  console.log("\nCleanup →");
  await deletePublication(A_KEY);
  await deletePublication(B_KEY);
  check("both test rows deleted", (await getActorPublication(A_KEY)) === null && (await getActorPublication(B_KEY)) === null);

  console.log(`\n${failed === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
