import * as XLSX from "xlsx";

const wb = XLSX.readFile("/Volumes/2023 Big 18/standwithmeg/outputs/SWM_MASTER_LATEST.xlsx");
const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });

console.log("Column headers (raw):");
for (const col of Object.keys(rows[0])) {
  console.log(`  "${col}"`);
}

// Inspect the rows that returned odd "email" values
// Show the FIRST 3 rows so we can see what's in Email field
for (let i = 0; i < 3; i++) {
  const r = rows[i];
  console.log(`\n─── Row ${i} ───`);
  console.log(`  Email:                "${r["Email"]}"`);
  console.log(`  First Name:           "${r["First Name"]}"`);
  console.log(`  State:                "${r["State of Occurrence"]}"`);
  console.log(`  County:               "${r["County"]}"`);
  console.log(`  Submission Date:      "${r["Submission Date"]}"`);
  // Show ALL fields whose values look like emails
  for (const [k, v] of Object.entries(r)) {
    if (String(v).includes("@")) {
      console.log(`  [email in col "${k.slice(0, 50)}"]: "${v}"`);
    }
  }
}
