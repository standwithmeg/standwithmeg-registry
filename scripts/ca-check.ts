import * as XLSX from "xlsx";
const wb = XLSX.readFile("/Volumes/2023 Big 18/standwithmeg/outputs/SWM_MASTER_LATEST.xlsx");
const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });

const caRows = rows.filter(r => (r["State of Occurrence"] || "").trim() === "CA");
console.log(`Total CA rows in sheet: ${caRows.length}`);

const byEmail = new Map<string, number>();
for (const r of caRows) {
  let email = (r["Email"] || "").trim().toLowerCase();
  if (!email.includes("@")) {
    for (const v of Object.values(r)) {
      const s = String(v || "").trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) { email = s; break; }
    }
  }
  if (!email.includes("@")) email = "(NO EMAIL)";
  byEmail.set(email, (byEmail.get(email) ?? 0) + 1);
}

const dupes = [...byEmail.entries()].filter(([_, c]) => c > 1);
console.log(`\nCA emails submitted multiple times: ${dupes.length}`);
for (const [e, c] of dupes.slice(0, 15)) console.log(`  ${e}: ${c}x`);

const noEmail = byEmail.get("(NO EMAIL)") ?? 0;
console.log(`\nCA rows with no extractable email: ${noEmail}`);
console.log(`Unique CA emails: ${byEmail.size}`);
