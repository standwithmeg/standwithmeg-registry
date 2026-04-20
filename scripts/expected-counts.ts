/**
 * Show per-state counts as they SHOULD be under the (email, state) policy.
 * This is what the DB should match.
 */
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function getEmail(r: Record<string, string>): string {
  let e = (r["Email"] || "").trim().toLowerCase();
  if (!e.includes("@")) {
    for (const v of Object.values(r)) {
      const s = String(v || "").trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) { e = s; break; }
    }
  }
  return e.includes("@") ? e : "";
}

async function main() {
  const wb = XLSX.readFile("/Volumes/2023 Big 18/standwithmeg/outputs/SWM_MASTER_LATEST.xlsx");
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });

  // Unique (email, state) in sheet
  const sheetUnique = new Map<string, number>();
  let skippedNoEmail = 0, skippedNoState = 0;
  const seenKeys = new Set<string>();
  for (const r of rows) {
    const email = getEmail(r);
    const state = (r["State of Occurrence"] || "").trim().toUpperCase();
    if (!email) { skippedNoEmail++; continue; }
    if (!/^[A-Z]{2}$/.test(state)) { skippedNoState++; continue; }
    const key = `${email}|${state}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    sheetUnique.set(state, (sheetUnique.get(state) ?? 0) + 1);
  }

  // DB counts
  const { data: dbStates } = await sb.from("movement_stats_by_state")
    .select("state, is_us, total_submissions");
  const dbByState = new Map<string, number>();
  for (const r of dbStates ?? []) if (r.is_us) dbByState.set(r.state, r.total_submissions);

  console.log("Expected vs Actual (unique email+state policy)\n");
  console.log("State  |  Sheet-unique  |  Dashboard  |  Gap");
  console.log("─".repeat(50));

  let totalSheet = 0, totalDb = 0;
  for (const [state, n] of [...sheetUnique.entries()].sort((a, b) => b[1] - a[1])) {
    const db = dbByState.get(state) ?? 0;
    const gap = n - db;
    const marker = gap !== 0 ? "  ⚠" : "";
    console.log(`  ${state}  |  ${String(n).padStart(12)}  |  ${String(db).padStart(9)}  |  ${String(gap).padStart(4)}${marker}`);
    totalSheet += n;
    totalDb += db;
  }
  console.log("─".repeat(50));
  console.log(`  TOT |  ${String(totalSheet).padStart(12)}  |  ${String(totalDb).padStart(9)}  |  ${String(totalSheet - totalDb).padStart(4)}`);
  console.log(`\nSheet rows skipped: no email=${skippedNoEmail}, no state=${skippedNoState}`);
}

main().catch(console.error);
