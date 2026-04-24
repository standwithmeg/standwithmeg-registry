/**
 * One-time import: reads SWM_MASTER_LATEST.xlsx and upserts into Supabase.
 *
 * Run:  npx tsx scripts/import-master.ts
 *
 * Deduplicates by email (case-insensitive). Rows already in the DB
 * (matched by email) are skipped. New rows are inserted.
 *
 * Rows with a Submission Date + Permission go into survey_submissions.
 * Rows missing those fields (legacy) also go into survey_submissions
 * with sensible defaults so EVERYTHING lives in one table.
 */

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE env vars. Run from the website/ dir with .env.local loaded.");
  console.error("  npx tsx --env-file=.env.local scripts/import-master.ts");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Permission mapping (long text → short enum) ──────────────────
const PERMISSION_MAP: Record<string, string> = {
  "Share away! I consent to the public use of all information provided.": "public",
  "Use my quote anonymously for the project.": "anonymous",
  "Use my quote with my first name only.": "first_name",
  "For data purposes only (Do not share publicly).": "data_only",
};

function mapPermission(raw: string | null | undefined): string {
  if (!raw) return "data_only";
  const trimmed = raw.trim();
  // Try exact match first
  for (const [long, short] of Object.entries(PERMISSION_MAP)) {
    if (trimmed.startsWith(long.slice(0, 30))) return short;
  }
  // If it's already a short value, keep it
  if (["public", "anonymous", "first_name", "data_only"].includes(trimmed)) return trimmed;
  // Fallback — messy data (people typed quotes in the permission field)
  return "data_only";
}

// ── Date parsing: "Feb 10th 2026, 12:38 pm" → ISO string ────────
// Treat the xlsx clock-face time as UTC (matches the original import
// behavior — DB rows store 7:48am xlsx as 2026-02-10T07:48:00+00:00).
// This keeps dedup keys stable across re-runs.
function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/g, "$1");
    // Append " UTC" so JS parses the clock-face time as UTC instead of local.
    const d = new Date(cleaned + " UTC");
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

// ── Numeric parsing ──────────────────────────────────────────────
// Cap at $100M per fee — prevents Postgres integer-overflow errors when
// a row has a junk value like 1e29. Values above this are almost always
// typos or corrupt form data. The outlier filter in movement_stats_by_state
// already excludes anything over $5M from financial aggregates.
const MAX_FEE = 100_000_000;
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || v === "NaN") return null;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  if (isNaN(n) || n < 0) return null;
  return Math.min(n, MAX_FEE);
}

function int(v: unknown): number | null {
  const n = num(v);
  return n !== null ? Math.round(n) : null;
}

function bool(v: unknown): boolean {
  if (!v) return false;
  const s = String(v).toLowerCase();
  return s.includes("yes") || s === "true";
}

// ── Valid US states ──────────────────────────────────────────────
const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY",
]);

// ── ISO → full name normalization (matches migration 011) ────────
// Expands 2-letter country codes at import time so the dashboard
// renders human-readable country names instead of raw ISO codes.
const ISO_COUNTRY_MAP: Record<string, string> = {
  GB: "United Kingdom", UK: "United Kingdom", CA: "Canada",
  AU: "Australia", NZ: "New Zealand", IE: "Ireland",
  DE: "Germany", FR: "France", IT: "Italy", ES: "Spain",
  NL: "Netherlands", BE: "Belgium", SE: "Sweden", NO: "Norway",
  DK: "Denmark", FI: "Finland", CH: "Switzerland", AT: "Austria",
  PT: "Portugal", GR: "Greece", PL: "Poland",
  MX: "Mexico", BR: "Brazil", AR: "Argentina", CL: "Chile",
  ZA: "South Africa", BW: "Botswana",
  IN: "India", JP: "Japan", KR: "South Korea", CN: "China",
  PH: "Philippines", TH: "Thailand", VN: "Vietnam", SG: "Singapore",
  MY: "Malaysia", ID: "Indonesia",
  AE: "United Arab Emirates", IL: "Israel", TR: "Turkey",
  GG: "Guernsey", JE: "Jersey", IM: "Isle of Man",
  AS: "American Samoa (US)", UM: "US Minor Outlying Islands",
};

function normalizeCountry(raw: string): string {
  const up = raw.trim().toUpperCase();
  if (ISO_COUNTRY_MAP[up]) return ISO_COUNTRY_MAP[up];
  return raw.trim();
}

// ── Column-name fallback helper ──────────────────────────────────
// The GHL export has changed column headers over time. Old exports:
//   "OUTSITE OF THE STATES? ", "County"
// Newer exports (2026-04 onward):
//   "\xa0Are you outside of the United States?", "\xa0Enter the county where your case took place"
// Accept either by trying each candidate and returning the first non-empty.
function getCol(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const v = row[c];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v);
    }
  }
  return "";
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const filePath = process.argv[2] || "/Volumes/2023 Big 18/standwithmeg/outputs/SWM_MASTER_LATEST.xlsx";
  const dryRun   = process.argv.includes("--dry-run");
  console.log(`Reading ${filePath}...${dryRun ? "  (DRY RUN — no DB writes)" : ""}`);

  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // raw: false forces XLSX to format every cell as a string, so downstream
  // .trim() calls don't blow up on numeric or date cells.
  const rowsRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const rows = rowsRaw.map(r => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] = v === null || v === undefined ? "" : String(v);
    }
    return out;
  });
  console.log(`Found ${rows.length} rows.`);

  // Dedup policy: (email, state, system_affected, submission_minute) is the
  // unique identity.
  //  - Same email + state + system on a DIFFERENT date = NEW case (family
  //    went through a second round — a new divorce, new CPS case, etc.).
  //    Every such submission becomes its own row.
  //  - Same email + state + system at the SAME minute = the exact same form
  //    submission (page reload, form double-click) — collapse to one row.
  //  - Different state OR different system = always new row.
  //  - No-email rows (from the old pre-GHL survey) are always kept as-is.
  //    Each counts distinctly. New submissions via the current form always
  //    have an email so this won't produce duplicates going forward.
  //
  // Legacy_submissions participates in the lookup so we never duplicate a
  // legacy row.
  console.log("Fetching existing keys from DB...");

  function keyFor(
    email: string,
    state: string | null,
    country: string | null,
    system: string | null,
    dateIso: string | null,
  ): string {
    const scope = (state || country || "").trim().toUpperCase();
    const sys = (system || "").trim().toLowerCase();
    const minute = dateIso ? dateIso.slice(0, 16) : "";
    return `${email.toLowerCase().trim()}|${scope}|${sys}|${minute}`;
  }

  async function fetchExistingRows(table: string): Promise<Map<string, string>> {
    const map = new Map<string, string>(); // key → row id
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from(table)
        .select("id, email, state_of_occurrence, outside_us_country, system_affected, created_at")
        .range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      for (const r of data) {
        if (r.email) {
          map.set(
            keyFor(r.email, r.state_of_occurrence, r.outside_us_country, r.system_affected, r.created_at),
            r.id
          );
        } else {
          // No-email legacy row — key by placeholder so we don't reimport it
          const nullKey = `NOEMAIL|${r.state_of_occurrence || ""}|${r.outside_us_country || ""}|${r.system_affected || ""}|${r.created_at?.slice(0, 16) || ""}`;
          map.set(nullKey, r.id);
        }
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return map;
  }

  const surveyKeys = await fetchExistingRows("survey_submissions");
  console.log(`${surveyKeys.size} existing keys in survey_submissions.`);

  const legacyKeys = await fetchExistingRows("legacy_submissions");
  console.log(`${legacyKeys.size} existing keys in legacy_submissions.`);

  // Map columns
  const COL = {
    date:                "Submission Date",
    state:               "State of Occurrence",
    attorney:            "Attorney Fees",
    gal:                 "GAL / Child Representative Fees",
    therapy:             "Therapy/Evaluations Fees",
    reunification:       "Reunification Service Fees",
    otherFees:           "Other Court Actors Fees",
    lostWages:           "Lost Wages",
    assetLoss:           "Asset Liquidation & Property Loss",
    firstName:           "First Name",
    lastName:            "Last Name",
    permission:          "Permission to Share",
    quote:               "In one quote (1-2 sentences), describe what this system has done to you and your family.",
    caseStatus:          "Current Case Status",
    system:              "Which system affected you?",
    timeInSystem:        "How long\u00a0 \"in the system\"? ",
    custody:             "Current Custody Status",
    numKids:             "How many kids do you have?",
    proSe:               "Are you representing yourself (Pro Se)? Click one.",
    legalRep:            "Legal Representation History",
    dueProcess:          "Due Process & Fraud Checklist: (Checkboxes - Select all that apply)",
    monthsLost:          "Total Months of Lost Parenting Time (either as a child or parent)",
    milestones:          "Description of Lost Milestones (either as a child or parent)",
    email:               "Email",
    allegation:          "Primary Nature of Allegations/Intervention",
    otherDueProcess:     "Other -\u00a0Due Process & Fraud",
    otherAllegation:     "Other Allegation Details",
    conflict:            "Are you aware of any personal, professional, or financial relationships between the Judge, Attorneys, or Evaluators that were not disclosed in your case?",
    conflictDesc:        "If Yes, please briefly describe the nature of the conflict.\u00a0",
    federalFunding:      "Do you believe federal funding (Title IV-E /Adoption bonuses) influenced the direction of your case?",
    county:              "County",
    outsideUS:           "OUTSITE OF THE STATES? ",
  };

  let inserted = 0, skipped = 0, errors = 0;
  const batch: Record<string, unknown>[] = [];

  // Column-shift recovery: some rows have their fields shifted so the real
  // email lives in an unexpected column (e.g. the "conflict awareness" col).
  // If the nominal Email column doesn't contain an @, scan every column and
  // take the first value that looks like an email.
  function extractEmail(row: Record<string, string>): string {
    const nominal = (row[COL.email] || "").trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nominal)) return nominal;
    for (const v of Object.values(row)) {
      const s = String(v || "").trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s;
    }
    return "";
  }

  // Track which keys we've already processed in THIS run so exact-minute
  // dupes in the xlsx only produce one update call.
  const seenThisRun = new Set<string>();
  let updatedExisting = 0;

  for (const row of rows) {
    const email = extractEmail(row);
    // Allow no-email rows through — they're from the old pre-GHL survey
    // and should still be counted. Going forward the form requires email
    // so these won't multiply.

    const stateRaw = getCol(row, COL.state).trim().toUpperCase();
    const outsideRawOrig = getCol(
      row,
      COL.outsideUS,
      "\xa0Are you outside of the United States?",
      "Are you outside of the United States?",
    ).trim();
    const outsideRaw = normalizeCountry(outsideRawOrig);
    const isUS = VALID_STATES.has(stateRaw);
    // Junk values like "US", "" or timezone strings should not become countries
    const isInternational =
      !isUS &&
      outsideRaw.length > 0 &&
      outsideRaw !== "US" &&
      !outsideRaw.startsWith("America/") &&
      !outsideRaw.startsWith("Europe/") &&
      !outsideRaw.startsWith("http");

    const attorney = num(row[COL.attorney]);
    const gal = num(row[COL.gal]);
    const therapy = num(row[COL.therapy]);
    const reunification = num(row[COL.reunification]);
    const otherFees = num(row[COL.otherFees]);
    const lostWages = num(row[COL.lostWages]);
    const assetLoss = num(row[COL.assetLoss]);
    const totalLoss = (attorney ?? 0) + (gal ?? 0) + (therapy ?? 0) +
      (reunification ?? 0) + (otherFees ?? 0) + (lostWages ?? 0) + (assetLoss ?? 0);

    // Parse due process checklist
    const dueProcessRaw = (row[COL.dueProcess] || "").trim();
    const dueProcessArr = dueProcessRaw
      ? dueProcessRaw.split(/[,;]/).map(s => s.trim()).filter(Boolean)
      : [];

    // total_financial_loss is a GENERATED column — Postgres computes it
    // automatically from the individual fee columns. Do NOT include it.
    const record = {
      created_at: parseDate(row[COL.date]) ?? new Date("2026-01-01").toISOString(),
      state_of_occurrence: isUS ? stateRaw : null,
      outside_us_country: isInternational ? outsideRaw : null,
      // NOT NULL columns — provide defaults for messy/legacy data
      case_county: getCol(
        row,
        COL.county,
        "\xa0Enter the county where your case took place",
        "Enter the county where your case took place",
      ).trim() || "Unknown",
      case_status: (row[COL.caseStatus] || "").trim() || "Unknown",
      number_of_kids: Math.max(0, Math.min(20, int(row[COL.numKids]) ?? 0)),
      system_affected: (row[COL.system] || "").trim() || "Unknown",
      time_in_system: (row[COL.timeInSystem] || "").trim() || "Unknown",
      custody_status: (row[COL.custody] || "").trim() || "Unknown",
      is_pro_se: bool(row[COL.proSe]),
      legal_rep_history: (row[COL.legalRep] || "").trim() || "Unknown",
      allegation_type: (row[COL.allegation] || "").trim() || "Unknown",
      allegation_other_detail: (row[COL.otherAllegation] || "").trim() || null,
      due_process_checklist: dueProcessArr.length > 0 ? dueProcessArr : [],
      other_allegation_details: (row[COL.otherDueProcess] || "").trim() || null,
      conflict_of_interest_awareness: (row[COL.conflict] || "").trim() || "Unsure",
      conflict_description: (row[COL.conflictDesc] || "").trim() || null,
      federal_funding_influence: (row[COL.federalFunding] || "").trim() || "Unsure",
      months_lost_parenting_time: int(row[COL.monthsLost]),
      lost_milestones_description: (row[COL.milestones] || "").trim() || null,
      attorney_fees: attorney,
      gal_fees: gal,
      therapy_eval_fees: therapy,
      reunification_fees: reunification,
      other_court_actors_fees: otherFees,
      lost_wages: lostWages,
      asset_liquidation_loss: assetLoss,
      // NOT NULL columns — required for all rows
      impact_quote: (row[COL.quote] || "").trim() || "(No quote provided)",
      permission_to_share: mapPermission(row[COL.permission]),
      first_name: (row[COL.firstName] || "").trim() || "Unknown",
      last_name: (row[COL.lastName] || "").trim() || "Unknown",
      email,
      approved: false,
      ip_hash: "imported_from_master_xlsx",
    };

    // Skip rows without a state or country
    if (!record.state_of_occurrence && !record.outside_us_country) {
      skipped++;
      continue;
    }

    // Dedup key: (email, state-or-country, system_affected, minute). Decide:
    //  1. No email? Always treat as a new row. Old pre-GHL rows have no
    //     email and should each count. Skip dedup.
    //  2. Already processed in this run at the exact same minute → collapse
    //     (form reload or double-click, not a real new case).
    //  3. Already in survey_submissions for that key → UPDATE.
    //  4. Already in legacy_submissions → skip.
    //  5. New → INSERT.
    if (!email) {
      // No-email rows go to legacy_submissions (email is NOT NULL in
      // survey_submissions). Legacy schema accepts anonymous historical
      // entries. Dedup is by (null, state, system, minute) within the
      // legacy table so we don't reimport the same row every run.
      const legacyKey = `NOEMAIL|${record.state_of_occurrence || ""}|${record.outside_us_country || ""}|${record.system_affected || ""}|${record.created_at?.slice(0, 16) || ""}`;
      if (seenThisRun.has(legacyKey) || legacyKeys.has(legacyKey)) {
        skipped++;
        continue;
      }
      seenThisRun.add(legacyKey);

      // Build a legacy row (simpler schema — most fields nullable).
      const legacyRow = {
        created_at: record.created_at,
        state_of_occurrence: record.state_of_occurrence,
        outside_us_country: record.outside_us_country,
        case_county: record.case_county,
        case_status: record.case_status,
        number_of_kids: record.number_of_kids,
        system_affected: record.system_affected,
        time_in_system: record.time_in_system,
        custody_status: record.custody_status,
        is_pro_se: record.is_pro_se ? "Yes" : "No",
        legal_rep_history: record.legal_rep_history,
        allegation_type: record.allegation_type,
        months_lost_parenting_time: record.months_lost_parenting_time,
        attorney_fees: record.attorney_fees,
        gal_fees: record.gal_fees,
        therapy_eval_fees: record.therapy_eval_fees,
        reunification_fees: record.reunification_fees,
        other_court_actors_fees: record.other_court_actors_fees,
        lost_wages: record.lost_wages,
        asset_liquidation_loss: record.asset_liquidation_loss,
        first_name: record.first_name === "Unknown" ? null : record.first_name,
        last_name: record.last_name === "Unknown" ? null : record.last_name,
        email: null,
        data_source: "legacy_v1",
      };

      if (dryRun) {
        inserted++;
        continue;
      }
      const { error } = await supabase.from("legacy_submissions").insert(legacyRow);
      if (error) { errors++; } else { inserted++; }
      continue;
    }

    const key = keyFor(
      email,
      record.state_of_occurrence,
      record.outside_us_country,
      record.system_affected,
      record.created_at,
    );

    if (seenThisRun.has(key)) {
      // Exact-same-minute dupe within the xlsx → collapse.
      skipped++;
      continue;
    }
    seenThisRun.add(key);

    if (legacyKeys.has(key)) {
      // Historical row owns this (email, state). Don't duplicate into survey.
      skipped++;
      continue;
    }

    const existingId = surveyKeys.get(key);
    if (existingId) {
      // Update in place — family re-submitted with newer info. Overwrite.
      // CRITICAL: never touch approved or ip_hash — those are set by
      // admin workflow and shouldn't reset on re-import.
      const { approved: _a, ip_hash: _i, ...updateFields } = record;
      void _a; void _i;
      if (dryRun) {
        updatedExisting++;
        continue;
      }
      const { error } = await supabase.from("survey_submissions")
        .update(updateFields).eq("id", existingId);
      if (error) {
        console.error(`Update error for ${email}:`, error.message);
        errors++;
      } else {
        updatedExisting++;
      }
      continue;
    }

    // New row — batch insert
    if (dryRun) {
      console.log(
        `  NEW: ${email.padEnd(38)} | ${(record.state_of_occurrence || record.outside_us_country || "?").toString().padEnd(10)} | ${record.first_name} ${record.last_name} | ${(record.system_affected || "").slice(0, 28).padEnd(28)} | ${record.created_at?.slice(0, 10)}`
      );
    }
    batch.push(record);

    if (batch.length >= 100) {
      if (dryRun) {
        inserted += batch.length;
      } else {
        const { error } = await supabase.from("survey_submissions").insert(batch);
        if (error) {
          console.error(`Batch insert error:`, error.message);
          errors += batch.length;
        } else {
          inserted += batch.length;
        }
      }
      batch.length = 0;
      process.stdout.write(`\r  Inserted: ${inserted}, Updated: ${updatedExisting}, Skipped: ${skipped}, Errors: ${errors}`);
    }
  }

  if (batch.length > 0) {
    if (dryRun) {
      inserted += batch.length;
    } else {
      const { error } = await supabase.from("survey_submissions").insert(batch);
      if (error) {
        console.error(`Final batch error:`, error.message);
        errors += batch.length;
      } else {
        inserted += batch.length;
      }
    }
  }

  console.log(`\n\nDone!`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated existing: ${updatedExisting}`);
  console.log(`  Skipped (dupe/invalid): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  // Verify total
  const { count } = await supabase
    .from("survey_submissions")
    .select("id", { count: "exact", head: true });
  console.log(`  Total survey_submissions now: ${count}`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
