import { loadEnvConfig } from "@next/env";
import { writeFile } from "fs/promises";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

type SurveyRow = {
  state_of_occurrence: string | null;
  case_county: string | null;
  due_process_checklist: string[] | null;
  custody_status: string | null;
  is_pro_se: boolean | null;
  months_lost_parenting_time: number | null;
  total_financial_loss: number | null;
};

type Actor = {
  role: string;
  name: string;
  state_code: string | null;
  location_key: string | null;
  family_count: number;
  at_threshold: boolean;
};

function fmtPct(num: number, denom: number): string {
  return denom === 0 ? "0%" : ((num / denom) * 100).toFixed(1) + "%";
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "$0";
  return "$" + Math.round(n).toLocaleString();
}

function cleanItem(value: string): string | null {
  if (!value) return null;
  const v = value.trim().replace(/^["']+|["']+$/g, "").trim();
  if (!v) return null;
  if (v.includes("@")) return null;
  if (v.length > 120) return null;
  if (/^\d+$/.test(v)) return null;
  return v;
}

function normalizeCounty(county: string): string {
  return county
    .trim()
    .replace(/\s+county\s*$/i, "")
    .replace(/\s+parish\s*$/i, "")
    .trim()
    .toLowerCase();
}

function getFederalDistrict(state: string, county: string): string {
  const c = normalizeCounty(county);
  // Manual mapping for the densest / most relevant counties.
  const map: Record<string, string> = {
    "CA|san diego": "Southern District of California",
    "CA|riverside": "Central District of California",
    "CA|los angeles": "Central District of California",
    "CA|sacramento": "Eastern District of California",
    "CA|san bernardino": "Central District of California",
    "CA|orange": "Central District of California",
    "CA|santa barbara": "Central District of California",
    "CA|tulare": "Eastern District of California",
    "TX|denton": "Northern District of Texas",
    "TX|harris": "Southern District of Texas",
    "TX|dallas": "Northern District of Texas",
    "TX|tarrant": "Northern District of Texas",
    "TX|bexar": "Western District of Texas",
    "TX|travis": "Western District of Texas",
    "FL|okaloosa": "Northern District of Florida",
    "FL|collier": "Middle District of Florida",
    "FL|broward": "Southern District of Florida",
    "FL|volusia": "Middle District of Florida",
    "FL|leon": "Northern District of Florida",
    "FL|miami-dade": "Southern District of Florida",
    "FL|palm beach": "Southern District of Florida",
    "FL|hillsborough": "Middle District of Florida",
    "FL|orange": "Middle District of Florida",
    "OH|summit": "Northern District of Ohio",
    "OH|licking": "Southern District of Ohio",
    "OH|hamilton": "Southern District of Ohio",
    "OH|guernsey": "Southern District of Ohio",
    "OH|cuyahoga": "Northern District of Ohio",
    "OH|franklin": "Southern District of Ohio",
    "OH|montgomery": "Southern District of Ohio",
    "OK|oklahoma": "Western District of Oklahoma",
    "OK|tulsa": "Northern District of Oklahoma",
    "OK|wagoner": "Northern District of Oklahoma",
    "OK|cleveland": "Western District of Oklahoma",
    "NC|cumberland": "Eastern District of North Carolina",
    "NC|wake": "Eastern District of North Carolina",
    "NC|burke": "Western District of North Carolina",
    "NC|mecklenburg": "Western District of North Carolina",
    "NC|guilford": "Middle District of North Carolina",
    "KS|johnson": "District of Kansas",
    "KS|miami": "District of Kansas",
    "KS|sedgwick": "District of Kansas",
    "KS|wyandotte": "District of Kansas",
    "MO|jasper": "Western District of Missouri",
    "MO|jackson": "Western District of Missouri",
    "MO|st. louis": "Eastern District of Missouri",
    "MO|greene": "Western District of Missouri",
    "IL|will": "Northern District of Illinois",
    "IL|cook": "Northern District of Illinois",
    "IL|dupage": "Northern District of Illinois",
    "IL|lake": "Northern District of Illinois",
    "IL|st. clair": "Southern District of Illinois",
    "WA|pierce": "Western District of Washington",
    "WA|king": "Western District of Washington",
    "WA|snohomish": "Western District of Washington",
    "WA|spokane": "Eastern District of Washington",
    "IN|elkhart": "Northern District of Indiana",
    "IN|marion": "Southern District of Indiana",
    "IN|lake": "Northern District of Indiana",
    "IN|hamilton": "Southern District of Indiana",
    "MA|middlesex": "District of Massachusetts",
    "MA|suffolk": "District of Massachusetts",
    "MA|worcester": "District of Massachusetts",
    "MA|essex": "District of Massachusetts",
    "NY|erie": "Western District of New York",
    "NY|suffolk": "Eastern District of New York",
    "NY|nassau": "Eastern District of New York",
    "NY|monroe": "Western District of New York",
    "NY|new york": "Southern District of New York",
    "NY|bronx": "Southern District of New York",
    "NY|kings": "Eastern District of New York",
    "NY|queens": "Eastern District of New York",
    "PA|blair": "Western District of Pennsylvania",
    "PA|philadelphia": "Eastern District of Pennsylvania",
    "PA|allegheny": "Western District of Pennsylvania",
    "PA|montgomery": "Eastern District of Pennsylvania",
    "AZ|maricopa": "District of Arizona",
    "AZ|pima": "District of Arizona",
    "CO|el paso": "District of Colorado",
    "CO|denver": "District of Colorado",
    "CO|arapahoe": "District of Colorado",
    "CO|jefferson": "District of Colorado",
    "VA|chesterfield": "Eastern District of Virginia",
    "VA|fairfax": "Eastern District of Virginia",
    "VA|prince william": "Eastern District of Virginia",
    "VA|virginia beach": "Eastern District of Virginia",
    "VA|loudoun": "Eastern District of Virginia",
    "RI|providence": "District of Rhode Island",
    "MS|lamar": "Southern District of Mississippi",
    "NJ|morris": "District of New Jersey",
    "DE|new castle": "District of Delaware",
    "HI|honolulu": "District of Hawaii",
    "UT|weber": "District of Utah",
    "UT|salt lake": "District of Utah",
    "NM|bernalillo": "District of New Mexico",
    "KY|kenton": "Eastern District of Kentucky",
    "KY|jefferson": "Western District of Kentucky",
    "TN|shelby": "Western District of Tennessee",
    "TN|davidson": "Middle District of Tennessee",
    "TN|knox": "Eastern District of Tennessee",
    "TN|hamilton": "Eastern District of Tennessee",
    "AL|jefferson": "Northern District of Alabama",
    "AL|mobile": "Southern District of Alabama",
    "AL|montgomery": "Middle District of Alabama",
    "SC|greenville": "District of South Carolina",
    "SC|richland": "District of South Carolina",
    "GA|fulton": "Northern District of Georgia",
    "GA|gwinnett": "Northern District of Georgia",
    "GA|cobb": "Northern District of Georgia",
    "GA|dekalb": "Northern District of Georgia",
    "GA|chatham": "Southern District of Georgia",
    "OH|hancock": "Northern District of Ohio",
    "OH|franklin": "Southern District of Ohio",
    "OH|cuyahoga": "Northern District of Ohio",
    "OH|montgomery": "Southern District of Ohio",
    "AL|baldwin": "Southern District of Alabama",
    "AL|jefferson": "Northern District of Alabama",
    "AL|mobile": "Southern District of Alabama",
    "IA|wapello": "Southern District of Iowa",
    "IA|polk": "Southern District of Iowa",
    "TX|collin": "Eastern District of Texas",
    "TX|dallas": "Northern District of Texas",
    "TX|tarrant": "Northern District of Texas",
    "TX|bexar": "Western District of Texas",
    "TX|travis": "Western District of Texas",
    "FL|miami-dade": "Southern District of Florida",
    "FL|palm beach": "Southern District of Florida",
    "FL|hillsborough": "Middle District of Florida",
    "MI|wayne": "Eastern District of Michigan",
    "MI|oakland": "Eastern District of Michigan",
    "MI|kent": "Western District of Michigan",
    "MI|macomb": "Eastern District of Michigan",
    "IA|polk": "Southern District of Iowa",
    "MN|hennepin": "District of Minnesota",
    "NV|clark": "District of Nevada",
    "MD|baltimore": "District of Maryland",
    "OR|multnomah": "District of Oregon",
    "ME|cumberland": "District of Maine",
  };

  const exact = map[`${state}|${c}`];
  if (exact) return exact;

  // State-level fallback.
  const stateDefault: Record<string, string> = {
    CA: "Northern / Eastern / Central / Southern",
    TX: "Northern / Southern / Eastern / Western",
    FL: "Northern / Middle / Southern",
    OH: "Northern / Southern",
    KS: "District of Kansas",
    NC: "Eastern / Middle / Western",
    MO: "Eastern / Western",
    NY: "Northern / Southern / Eastern / Western",
    MI: "Eastern / Western",
    OK: "Northern / Eastern / Western",
    IN: "Northern / Southern",
    GA: "Northern / Middle / Southern",
    PA: "Eastern / Middle / Western",
    IL: "Northern / Central / Southern",
    WA: "Eastern / Western",
    VA: "Eastern / Western",
    TN: "Eastern / Middle / Western",
    AL: "Northern / Middle / Southern",
    CO: "District of Colorado",
    MA: "District of Massachusetts",
    SC: "District of South Carolina",
    IA: "Northern / Southern",
    MN: "District of Minnesota",
    NV: "District of Nevada",
    MD: "District of Maryland",
    OR: "District of Oregon",
    ME: "District of Maine",
    NJ: "District of New Jersey",
    DE: "District of Delaware",
    HI: "District of Hawaii",
    ID: "District of Idaho",
    MT: "District of Montana",
    UT: "District of Utah",
    NM: "District of New Mexico",
    KY: "Eastern / Western",
    LA: "Eastern / Middle / Western",
    AR: "Eastern / Western",
    AZ: "District of Arizona",
    AK: "District of Alaska",
    CT: "District of Connecticut",
    DC: "District of Columbia",
    NE: "District of Nebraska",
    NH: "District of New Hampshire",
    ND: "District of North Dakota",
    RI: "District of Rhode Island",
    SD: "District of South Dakota",
    VT: "District of Vermont",
    WV: "Northern / Southern",
    WY: "District of Wyoming",
  };
  return stateDefault[state] || `${state} (district unknown)`;
}

async function fetchAllSurveyRows(adminSupabase: ReturnType<typeof createAdminSupabaseClient>): Promise<SurveyRow[]> {
  const pageSize = 1000;
  const select = [
    "state_of_occurrence",
    "case_county",
    "due_process_checklist",
    "custody_status",
    "is_pro_se",
    "months_lost_parenting_time",
    "total_financial_loss",
  ].join(",");

  const { count, error: countError } = await adminSupabase
    .from("survey_submissions")
    .select("id", { count: "exact", head: true });
  if (countError) throw countError;
  const total = count ?? 0;

  const pages: SurveyRow[][] = [];
  for (let start = 0; start < total; start += pageSize) {
    const { data, error } = await adminSupabase
      .from("survey_submissions")
      .select(select)
      .range(start, start + pageSize - 1);
    if (error) throw error;
    pages.push((data ?? []) as SurveyRow[]);
  }
  return pages.flat();
}

const TOP_VIOLATIONS = [
  "Evidence was suppressed or ignored by the Judge",
  "Perjury/False testimony by case workers or officials",
  "Denial of a timely hearing (constitutional violations)",
  "Ex-parte communications (Judge spoke to other side without me)",
  "Tampering with court transcripts or records",
  "Unconstitutional Gag Orders (Preventing me from speaking out)",
  "No Due Process",
];

function mainViolationSet(row: SurveyRow): Set<string> {
  const set = new Set<string>();
  if (Array.isArray(row.due_process_checklist)) {
    for (const raw of row.due_process_checklist) {
      const cleaned = cleanItem(raw);
      if (!cleaned) continue;
      for (const v of TOP_VIOLATIONS) {
        if (cleaned.toLowerCase().includes(v.toLowerCase())) {
          set.add(v);
        }
      }
    }
  }
  return set;
}

async function main() {
  const adminSupabase = createAdminSupabaseClient();

  const [surveyRows, actorsRes] = await Promise.all([
    fetchAllSurveyRows(adminSupabase),
    fetch("https://my.standwithmeg.com/api/actors/all").then(r => r.json()),
  ]);

  const actors: Actor[] = actorsRes.actors ?? [];
  const rawTotal = surveyRows.length;

  // === Overall due-process violation rates ===
  const overallCounts = new Map<string, number>();
  let totalMainViolations = 0;
  let rowsWithAnyMainViolation = 0;
  let rowsWithThreePlus = 0;
  for (const row of surveyRows) {
    const set = mainViolationSet(row);
    if (set.size > 0) rowsWithAnyMainViolation += 1;
    if (set.size >= 3) rowsWithThreePlus += 1;
    totalMainViolations += set.size;
    for (const v of set) {
      overallCounts.set(v, (overallCounts.get(v) ?? 0) + 1);
    }
  }

  // === State-level analysis ===
  const stateRows = new Map<string, SurveyRow[]>();
  for (const row of surveyRows) {
    const st = row.state_of_occurrence;
    if (!st) continue;
    if (!stateRows.has(st)) stateRows.set(st, []);
    stateRows.get(st)!.push(row);
  }

  const stateAnalysis = Array.from(stateRows.entries())
    .filter(([_, rows]) => rows.length >= 30)
    .map(([state, rows]) => {
      const total = rows.length;
      const proSe = rows.filter(r => r.is_pro_se).length;
      const FINANCIAL_CAP = 5_000_000;
      const MONTHS_CAP = 600;
      const cappedLosses = rows
        .map(r => Math.min(r.total_financial_loss ?? 0, FINANCIAL_CAP))
        .filter(v => v > 0);
      const avgLoss = cappedLosses.length
        ? cappedLosses.reduce((sum, v) => sum + v, 0) / cappedLosses.length
        : 0;
      const cappedMonths = rows
        .map(r => Math.min(r.months_lost_parenting_time ?? 0, MONTHS_CAP))
        .filter(v => v > 0);
      const avgMonths = cappedMonths.length
        ? cappedMonths.reduce((sum, v) => sum + v, 0) / cappedMonths.length
        : 0;

      const violationCounts = new Map<string, number>();
      let anyViolation = 0;
      let threePlus = 0;
      for (const row of rows) {
        const set = mainViolationSet(row);
        if (set.size > 0) anyViolation += 1;
        if (set.size >= 3) threePlus += 1;
        for (const v of set) violationCounts.set(v, (violationCounts.get(v) ?? 0) + 1);
      }

      return {
        state,
        total,
        proSe,
        avgLoss,
        avgMonths,
        anyViolation,
        threePlus,
        violationCounts,
        density: total > 0 ? Array.from(violationCounts.values()).reduce((a, b) => a + b, 0) / total : 0,
      };
    })
    .sort((a, b) => b.density - a.density || b.anyViolation - a.anyViolation);

  // === County hotspots ===
  const countyKeyRows = new Map<string, { state: string; county: string; rows: SurveyRow[] }>();
  for (const row of surveyRows) {
    const state = row.state_of_occurrence;
    const county = row.case_county?.trim();
    if (!state || !county) continue;
    const key = `${state}|${normalizeCounty(county)}`;
    const entry = countyKeyRows.get(key) ?? { state, county, rows: [] };
    entry.rows.push(row);
    countyKeyRows.set(key, entry);
  }

  const countyAnalysis = Array.from(countyKeyRows.values())
    .filter(c => c.rows.length >= 5 && c.county.toLowerCase() !== "unknown" && c.county.toLowerCase() !== "unsure")
    .map(c => {
      const total = c.rows.length;
      const setCounts = new Map<string, number>();
      let any = 0;
      for (const row of c.rows) {
        const set = mainViolationSet(row);
        if (set.size > 0) any += 1;
        for (const v of set) setCounts.set(v, (setCounts.get(v) ?? 0) + 1);
      }
      const topViolation = Array.from(setCounts.entries()).sort((a, b) => b[1] - a[1])[0];
      return {
        ...c,
        total,
        any,
        topViolation: topViolation ? `${topViolation[0]} (${fmtPct(topViolation[1], total)})` : "—",
        district: getFederalDistrict(c.state, c.county),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 30);

  // === Top public judges by state for high-violation states ===
  const actorsByState = new Map<string, Actor[]>();
  for (const a of actors) {
    const state = a.state_code ?? a.location_key ?? "Unknown";
    if (!actorsByState.has(state)) actorsByState.set(state, []);
    actorsByState.get(state)!.push(a);
  }

  // === Build memo ===
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Civil-Rights Pattern & Federal-District Mapping Memo — Stand With Meg Data`);
  lines.push(`**Prepared for:** Shawn Lee  `);
  lines.push(`**Date:** ${date}  `);
  lines.push(`**Source:** Stand With Meg survey submissions (${rawTotal.toLocaleString()} raw rows) + public court-actor registry`);
  lines.push(`**Scope:** Aggregate data only. No PII, submission IDs, or family notes are reproduced.`);
  lines.push("");

  lines.push(`## Executive Summary`);
  lines.push(`- **${rowsWithAnyMainViolation.toLocaleString()} of ${rawTotal.toLocaleString()} submissions (${fmtPct(rowsWithAnyMainViolation, rawTotal)})** report at least one core due-process/fraud violation.`);
  lines.push(`- **${rowsWithThreePlus.toLocaleString()} submissions (${fmtPct(rowsWithThreePlus, rawTotal)})** report **3 or more** of those violations in the same case.`);
  lines.push(`- The most common violations are **suppressed evidence** (${fmtPct(overallCounts.get("Evidence was suppressed or ignored by the Judge") ?? 0, rawTotal)}), **perjury/false testimony** (${fmtPct(overallCounts.get("Perjury/False testimony by case workers or officials") ?? 0, rawTotal)}), and **denial of a timely hearing** (${fmtPct(overallCounts.get("Denial of a timely hearing (constitutional violations)") ?? 0, rawTotal)}).`);
  lines.push(`- Violations are not evenly distributed. Several states show 80%+ of submissions alleging at least one core violation, and 40%+ alleging three or more.`);
  lines.push(`- Federal-district mapping shows the densest cases fall into a **manageable number of districts**, which matters for any future MDL or § 1983 pattern litigation.`);
  lines.push(`- **Bottom line:** The data supports a civil-rights “pattern or practice” theory in specific states/districts far more than it supports a single national MDL at this stage.`);
  lines.push("");

  lines.push(`## 1. Core Due-Process / Fraud Violations — National Rates`);
  lines.push(`These seven items were selected because they map cleanly to constitutional due-process and federal fraud concepts.`);
  lines.push(`| Violation | Submissions | % of all submissions |`);
  lines.push(`|---|---|---|`);
  for (const v of TOP_VIOLATIONS) {
    const count = overallCounts.get(v) ?? 0;
    lines.push(`| ${v} | ${count.toLocaleString()} | ${fmtPct(count, rawTotal)} |`);
  }
  lines.push("");
  lines.push(`- **Submissions with ≥1 core violation:** ${rowsWithAnyMainViolation.toLocaleString()} (${fmtPct(rowsWithAnyMainViolation, rawTotal)})`);
  lines.push(`- **Submissions with ≥3 core violations:** ${rowsWithThreePlus.toLocaleString()} (${fmtPct(rowsWithThreePlus, rawTotal)})`);
  lines.push(`- **Average core violations per submission (all submissions):** ${(totalMainViolations / rawTotal).toFixed(2)}`);
  lines.push("");

  lines.push(`## 2. State-Level Civil-Rights Hotspots`);
  lines.push(`States with 30+ submissions, ranked by “violation density” (average number of core violations per submission).`);
  lines.push(`| State | Submissions | ≥1 Violation | ≥3 Violations | Violation Density | Pro Se | Avg Loss | Avg Months Lost |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const s of stateAnalysis.slice(0, 20)) {
    lines.push(
      `| ${s.state} | ${s.total} | ${fmtPct(s.anyViolation, s.total)} | ${fmtPct(s.threePlus, s.total)} | ${s.density.toFixed(2)} | ${fmtPct(s.proSe, s.total)} | ${fmtMoney(s.avgLoss)} | ${s.avgMonths.toFixed(1)} |`
    );
  }
  lines.push("");

  lines.push(`### State-level violation breakdown (top 10 states by density)`);
  lines.push(`Rows = states, columns = % of submissions in that state alleging each violation.`);
  lines.push(`| State | ${TOP_VIOLATIONS.map(v => v.split(" ").slice(0, 3).join(" ")).join(" | ")} |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const s of stateAnalysis.slice(0, 10)) {
    const cells = TOP_VIOLATIONS.map(v => fmtPct(s.violationCounts.get(v) ?? 0, s.total));
    lines.push(`| ${s.state} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  lines.push(`### Top public actors in the highest-violation states`);
  lines.push(`These are the most-named court actors in the 10 states with the highest violation density.`);
  for (const s of stateAnalysis.slice(0, 10)) {
    const stateActors = (actorsByState.get(s.state) ?? [])
      .filter(a => a.at_threshold)
      .sort((a, b) => b.family_count - a.family_count)
      .slice(0, 5);
    if (stateActors.length === 0) continue;
    lines.push(`\n**${s.state}** (${fmtPct(s.anyViolation, s.total)} ≥1 violation, density ${s.density.toFixed(2)})`);
    lines.push(`| Actor | Role | Families |`);
    lines.push(`|---|---|---|`);
    for (const a of stateActors) {
      lines.push(`| ${a.name} | ${a.role} | ${a.family_count} |`);
    }
  }
  lines.push("");

  lines.push(`## 3. County Hotspots + Federal District Mapping`);
  lines.push(`Counties with 5+ known submissions, excluding “Unknown/Unsure.” Each is mapped to its United States District Court. This is the practical footprint for any federal filing strategy.`);
  lines.push(`| County | State | Federal District | Submissions | ≥1 Violation | Top Violation in County |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const c of countyAnalysis) {
    lines.push(`| ${c.county} | ${c.state} | ${c.district} | ${c.total} | ${fmtPct(c.any, c.total)} | ${c.topViolation} |`);
  }
  lines.push("");

  lines.push(`### Federal district summary by state`);
  lines.push(`For states where the exact county is unknown, this shows the federal districts that cover the state.`);
  lines.push(`| State | Federal District(s) | Submissions in Dataset |`);
  lines.push(`|---|---|---|`);
  for (const [state, rows] of Array.from(stateRows.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 25)) {
    lines.push(`| ${state} | ${getFederalDistrict(state, "unknown")} | ${rows.length} |`);
  }
  lines.push("");

  lines.push(`## 4. What This Means for Strategy`);
  lines.push(`### For a § 1983 / civil-rights pattern case`);
  lines.push(`The strongest path is **state-specific or district-specific**, not national. Look at the states where ≥80% of submissions allege a core violation and the same judges/GALs appear repeatedly. Those are the courts where a “custom or usage” of denying due process may be demonstrable.`);
  lines.push("");
  lines.push(`### For an MDL`);
  lines.push(`An MDL under 28 U.S.C. § 1407 requires:**`);
  lines.push(`- **Civil actions** in **multiple federal districts**;`);
  lines.push(`- **Common questions of fact**; and`);
  lines.push(`- A showing that transfer will serve convenience and justice.`);
  lines.push("");
  lines.push(`This data shows the *multi-district* element is present (the top states span many districts), but the *common defendant* element is weak. The repeat actors are usually **individual state judges, GALs, and attorneys**, not a single national defendant.`);
  lines.push("");
  lines.push(`**Possible MDL-like hooks to investigate further:**`);
  lines.push(`1. **A common court-appointed services vendor** that operates in multiple districts (e.g., a reunification-therapy provider chain, a supervised-visitation company, or a custody-evaluation firm).`);
  lines.push(`2. **A federally funded program** (Title IV-D, Medicaid, foster-care funding) that creates financial incentives across state lines.`);
  lines.push(`3. **A common software or record-keeping system** used by multiple family courts, if that system facilitates the due-process violations.`);
  lines.push("");
  lines.push(`### For the DOJ fraud petition`);
  lines.push(`The DOJ path does not require a single defendant. The petition can ask the National Fraud Enforcement Division to look at **repeat professionals billing federally connected programs** in the hotspots above. The county/district table gives them a starting map.`);
  lines.push("");

  lines.push(`## 5. Recommended Next Steps`);
  lines.push(`1. **Pick 3–5 high-density states** from Section 2 and pull redacted case packets for families who named the top public actors there.`);
  lines.push(`2. **Cross-reference the top public actors** with state licensing boards, court-appointment rosters, and any Medicaid provider numbers.`);
  lines.push(`3. **Confirm federal districts** with local counsel in the top counties; the manual mapping above is a starting point, not filing advice.`);
  lines.push(`4. **Draft a state-specific complaint template** for one high-density district (e.g., Kansas, Indiana, or Alabama) to test whether the pattern holds in a single federal case before considering broader coordination.`);
  lines.push("");

  lines.push(`---`);
  lines.push(`*This memo is based on aggregate survey and registry data. It is not legal advice and does not allege that any specific individual or court has committed misconduct.*`);

  const memo = lines.join("\n");
  const filename = `content/shawn-civil-rights-districts-memo-${date}.md`;
  await writeFile(filename, memo, "utf-8");
  console.log(`Wrote ${filename}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
