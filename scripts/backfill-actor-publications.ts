/**
 * Backfill actor_publications — one row per public court actor, using the
 * SAME canonical bucket-key logic the rest of the system uses
 * (actorBucketKeyWithLocation). This makes actor_publications the single
 * source of truth for report visibility + photo/slide/social state.
 *
 * SAFE: writes only to actor_publications (a fresh, empty table nothing reads
 * yet). Idempotent — upsert on actor_bucket_key, so re-running only refreshes.
 *
 *   npx tsx scripts/backfill-actor-publications.ts --dry-run   # show, write nothing
 *   npx tsx scripts/backfill-actor-publications.ts --apply     # upsert rows
 *
 * Reads the live public actor list from the deployed API so it matches exactly
 * what families see on the report today.
 */

import { existsSync, readFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { actorBucketKeyWithLocation } from "../lib/court-actors";

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

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com";

type PublicActor = {
  name: string;
  role: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  count: number;
  latest_reported_at: string | null;
  photo_url: string | null;
  share_url: string | null;
};

type PublicationRow = {
  actor_bucket_key: string;
  display_name: string;
  state_code: string | null;
  location_key: string | null;
  report_visible: boolean;
  report_visible_at: string | null;
  family_count: number;
  photo_status: "none" | "requested" | "received" | "approved";
  photo_storage_path: string | null;
};

async function fetchPublicActors(): Promise<PublicActor[]> {
  const res = await fetch(`${API_BASE}/api/survey/court-actors?limit=1000`);
  if (!res.ok) throw new Error(`court-actors API ${res.status}`);
  const data = (await res.json()) as { actors?: PublicActor[] };
  return data.actors ?? [];
}

function toRow(a: PublicActor): PublicationRow {
  const key = actorBucketKeyWithLocation(a.name, a.role, a.location_key ?? a.state_code);
  return {
    actor_bucket_key: key,
    display_name: a.name,
    state_code: a.state_code,
    location_key: a.location_key ?? a.state_code,
    report_visible: true, // it's on the public API ⇒ past threshold/review
    report_visible_at: a.latest_reported_at,
    family_count: a.count,
    // A live photo_url means Meg already approved the portrait.
    photo_status: a.photo_url ? "approved" : "none",
    photo_storage_path: a.photo_url ?? null,
  };
}

async function main() {
  const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry-run" : null;
  if (!mode) {
    console.error("Pass --dry-run (preview) or --apply (write).");
    process.exit(1);
  }

  const actors = await fetchPublicActors();
  // Dedup by bucket key — two spellings of one person collapse to one row.
  const byKey = new Map<string, PublicationRow>();
  for (const a of actors) {
    const row = toRow(a);
    const existing = byKey.get(row.actor_bucket_key);
    // Keep the richer row (prefer one that has a photo, else the higher count).
    if (!existing || (row.photo_status === "approved" && existing.photo_status !== "approved") || row.family_count > existing.family_count) {
      byKey.set(row.actor_bucket_key, row);
    }
  }
  const rows = [...byKey.values()];
  const withPhoto = rows.filter((r) => r.photo_status === "approved").length;

  console.log(`Public actors fetched: ${actors.length}`);
  console.log(`Unique publication rows: ${rows.length}  (${withPhoto} with an approved photo, ${rows.length - withPhoto} without)`);
  console.log("Sample:");
  for (const r of rows.slice(0, 5)) {
    console.log(`  ${r.actor_bucket_key.padEnd(28)} ${r.display_name} · ${r.state_code} · ${r.family_count} fam · photo=${r.photo_status}`);
  }

  if (mode === "dry-run") {
    console.log("\nDry run — nothing written. Re-run with --apply to upsert.");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for --apply.");
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Upsert in chunks; on_conflict on the primary key refreshes existing rows.
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb.from("actor_publications").upsert(chunk, { onConflict: "actor_bucket_key" });
    if (error) throw new Error(`upsert failed at row ${i}: ${error.message}`);
    written += chunk.length;
    console.log(`  upserted ${written}/${rows.length}`);
  }
  console.log(`\n✓ Backfill complete — ${written} actor_publications rows.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
