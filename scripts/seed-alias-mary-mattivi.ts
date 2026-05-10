/**
 * One-time seed: record an admin same_actor decision merging the Kansas
 * judge "Mary Mattivi" with the surname-only spelling "Mativi" so they
 * count as ONE actor instead of two separate buckets at 1 family each.
 *
 * The improved similarity rule in lib/court-actor-similarity.ts now
 * catches surname-only typo variants automatically going forward, but
 * the existing rows in the DB need this seed to merge their counts now
 * without waiting for the admin to click through "Possible Matches".
 *
 * Idempotent: if a decision for this cluster_key already exists it is
 * upserted (the unique constraint on cluster_key handles it).
 *
 * Usage:
 *   cd /Users/meghannmiller/Code/standwithmeg-court-actor-fresh
 *   npx tsx scripts/seed-alias-mary-mattivi.ts --dry-run
 *   npx tsx scripts/seed-alias-mary-mattivi.ts --apply
 */

import { existsSync, readFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { actorLooseNameKey } from "../lib/court-actors";
import { buildClusterKey } from "../lib/court-actor-similarity";

loadDotEnvLocal();

function loadDotEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  const content = readFileSync(file, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseMode(argv: string[]): "dry-run" | "apply" {
  if (argv.includes("--apply") && argv.includes("--dry-run")) {
    throw new Error("Pass either --dry-run or --apply, not both.");
  }
  if (argv.includes("--apply")) return "apply";
  if (argv.includes("--dry-run")) return "dry-run";
  throw new Error("Missing mode. Pass --dry-run or --apply.");
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }

  const NAME_VARIANTS = ["Mary Mattivi", "Mativi"];
  const LOCATION_KEY = "KS";
  const CANONICAL_NAME = "Mary Mattivi";
  const CANONICAL_ROLE = "Judge";
  const NOTE = "Surname-only spelling 'Mativi' is the same Shawnee County, Kansas judge as Mary Mattivi. Seeded by scripts/seed-alias-mary-mattivi.ts.";

  const nameKeys = Array.from(new Set(NAME_VARIANTS.map(actorLooseNameKey).filter(Boolean))).sort();
  const clusterKey = buildClusterKey(nameKeys, LOCATION_KEY);

  console.log(`Mode:          ${mode}`);
  console.log(`Variants:      ${NAME_VARIANTS.join(" | ")}`);
  console.log(`Loose keys:    ${nameKeys.join(" | ")}`);
  console.log(`Location:      ${LOCATION_KEY}`);
  console.log(`Cluster key:   ${clusterKey}`);
  console.log(`Canonical:     ${CANONICAL_NAME} (${CANONICAL_ROLE})`);

  if (mode === "dry-run") {
    console.log("\nDry run finished. No state changed.");
    return;
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const variantsSnapshot = NAME_VARIANTS.map(name => ({
    name,
    role: CANONICAL_ROLE,
    location_key: LOCATION_KEY,
    court_or_county: "Shawnee",
  }));

  const { error } = await sb
    .from("court_actor_alias_decisions")
    .upsert(
      {
        cluster_key: clusterKey,
        location_key: LOCATION_KEY,
        decision: "same_actor",
        canonical_name: CANONICAL_NAME,
        canonical_role: CANONICAL_ROLE,
        name_keys: nameKeys,
        variants: variantsSnapshot,
        note: NOTE,
        decided_by: "scripts/seed-alias-mary-mattivi.ts",
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cluster_key" },
    );

  if (error) {
    throw new Error(`Upsert failed: ${error.message}`);
  }

  console.log("\nDone. The same_actor decision is in place.");
  console.log(
    "Next /report and /api/admin/court-actors counts will show Mary Mattivi merged with Mativi.",
  );
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("ERROR:", msg);
  process.exit(1);
});
