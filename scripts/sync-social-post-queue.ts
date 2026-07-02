/**
 * Sync the Supabase social_post_queue down to the local standwithmeg-show folders.
 *
 * Usage:
 *   npx tsx scripts/sync-social-post-queue.ts --dry-run   # preview only
 *   npx tsx scripts/sync-social-post-queue.ts --sync      # write files + update ledger
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SHOW_REPO_PATH  (optional — defaults to ../standwithmeg-show)
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { publicAssetOrigin } from "../lib/court-actor-public-assets";

type QueueRow = {
  id: string;
  actor_bucket_key: string;
  actor_slug: string;
  actor_name: string;
  status: string;
  package_json: {
    actor_slug: string;
    actor_name: string;
    captions: {
      facebook: string;
      instagram: string;
      x: string;
      firstComment: string;
      locationTag: string;
    };
    frames: Array<{ url: string; filename: string; order: number }>;
    share_url: string;
  };
  created_at: string;
  updated_at: string;
};

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

loadDotEnvLocal();

function showRepoPath(): string {
  return process.env.SHOW_REPO_PATH?.trim() || path.join(process.cwd(), "..", "standwithmeg-show");
}

function folderForStatus(status: string): string | null {
  switch (status) {
    case "pending_review":
      return "social-media-1-pending-review";
    case "approved_to_post":
      return "social-media-2-approved-to-post";
    case "posted":
      return "social-media-3-posted";
    default:
      return null;
  }
}

function slugFolderName(row: QueueRow): string {
  if (row.status === "posted") {
    const date = new Date(row.created_at).toISOString().slice(0, 10);
    return `${date}-${row.actor_slug}`;
  }
  return row.actor_slug;
}

async function fetchAllQueueRows(): Promise<QueueRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const rows: QueueRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb
      .from("social_post_queue")
      .select("id, actor_bucket_key, actor_slug, actor_name, status, package_json, created_at, updated_at")
      .in("status", ["pending_review", "approved_to_post", "posted"])
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to fetch queue: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as QueueRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  const absoluteUrl = url.startsWith("http") ? url : `${publicAssetOrigin()}${url.startsWith("/") ? "" : "/"}${url}`;
  try {
    const res = await fetch(absoluteUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function syncRow(row: QueueRow, baseDir: string, dryRun: boolean): Promise<{ wrote: string[]; skipped: string[] }> {
  const folderName = folderForStatus(row.status);
  if (!folderName) return { wrote: [], skipped: [] };

  const targetDir = path.join(baseDir, folderName, slugFolderName(row));
  const wrote: string[] = [];
  const skipped: string[] = [];

  if (!dryRun) {
    await mkdir(targetDir, { recursive: true });
  }

  const pkg = row.package_json;
  const files: Record<string, string> = {
    "caption.txt": pkg.captions.facebook,
    "caption-facebook.txt": pkg.captions.facebook,
    "caption-instagram.txt": pkg.captions.instagram,
    "caption-x.txt": pkg.captions.x,
    "first-comment.txt": pkg.captions.firstComment,
    "location-tag.txt": pkg.captions.locationTag,
  };

  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(targetDir, filename);
    if (dryRun) {
      wrote.push(filePath);
    } else {
      await writeFile(filePath, content, "utf-8");
      wrote.push(filePath);
    }
  }

  for (const frame of pkg.frames) {
    const filePath = path.join(targetDir, frame.filename);
    if (dryRun) {
      wrote.push(filePath);
      continue;
    }
    const buffer = await downloadImage(frame.url);
    if (buffer) {
      await writeFile(filePath, buffer);
      wrote.push(filePath);
    } else {
      skipped.push(`${frame.url} -> ${filePath}`);
    }
  }

  return { wrote, skipped };
}

async function updateLedger(baseDir: string, rows: QueueRow[], dryRun: boolean): Promise<void> {
  const ledgerPath = path.join(baseDir, ".court-actor-post-ledger.json");
  let ledger: { posted_or_staged?: string[]; seeded_at?: string; note?: string } = {};
  try {
    const text = readFileSync(ledgerPath, "utf-8");
    ledger = JSON.parse(text);
  } catch {
    // start fresh
  }

  const set = new Set(ledger.posted_or_staged ?? []);
  for (const row of rows) {
    set.add(row.actor_slug);
  }
  const updated = {
    posted_or_staged: Array.from(set).sort(),
    seeded_at: ledger.seeded_at ?? new Date().toISOString().slice(0, 10),
    note: "Auto-updated by scripts/sync-social-post-queue.ts",
  };

  if (dryRun) {
    console.log(`[dry-run] Would update ${ledgerPath} with ${updated.posted_or_staged.length} entries.`);
  } else {
    await writeFile(ledgerPath, JSON.stringify(updated, null, 1) + "\n", "utf-8");
    console.log(`Updated ${ledgerPath} with ${updated.posted_or_staged.length} entries.`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const sync = argv.includes("--sync");

  if (!dryRun && !sync) {
    console.error("Pass --dry-run to preview, or --sync to write files.");
    process.exit(1);
  }

  const baseDir = showRepoPath();
  console.log(`${dryRun ? "[dry-run]" : "Syncing"} to ${baseDir}`);

  const rows = await fetchAllQueueRows();
  console.log(`Found ${rows.length} queue rows to sync.`);

  let totalWrote = 0;
  let totalSkipped = 0;

  for (const row of rows) {
    const { wrote, skipped } = await syncRow(row, baseDir, dryRun);
    totalWrote += wrote.length;
    totalSkipped += skipped.length;
    console.log(`  ${row.actor_name}: ${wrote.length} files${skipped.length > 0 ? `, ${skipped.length} skipped` : ""}`);
    for (const s of skipped) console.log(`    skipped ${s}`);
  }

  await updateLedger(baseDir, rows, dryRun);

  console.log(`\nDone. ${totalWrote} files ${dryRun ? "would be written" : "written"}, ${totalSkipped} skipped.`);
}

main().catch(err => {
  console.error("ERROR:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
