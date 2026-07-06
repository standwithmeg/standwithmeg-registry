/**
 * Keeps actor_publications (the source of truth from migration 061) in sync
 * with the live public court-actor list: promotes new actors to the report,
 * refreshes family counts, and flips photo_status → approved (queuing the
 * auto-publish) the first time a photo appears.
 *
 * SAFE: writes only to actor_publications. Idempotent. Never touches surveys,
 * the report, or real actor rows.
 *
 *   npx tsx scripts/reconcile-actor-publications.ts --dry-run   # preview, write nothing
 *   npx tsx scripts/reconcile-actor-publications.ts --apply     # sync
 *
 * Env (loaded from .env.local locally; repo secrets in CI):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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

import { reconcileFromLiveApi } from "../lib/actor-publications";

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run");
  if (apply === dryRun) {
    console.error("Pass exactly one of --dry-run or --apply.");
    process.exit(1);
  }

  const banner = dryRun ? "DRY RUN — no writes." : "APPLY — syncing actor_publications.";
  console.log("=".repeat(banner.length));
  console.log(banner);
  console.log("=".repeat(banner.length));

  const r = await reconcileFromLiveApi({ dryRun });
  console.log(`\nLive actors:            ${r.total}`);
  console.log(`Would promote (new):    ${r.promoted}`);
  console.log(`Would update counts:    ${r.countUpdated}`);
  console.log(`Photos newly approved:  ${r.photoNewlyApproved}`);
  console.log(
    r.promoted + r.countUpdated + r.photoNewlyApproved === 0
      ? "\n✓ Already in sync — nothing to change."
      : `\n${dryRun ? "Dry run finished (nothing written)." : "✓ Sync complete."}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
