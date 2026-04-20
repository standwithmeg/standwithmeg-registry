/**
 * Diagnose why dashboard counts don't match the spreadsheet.
 * Shows per-state comparison between the source xlsx and what's in Supabase.
 */

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { readFileSync } from "fs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Load spreadsheet
  const wb = XLSX.readFile("/Volumes/2023 Big 18/standwithmeg/outputs/SWM_MASTER_LATEST.xlsx");
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });

  // Count per state in spreadsheet
  const sheetByState = new Map<string, number>();
  let noEmail = 0, noState = 0, valid = 0;
  for (const r of rows) {
    const state = (r["State of Occurrence"] || "").trim().toUpperCase();
    const email = (r["Email"] || "").trim();
    if (!email) noEmail++;
    if (!state) noState++;
    if (state && /^[A-Z]{2}$/.test(state)) {
      sheetByState.set(state, (sheetByState.get(state) ?? 0) + 1);
      valid++;
    }
  }

  console.log("─── Spreadsheet ───");
  console.log(`  Total rows:              ${rows.length}`);
  console.log(`  Rows with no email:      ${noEmail}`);
  console.log(`  Rows with no US state:   ${noState}`);
  console.log(`  Rows with valid state:   ${valid}`);

  // Load index.json (PDF counts)
  const index = JSON.parse(readFileSync(
    "/Volumes/2023 Big 18/standwithmeg/outputs/state_packets_pdf/index.json", "utf8"));
  const indexByState = new Map<string, number>(index.map((r: { state: string; submissions: number }) => [r.state, r.submissions]));

  // Load DB counts from movement_stats_by_state (what the dashboard shows)
  const { data: dbStates } = await sb.from("movement_stats_by_state").select("state, is_us, total_submissions");
  const dbByState = new Map<string, number>();
  for (const r of dbStates ?? []) {
    if (r.is_us) dbByState.set(r.state, r.total_submissions);
  }

  // Compare
  console.log("\n─── Per-state comparison (sorted by spreadsheet count) ───");
  console.log("State  |  Sheet  |  PDF idx  |  Dashboard  |  Gap");
  console.log("─".repeat(55));

  const allStates = new Set([...sheetByState.keys(), ...indexByState.keys(), ...dbByState.keys()]);
  const sortedStates = [...allStates].sort((a, b) =>
    (sheetByState.get(b) ?? 0) - (sheetByState.get(a) ?? 0));

  let biggestGap = { state: "", gap: 0 };
  for (const state of sortedStates) {
    const sheet = sheetByState.get(state) ?? 0;
    const pdf = indexByState.get(state) ?? 0;
    const db = dbByState.get(state) ?? 0;
    const gap = sheet - db;
    if (Math.abs(gap) > Math.abs(biggestGap.gap)) biggestGap = { state, gap };
    const marker = gap !== 0 ? "  ⚠" : "";
    console.log(`  ${state}  |  ${String(sheet).padStart(5)}  |  ${String(pdf).padStart(7)}  |  ${String(db).padStart(9)}  |  ${String(gap).padStart(4)}${marker}`);
  }

  const sheetTotal = [...sheetByState.values()].reduce((a, b) => a + b, 0);
  const pdfTotal = [...indexByState.values()].reduce((a, b) => a + b, 0);
  const dbTotal = [...dbByState.values()].reduce((a, b) => a + b, 0);
  console.log("─".repeat(55));
  console.log(`  TOT |  ${String(sheetTotal).padStart(5)}  |  ${String(pdfTotal).padStart(7)}  |  ${String(dbTotal).padStart(9)}  |  ${String(sheetTotal - dbTotal).padStart(4)}`);

  console.log(`\nBiggest gap: ${biggestGap.state} (sheet says +${biggestGap.gap} vs dashboard)`);
}

main().catch(console.error);
