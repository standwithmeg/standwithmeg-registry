#!/usr/bin/env tsx
/**
 * Bulk retry failed Blotato posts from the social post queue.
 *
 * Diagnosed issues addressed before retry:
 * - Special chars like '(' in actor names sanitized in captions (prevents deserial errors).
 * - Media URLs now always built with URL API + only JPG frames preferred (fixes media fetch/conversion on IG/X).
 * - Limited to 6 media items.
 * - For rate limits ("35 posts for label/account"), this script spaces posts with scheduledTime (1 per ~45min).
 *
 * Usage (from registry root):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BLOTATO_API_KEY=... \
 *   npx tsx scripts/retry-failed-social-posts.ts --dry-run
 *
 *   npx tsx scripts/retry-failed-social-posts.ts --retry
 *
 * To target specific:
 *   npx tsx scripts/retry-failed-social-posts.ts --retry --actor "James Roeder" --platform instagram,facebook
 *
 * File paths relevant: this script + edits to lib/social-post/blotato.ts + lib/social-post/captions.ts
 * (Core pipeline is in registry; if you have copies or assets in standwithmeg-marketing, sync after.)
 */

import { createClient } from "@supabase/supabase-js";
import { publishToBlotato, type BlotatoPlatform } from "../lib/social-post/blotato";
import { enrichPackageLegislators } from "../lib/social-post/package";
import type { SocialPostPackage, QueuedSocialPost } from "../lib/social-post/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BLOTATO_KEY = process.env.BLOTATO_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function parseArgs() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const doRetry = args.includes("--retry");
  const actorFilter = args.includes("--actor") ? args[args.indexOf("--actor") + 1] : null;
  const platformArg = args.includes("--platform") ? args[args.indexOf("--platform") + 1] : null;
  const platforms = platformArg ? platformArg.split(",").filter(Boolean) as BlotatoPlatform[] : undefined;
  return { dry, doRetry, actorFilter: actorFilter?.toLowerCase(), platforms };
}

async function findFailedRows(actorFilter?: string | null): Promise<QueuedSocialPost[]> {
  // Look for posts that have failure notes or were partial posted.
  const query = sb
    .from("social_post_queue")
    .select("*")
    .or("review_notes.ilike.%failed%,review_notes.ilike.%error%,review_notes.ilike.%Blotato%")
    .order("updated_at", { ascending: false })
    .limit(100);

  const { data, error } = await query;
  if (error) throw error;

  let rows: unknown[] = (data || []) as unknown[];

  if (actorFilter) {
    rows = rows.filter((r: unknown) => {
      const rec = r as Record<string, unknown>;
      return ((rec.actor_name as string) || "").toLowerCase().includes(actorFilter);
    });
  }

  return rows as QueuedSocialPost[];
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const { dry, doRetry, actorFilter, platforms } = parseArgs();
  console.log("Scanning for failed social posts... filter:", actorFilter || "all");

  const rows = await findFailedRows(actorFilter);
  console.log(`Found ${rows.length} candidate rows with failure notes.`);

  if (!doRetry) {
    console.log("Dry run / list only. Use --retry to publish.");
    rows.slice(0, 5).forEach(r => console.log(" -", r.actor_name, r.status, r.review_notes?.slice(0,80)));
    return;
  }

  if (!BLOTATO_KEY) {
    console.error("BLOTATO_API_KEY required for retry.");
    process.exit(1);
  }

  const scheduledBase = new Date(Date.now() + 5 * 60 * 1000); // start in 5 min
  const intervalMs = 45 * 60 * 1000; // space to avoid 35 post label/account limits on FB

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let pkg: SocialPostPackage = (row as Record<string, unknown>).package_json as SocialPostPackage;

    // Re-enrich in case old package missing legislators etc.
    pkg = enrichPackageLegislators(pkg);

    // Sanitize captions in stored package to remove ( ) that trigger deserial bugs on Blotato/FB/IG side.
    if (pkg.captions) {
      const sanitize = (t: string) => (t || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
      pkg.captions.facebook = sanitize(pkg.captions.facebook);
      pkg.captions.instagram = sanitize(pkg.captions.instagram);
      pkg.captions.x = sanitize(pkg.captions.x);
      pkg.captions.firstComment = sanitize(pkg.captions.firstComment);
      pkg.captions.legislatorComment = sanitize(pkg.captions.legislatorComment || "");
    }

    const sched = new Date(scheduledBase.getTime() + i * intervalMs);

    console.log(`Retrying ${i+1}/${rows.length}: ${row.actor_name} @ ${sched.toISOString()} platforms=${platforms || "all"}`);

    if (dry) {
      console.log("  (dry) would call publishToBlotato with scheduledTime");
      continue;
    }

    const results = await publishToBlotato({
      package: pkg,
      platforms,
      scheduledTime: sched,
    });

    const ok = results.some(r => r.success);
    console.log("  results:", results.map(r => `${r.platform}:${r.success ? "ok" : r.error}`));

    if (ok) {
      // Optionally update the row notes
      await sb.from("social_post_queue").update({
        review_notes: (row.review_notes || "") + ` | Retried via script at ${new Date().toISOString()}`,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
    }

    await sleep(2000); // small gap
  }

  console.log("Done. Check Blotato dashboard / admin queue for status. Re-run with --retry if needed after fixes.");
}

main().catch(e => { console.error(e); process.exit(1); });