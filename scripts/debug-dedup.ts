/**
 * Diagnose why (email, date) dedup didn't match between the DB and the xlsx.
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/g, "$1");
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch { return null; }
}

async function main() {
  // Read a few rows from xlsx
  const wb = XLSX.readFile("/Volumes/2023 Big 18/standwithmeg/outputs/SWM_MASTER_LATEST.xlsx");
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });

  // Pick 5 rows with emails
  const samples = rows.filter(r => (r["Email"] || "").trim()).slice(0, 5);

  for (const r of samples) {
    const email = r["Email"].toLowerCase().trim();
    const rawDate = r["Submission Date"];
    const parsed = parseDate(rawDate);

    // Look up this email in the DB
    const { data } = await sb.from("survey_submissions")
      .select("email, created_at")
      .eq("email", email);

    console.log(`\nEmail:  ${email}`);
    console.log(`  xlsx raw date:      "${rawDate}"`);
    console.log(`  xlsx parsed ISO:    ${parsed}`);
    console.log(`  xlsx key (slice16): ${parsed?.slice(0, 16)}`);
    console.log(`  DB rows found:      ${data?.length ?? 0}`);
    for (const row of (data ?? [])) {
      console.log(`    DB created_at:    ${row.created_at}`);
      console.log(`    DB key (slice16): ${row.created_at?.slice(0, 16)}`);
    }
  }
}

main().catch(console.error);
