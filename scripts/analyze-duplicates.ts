/**
 * Classify duplicate-email rows in the spreadsheet by whether they share state.
 *   - Same email + same state  → update existing (overwrite with latest)
 *   - Same email + different state → new distinct row
 */
import * as XLSX from "xlsx";

const wb = XLSX.readFile("/Volumes/2023 Big 18/standwithmeg/outputs/SWM_MASTER_LATEST.xlsx");
const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });

function getEmail(r: Record<string, string>): string {
  let e = (r["Email"] || "").trim().toLowerCase();
  if (!e.includes("@")) {
    for (const v of Object.values(r)) {
      const s = String(v || "").trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) { e = s; break; }
    }
  }
  return e;
}

// Group rows by email
const byEmail = new Map<string, Array<{ state: string; date: string }>>();
for (const r of rows) {
  const email = getEmail(r);
  if (!email.includes("@")) continue;
  const state = (r["State of Occurrence"] || "").trim().toUpperCase() || "(INTL)";
  const date = (r["Submission Date"] || "").trim();
  if (!byEmail.has(email)) byEmail.set(email, []);
  byEmail.get(email)!.push({ state, date });
}

let sameStateDupes = 0;
let diffStateDupes = 0;
const samples: Array<{ email: string; entries: Array<{ state: string; date: string }> }> = [];

for (const [email, entries] of byEmail) {
  if (entries.length < 2) continue;
  const states = new Set(entries.map(e => e.state));
  if (states.size === 1) {
    sameStateDupes += entries.length - 1; // N entries in same state = N-1 updates
    if (samples.length < 3) samples.push({ email, entries });
  } else {
    diffStateDupes += entries.length - states.size; // multi-state kept, same-state collapsed
  }
}

console.log("─── Duplicate analysis ───");
console.log(`  Unique emails:            ${byEmail.size}`);
console.log(`  Same-state dupes (update): ${sameStateDupes}   (these should collapse to 1 row)`);
console.log(`  Multi-state dupes (new):   ${diffStateDupes}    (these should stay as separate rows)`);
console.log(`\nSample same-state dupes:`);
for (const s of samples) {
  console.log(`  ${s.email}:`);
  for (const e of s.entries) console.log(`    ${e.state}  ${e.date}`);
}

const expectedTotalRows = rows.length - sameStateDupes;
console.log(`\nExpected DB total after policy applied: ${expectedTotalRows}`);
