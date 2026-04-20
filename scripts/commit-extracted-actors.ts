/**
 * Reads /tmp/court-actors-extraction-preview.csv, applies quality filters,
 * and commits to court_actors table. No further API calls.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/commit-extracted-actors.ts           # dry run — shows what would be committed
 *   npx tsx --env-file=.env.local scripts/commit-extracted-actors.ts --commit  # actually inserts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";

// Env fallback (tsx --env-file parses weirdly around comments)
if (existsSync(".env.local")) {
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const COMMIT = process.argv.includes("--commit");
const CSV_PATH = "/tmp/court-actors-extraction-preview.csv";

// ── Name-quality filters (tighter than the extraction script) ───────

function isValidName(raw: string, source: string): boolean {
  const name = raw.trim();
  if (name.length < 3) return false;

  const lower = name.toLowerCase();

  // Placeholder phrases AI returns when no real name is available
  const placeholders = [
    "unknown", "unnamed", "not named", "not specified", "no name",
    "n/a", "none", "anonymous", "tbd", "pending", "undisclosed",
    "withheld", "first name", "last name",
  ];
  for (const p of placeholders) {
    if (lower.includes(p)) return false;
  }

  // Description-not-name patterns
  if (name.includes(" - ")) return false;
  if (name.includes(" – ")) return false;

  // Must have a capital letter
  if (!/[A-Z]/.test(name)) return false;

  // Must have enough letters
  if (!/[a-zA-Z]{3,}/.test(name)) return false;

  // For AI-extracted single-word names, require capitalized start
  if (source === "extracted_ai") {
    // Drop lowercase-only phrases like "minors counsel"
    if (name === name.toLowerCase()) return false;
    // Drop obvious role descriptions
    const descWords = ["counsel", "lawyer", "attorney", "worker", "judge",
      "evaluator", "therapist", "mediator", "GAL"];
    const nameLower = name.toLowerCase();
    const isRoleDescOnly = descWords.some(d =>
      nameLower === d || nameLower === "the " + d || nameLower === "a " + d);
    if (isRoleDescOnly) return false;
  }

  return true;
}

// Simple CSV parser for our extraction format
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split("\n").filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

async function main() {
  if (!existsSync(CSV_PATH)) {
    console.error(`Missing CSV: ${CSV_PATH}`);
    console.error("Run the extraction dry-run first: scripts/extract-court-actors.ts");
    process.exit(1);
  }

  const raw = parseCSV(readFileSync(CSV_PATH, "utf8"));
  console.log(`Loaded ${raw.length} rows from CSV.`);

  const filtered = raw.filter(r => isValidName(r.name, r.source));
  const dropped = raw.length - filtered.length;
  console.log(`  Kept: ${filtered.length}`);
  console.log(`  Dropped: ${dropped}`);
  console.log();

  // Breakdown by source
  const bySource = new Map<string, number>();
  for (const r of filtered) bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);
  for (const [s, n] of bySource) console.log(`  ${s}: ${n}`);
  console.log();

  // Top names
  const byName = new Map<string, number>();
  for (const r of filtered) {
    const k = `${r.role} — ${r.name}${r.state_code ? ` (${r.state_code})` : ""}`;
    byName.set(k, (byName.get(k) ?? 0) + 1);
  }
  const top = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log("Top 15 unique (name, role, state):");
  for (const [n, c] of top) console.log(`  ${c.toString().padStart(3)}  ${n}`);
  console.log();

  // Check for existing rows to avoid duplicates
  const existing = new Set<string>();
  let f2 = 0;
  while (true) {
    const { data } = await sb.from("court_actors").select("submission_id, role, name").range(f2, f2 + 999);
    if (!data || data.length === 0) break;
    for (const r of data) existing.add(`${r.submission_id}|${r.role}|${r.name.toLowerCase().trim()}`);
    if (data.length < 1000) break;
    f2 += 1000;
  }
  const newRows = filtered.filter(r => !existing.has(`${r.submission_id}|${r.role}|${r.name.toLowerCase().trim()}`));
  console.log(`New rows to insert (after dedup vs existing DB): ${newRows.length}`);

  if (!COMMIT) {
    console.log("\nDRY RUN — no changes made. Run with --commit to insert.");
    return;
  }

  // Commit
  const toInsert = newRows.map(r => ({
    submission_id: r.submission_id,
    role: r.role,
    name: r.name,
    court_or_county: r.court_or_county || null,
    state_code: r.state_code || null,
    notes: `[${r.source}] ${r.snippet || ""}`.slice(0, 500),
    source: r.source,
  }));

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100);
    const { error } = await sb.from("court_actors").insert(batch);
    if (error) { console.error("  Batch error:", error.message); continue; }
    inserted += batch.length;
    process.stdout.write(`\r  ${inserted}/${toInsert.length}`);
  }
  console.log(`\n\nInserted ${inserted} extracted court actors.`);
}

main().catch(err => { console.error(err); process.exit(1); });
