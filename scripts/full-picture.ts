/**
 * Full picture: legacy + unique sheet (email+state) should equal DB.
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
  // 1. Unique (email, state) in sheet
  const wb = XLSX.readFile("/Volumes/2023 Big 18/standwithmeg/outputs/SWM_MASTER_LATEST.xlsx");
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const sheetKeys = new Set<string>();
  const sheetByState = new Map<string, Set<string>>();
  for (const r of rows) {
    const email = getEmail(r);
    const state = (r["State of Occurrence"] || "").trim().toUpperCase();
    if (!email || !/^[A-Z]{2}$/.test(state)) continue;
    sheetKeys.add(`${email}|${state}`);
    if (!sheetByState.has(state)) sheetByState.set(state, new Set());
    sheetByState.get(state)!.add(email);
  }

  // 2. Legacy (email, state) keys
  async function fetchKeys(table: string): Promise<Map<string, Set<string>>> {
    const byState = new Map<string, Set<string>>();
    let from = 0;
    while (true) {
      const { data } = await sb.from(table).select("email, state_of_occurrence").not("email", "is", null).range(from, from + 999);
      if (!data || data.length === 0) break;
      for (const r of data) {
        if (!r.email || !r.state_of_occurrence) continue;
        const state = r.state_of_occurrence.toUpperCase();
        if (!byState.has(state)) byState.set(state, new Set());
        byState.get(state)!.add(r.email.toLowerCase().trim());
      }
      if (data.length < 1000) break;
      from += 1000;
    }
    return byState;
  }

  const legacyByState = await fetchKeys("legacy_submissions");
  const surveyByState = await fetchKeys("survey_submissions");
  const { data: dbStats } = await sb.from("movement_stats_by_state").select("state, is_us, total_submissions");
  const dbByState = new Map<string, number>();
  for (const r of dbStats ?? []) if (r.is_us) dbByState.set(r.state, r.total_submissions);

  console.log("Per-state: sheet ∪ legacy should match DB\n");
  console.log("State  | Sheet | Legacy | Overlap | Expected | DB  | Gap");
  console.log("─".repeat(62));
  let totSheet = 0, totLegacy = 0, totOverlap = 0, totExpected = 0, totDb = 0;
  const allStates = new Set([...sheetByState.keys(), ...legacyByState.keys(), ...dbByState.keys()]);

  for (const state of [...allStates].sort((a, b) => (dbByState.get(b) ?? 0) - (dbByState.get(a) ?? 0))) {
    const sheet = sheetByState.get(state) ?? new Set();
    const legacy = legacyByState.get(state) ?? new Set();
    const overlap = [...sheet].filter(e => legacy.has(e)).length;
    const expected = sheet.size + legacy.size - overlap;
    const db = dbByState.get(state) ?? 0;
    const gap = expected - db;
    totSheet += sheet.size; totLegacy += legacy.size; totOverlap += overlap;
    totExpected += expected; totDb += db;
    const marker = gap !== 0 ? "  ⚠" : "";
    console.log(`  ${state}  | ${String(sheet.size).padStart(5)} | ${String(legacy.size).padStart(6)} | ${String(overlap).padStart(7)} | ${String(expected).padStart(8)} | ${String(db).padStart(3)} | ${String(gap).padStart(3)}${marker}`);
  }
  console.log("─".repeat(62));
  console.log(`  TOT | ${String(totSheet).padStart(5)} | ${String(totLegacy).padStart(6)} | ${String(totOverlap).padStart(7)} | ${String(totExpected).padStart(8)} | ${String(totDb).padStart(3)} | ${String(totExpected - totDb).padStart(3)}`);
}

main().catch(console.error);
