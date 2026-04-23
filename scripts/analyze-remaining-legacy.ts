import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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

async function main() {
  const wb = XLSX.readFile("/Volumes/2023 Big 18/standwithmeg/outputs/SWM_MASTER_LATEST.xlsx");
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const sheetEmails = new Set<string>();
  for (const r of rows) {
    const e = getEmail(r);
    if (e.includes("@")) sheetEmails.add(e);
  }

  const { data: legacy } = await sb.from("legacy_submissions")
    .select("email, state_of_occurrence, data_source").limit(500);

  let notInSheet = 0, inSheet = 0, noState = 0, noEmail = 0;
  const stateBreakdown = new Map<string, number>();
  for (const r of legacy ?? []) {
    if (!r.state_of_occurrence) { noState++; continue; }
    if (!r.email) { noEmail++; stateBreakdown.set(r.state_of_occurrence, (stateBreakdown.get(r.state_of_occurrence) ?? 0) + 1); continue; }
    const e = r.email.toLowerCase().trim();
    if (sheetEmails.has(e)) inSheet++;
    else {
      notInSheet++;
      stateBreakdown.set(r.state_of_occurrence, (stateBreakdown.get(r.state_of_occurrence) ?? 0) + 1);
    }
  }

  console.log(`Legacy rows STILL THERE after dedup:`);
  console.log(`  no state:              ${noState}`);
  console.log(`  null email:            ${noEmail}   (genuine anonymous historical rows)`);
  console.log(`  email NOT in sheet:    ${notInSheet}`);
  console.log(`  email IS in sheet:     ${inSheet}   (these should have been deleted)`);
  console.log(`\nTop legacy-only states (not in sheet):`);
  for (const [state, n] of [...stateBreakdown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${state}: ${n}`);
  }
}
main().catch(console.error);
