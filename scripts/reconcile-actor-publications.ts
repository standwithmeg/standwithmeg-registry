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

// Must come before any transitive `server-only` import (supabase-admin,
// court-actor-buckets) so this script can run under tsx outside Next.js.
import "./_register-server-only-stub";
import { reconcileActorPublications, type LiveActorInput } from "../lib/actor-publications";
import { createAdminSupabaseClient } from "../lib/supabase-admin";
// The SAME live computation the old public API ran (canonical buckets, 3-family
// threshold, manifest photo/share merge) — imported straight from the route so
// script and web can never disagree about who is public.
import { computePublicActorsDirect } from "../app/api/survey/court-actors/route";

/**
 * The old source — GET my.standwithmeg.com/api/survey/court-actors — was
 * removed by the July 2026 site rebuild, and the snapshot fallback still
 * served by the legacy deployment is frozen at old counts (every actor at 3
 * families), which would DOWNGRADE live counts if reconciled against. So the
 * script computes the live public list itself, from the same Supabase tables,
 * with the same code the endpoint uses.
 */
async function fetchLiveActors(): Promise<LiveActorInput[]> {
  const sb = createAdminSupabaseClient();
  const actors = await computePublicActorsDirect(sb, null, null, {
    readTimeoutMs: 55_000,
    bypassRowCache: true,
  });
  return actors.map((a) => ({
    name: a.name,
    role: a.role,
    state_code: a.state_code,
    location_key: a.location_key,
    count: a.count,
    photo_url: a.photo_url,
    latest_reported_at: a.latest_reported_at,
  }));
}

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

  const live = await fetchLiveActors();
  console.log(`Computed live public actors from Supabase: ${live.length}`);
  const r = await reconcileActorPublications(live, { dryRun });
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
