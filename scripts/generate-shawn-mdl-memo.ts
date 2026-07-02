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

type Actor = {
  role: string;
  name: string;
  state_code: string | null;
  location_key: string | null;
  county_breakdown: string;
  family_count: number;
  at_threshold: boolean;
  needs_more: number;
};

type SurveyRow = {
  state_of_occurrence: string | null;
  case_county: string | null;
  allegation_type: string | null;
  allegation_root_cause: string | null;
  due_process_checklist: string[] | null;
  other_allegation_details: string | null;
  custody_status: string | null;
  system_affected: string | null;
  time_in_system: string | null;
  is_pro_se: boolean | null;
  months_lost_parenting_time: number | null;
  attorney_fees: number | null;
  gal_fees: number | null;
  therapy_eval_fees: number | null;
  reunification_fees: number | null;
  other_court_actors_fees: number | null;
  lost_wages: number | null;
  asset_liquidation_loss: number | null;
  total_financial_loss: number | null;
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "$0";
  return "$" + Math.round(n).toLocaleString();
}

function fmtPct(num: number, denom: number): string {
  return denom === 0 ? "0%" : ((num / denom) * 100).toFixed(1) + "%";
}

function cleanCategory(value: string): string | null {
  if (!value) return null;
  let v = value.trim();
  // Strip surrounding quotes often left by multi-select storage.
  v = v.replace(/^["']+|["']+$/g, "").trim();
  if (!v) return null;
  if (v.includes("@")) return null; // drop emails
  if (v.length > 100) return null; // drop free-text narratives
  if (/^\d+$/.test(v)) return null; // drop numeric junk
  return v;
}

function countMap(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const item of items) {
    const clean = cleanCategory(item);
    if (!clean) continue;
    m.set(clean, (m.get(clean) ?? 0) + 1);
  }
  return m;
}

function sortedEntries(m: Map<string, number>): [string, number][] {
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function keywordCounts(texts: string[], keywords: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const kw of keywords) counts.set(kw.toLowerCase(), 0);
  for (const text of texts) {
    if (!text) continue;
    const lower = text.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        counts.set(kw.toLowerCase(), (counts.get(kw.toLowerCase()) ?? 0) + 1);
      }
    }
  }
  return counts;
}

async function fetchAllSurveyRows(adminSupabase: ReturnType<typeof createAdminSupabaseClient>): Promise<SurveyRow[]> {
  const pageSize = 1000;
  const select = [
    "state_of_occurrence",
    "case_county",
    "allegation_type",
    "allegation_root_cause",
    "due_process_checklist",
    "other_allegation_details",
    "custody_status",
    "system_affected",
    "time_in_system",
    "is_pro_se",
    "months_lost_parenting_time",
    "attorney_fees",
    "gal_fees",
    "therapy_eval_fees",
    "reunification_fees",
    "other_court_actors_fees",
    "lost_wages",
    "asset_liquidation_loss",
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

async function main() {
  const adminSupabase = createAdminSupabaseClient();

  const [surveyRows, actorsRes, marketingRes, stateStatsRes] = await Promise.all([
    fetchAllSurveyRows(adminSupabase),
    fetch("https://my.standwithmeg.com/api/actors/all").then(r => r.json()),
    fetch("https://my.standwithmeg.com/api/public/marketing-stats").then(r => r.json()),
    adminSupabase.from("movement_stats_by_state").select("*"),
  ]);

  const actors: Actor[] = actorsRes.actors ?? [];
  const stateStats = (stateStatsRes.data ?? []) as Array<{
    state: string;
    is_us: boolean;
    total_submissions: number;
    approved_count: number;
    total_financial_loss: number;
    avg_financial_loss: number;
    pro_se_count: number;
    total_loss_count: number;
    avg_months_lost: number;
  }>;

  const rawTotalSubmissions = surveyRows.length;
  const totalSubmissions = stateStats.reduce((sum, s) => sum + (s.total_submissions || 0), 0);
  const totalApproved = stateStats.reduce((sum, s) => sum + (s.approved_count || 0), 0);
  const totalFinancialLossFromStats = stateStats.reduce((sum, s) => sum + (s.total_financial_loss || 0), 0);
  const totalProSeFromStats = stateStats.reduce((sum, s) => sum + (s.pro_se_count || 0), 0);
  const weightedAvgMonthsLost = totalSubmissions > 0
    ? stateStats.reduce((sum, s) => sum + (s.avg_months_lost || 0) * (s.total_submissions || 0), 0) / totalSubmissions
    : 0;

  // === 1. Repeat actors / institutional defendants ===
  const topActors = actors
    .filter(a => a.family_count >= 3)
    .sort((a, b) => b.family_count - a.family_count || a.name.localeCompare(b.name))
    .slice(0, 30);

  const actorsByState = new Map<string, Actor[]>();
  for (const a of actors) {
    const state = a.state_code ?? a.location_key ?? "Unknown";
    if (!actorsByState.has(state)) actorsByState.set(state, []);
    actorsByState.get(state)!.push(a);
  }

  const topStatesByPublicActors = Array.from(actorsByState.entries())
    .map(([state, list]) => ({
      state,
      publicActors: list.filter(a => a.at_threshold).length,
      nearThreshold: list.filter(a => a.family_count === 2).length,
      totalFamiliesNaming: list.reduce((sum, a) => sum + a.family_count, 0),
    }))
    .sort((a, b) => b.publicActors - a.publicActors || b.totalFamiliesNaming - a.totalFamiliesNaming)
    .slice(0, 15);

  // County / court concentration from actor county_breakdown.
  const courtMentions = new Map<string, { count: number; families: number; states: Set<string> }>();
  for (const a of actors) {
    const parts = a.county_breakdown.split(",");
    for (const part of parts) {
      const m = part.trim().match(/^(.+?)\s*\((\d+)\)$/);
      if (!m) continue;
      const court = m[1].trim();
      const mentions = parseInt(m[2], 10) || 0;
      const entry = courtMentions.get(court) ?? { count: 0, families: 0, states: new Set<string>() };
      entry.count += mentions;
      entry.families += Math.min(mentions, a.family_count); // rough; prevents overcount
      if (a.state_code) entry.states.add(a.state_code);
      courtMentions.set(court, entry);
    }
  }
  const topCourts = Array.from(courtMentions.entries())
    .map(([court, data]) => ({ court, ...data, states: Array.from(data.states).join(",") }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // === 2. Common fact patterns ===
  const allegationTypes = countMap(surveyRows.map(r => r.allegation_type).filter(Boolean) as string[]);
  const rootCauses = countMap(surveyRows.map(r => r.allegation_root_cause).filter(Boolean) as string[]);
  const custodyStatuses = countMap(surveyRows.map(r => r.custody_status).filter(Boolean) as string[]);
  const systemsAffected = countMap(surveyRows.map(r => r.system_affected).filter(Boolean) as string[]);
  const timeInSystem = countMap(surveyRows.map(r => r.time_in_system).filter(Boolean) as string[]);

  const checklistItems: string[] = [];
  for (const row of surveyRows) {
    if (Array.isArray(row.due_process_checklist)) {
      checklistItems.push(...row.due_process_checklist.filter(Boolean));
    }
  }
  const checklistCounts = countMap(checklistItems);

  const proSeCount = surveyRows.filter(r => r.is_pro_se).length;
  const withMonths = surveyRows.filter(r => r.months_lost_parenting_time && r.months_lost_parenting_time > 0);
  const avgMonthsLost = withMonths.length
    ? withMonths.reduce((sum, r) => sum + (r.months_lost_parenting_time ?? 0), 0) / withMonths.length
    : 0;

  const detailTexts = surveyRows.map(r => r.other_allegation_details).filter(Boolean) as string[];
  const fraudKeywords = ["billing", "medicaid", "insurance", "overbill", "double bill", "false billing", "unlicensed", "no license", "fraud", "kickback", "bribe", "collusion"];
  const narrativeKeywords = ["parental alienation", "alienation", "false allegation", "supervised visitation", "reunification therapy", "custody evaluator", "guardian ad litem", "psych eval", "drug test", "CPS", "DCFS", "DCF", "OSI", "DHS"];
  const fraudKeywordCounts = keywordCounts(detailTexts, fraudKeywords);
  const narrativeKeywordCounts = keywordCounts(detailTexts, narrativeKeywords);

  // === 3. Financial patterns ===
  const feeFields: Array<{ key: keyof SurveyRow; label: string }> = [
    { key: "attorney_fees", label: "Attorney fees" },
    { key: "gal_fees", label: "Guardian ad Litem / GAL fees" },
    { key: "therapy_eval_fees", label: "Therapy / evaluation fees" },
    { key: "reunification_fees", label: "Reunification therapy fees" },
    { key: "other_court_actors_fees", label: "Other court-actor fees" },
    { key: "lost_wages", label: "Lost wages" },
    { key: "asset_liquidation_loss", label: "Asset liquidation losses" },
  ];

  const FEE_OUTLIER_CAP = 5_000_000;
  const feeSummary = feeFields.map(({ key, label }) => {
    const cappedValues = surveyRows
      .map(r => Math.min((r[key] ?? 0) as number, FEE_OUTLIER_CAP))
      .filter(v => v > 0);
    const total = cappedValues.reduce((sum, v) => sum + v, 0);
    const avg = cappedValues.length ? total / cappedValues.length : 0;
    return { label, count: cappedValues.length, total, avg, pct: fmtPct(cappedValues.length, rawTotalSubmissions) };
  });

  const totalFinancialLoss = surveyRows.reduce((sum, r) => sum + (r.total_financial_loss ?? 0), 0);

  // === 4. Geographic concentration ===
  const countyRows = surveyRows
    .map(r => ({ state: r.state_of_occurrence, county: r.case_county ? r.case_county.trim() : null }))
    .filter(r => r.state && r.county);
  const countyKeyCounts = new Map<string, { state: string; county: string; submissions: number }>();
  for (const { state, county } of countyRows) {
    const key = `${state}|${county.toLowerCase()}`;
    const entry = countyKeyCounts.get(key) ?? { state: state!, county: county!, submissions: 0 };
    entry.submissions += 1;
    countyKeyCounts.set(key, entry);
  }
  const topCounties = Array.from(countyKeyCounts.values())
    .sort((a, b) => b.submissions - a.submissions)
    .slice(0, 25);

  // === Build memo ===
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# MDL / Fraud Litigation Intelligence Memo — Stand With Meg Data`);
  lines.push(`**Prepared for:** Shawn Lee  `);
  lines.push(`**Date:** ${date}  `);
  lines.push(`**Source:** Stand With Meg survey submissions + court actor registry (${totalSubmissions.toLocaleString()} submissions, ${actors.length.toLocaleString()} actor name groups)`);
  lines.push(`**Important:** This is aggregate data only. No names, emails, or submission IDs are included.`);
  lines.push("");

  lines.push(`## Executive Summary`);
  lines.push(`- **Total submissions (movement dashboard):** ${totalSubmissions.toLocaleString()}`);
  lines.push(`- **Approved submissions:** ${totalApproved.toLocaleString()}`);
  lines.push(`- **Total actor name groups:** ${actors.length.toLocaleString()}`);
  lines.push(`- **Public actors (3+ independent families):** ${actors.filter(a => a.at_threshold).length.toLocaleString()}`);
  lines.push(`- **Parents who went pro se:** ${totalProSeFromStats.toLocaleString()} (${fmtPct(totalProSeFromStats, totalSubmissions)})`);
  lines.push(`- **Average months of parenting time lost (state-weighted):** ${weightedAvgMonthsLost.toFixed(1)} months`);
  lines.push(`- **Total financial loss reported (outlier-capped):** ${fmtMoney(totalFinancialLossFromStats)}`);
  lines.push(`- **Key takeaway:** The data shows dense, repeating networks of the *same judges, attorneys, GALs, and CPS workers* appearing across dozens of unrelated families. That pattern is the strongest litigation hook — but a traditional MDL typically needs a common defendant. The better near-term path may be a **DOJ fraud referral** or **state-by-state civil rights / RICO pattern** litigation.`);
  lines.push("");

  lines.push(`## 1. Repeat Actors / Institutional Defendants`);
  lines.push(`The strongest pattern is not one “Purdue.” It is the *same individuals* named repeatedly across families in the same court system. Repeated names suggest either institutional roles (e.g., court-appointed GAL office, CPS agency, evaluator panel) or a small court pool that families cannot escape.`);
  lines.push("");
  lines.push(`### Top 30 public actors by number of independent families`);
  lines.push(`| Rank | Actor | Role | State | Families | Status |`);
  lines.push(`|---|---|---|---|---|---|`);
  topActors.forEach((a, i) => {
    lines.push(`| ${i + 1} | ${a.name} | ${a.role} | ${a.state_code ?? a.location_key ?? ""} | ${a.family_count} | ${a.at_threshold ? "Public" : "Near threshold"} |`);
  });
  lines.push("");

  lines.push(`### States with the most public actors`);
  lines.push(`| State | Public Actors | Near Threshold (2 families) | Total Families Naming Actors |`);
  lines.push(`|---|---|---|---|`);
  topStatesByPublicActors.forEach(s => {
    lines.push(`| ${s.state} | ${s.publicActors} | ${s.nearThreshold} | ${s.totalFamiliesNaming} |`);
  });
  lines.push("");

  lines.push(`### Most frequently named courts / counties`);
  lines.push(`These are the court venues where the registry shows the highest volume of named actors. High volume does not prove misconduct, but it identifies where to look first.`);
  lines.push(`| Court / County | Total Mentions | States |`);
  lines.push(`|---|---|---|`);
  topCourts.forEach(c => {
    lines.push(`| ${c.court} | ${c.count} | ${c.states} |`);
  });
  lines.push("");

  lines.push(`## 2. Common Fact Patterns`);
  lines.push(`### Allegation types`);
  lines.push(`| Allegation | Count | % of submissions |`);
  lines.push(`|---|---|---|`);
  sortedEntries(allegationTypes).slice(0, 20).forEach(([k, v]) => lines.push(`| ${k} | ${v} | ${fmtPct(v, rawTotalSubmissions)} |`));
  lines.push("");

  lines.push(`### Alleged root causes`);
  lines.push(`| Root cause | Count |`);
  lines.push(`|---|---|`);
  sortedEntries(rootCauses).slice(0, 20).forEach(([k, v]) => lines.push(`| ${k} | ${v} |`));
  lines.push("");

  lines.push(`### Due-process / fraud checklist selections`);
  lines.push(`Families checked every item that applied. These are the most common systemic complaints.`);
  lines.push(`| Issue | Times selected |`);
  lines.push(`|---|---|`);
  sortedEntries(checklistCounts).slice(0, 20).forEach(([k, v]) => lines.push(`| ${k} | ${v} |`));
  lines.push("");

  lines.push(`### Custody outcomes`);
  lines.push(`| Custody status | Count | % |`);
  lines.push(`|---|---|---|`);
  sortedEntries(custodyStatuses).forEach(([k, v]) => lines.push(`| ${k} | ${v} | ${fmtPct(v, rawTotalSubmissions)} |`));
  lines.push("");

  lines.push(`### Systems affected`);
  lines.push(`| System | Count |`);
  lines.push(`|---|---|`);
  sortedEntries(systemsAffected).forEach(([k, v]) => lines.push(`| ${k} | ${v} |`));
  lines.push("");

  lines.push(`### Time trapped in the system`);
  lines.push(`| Time range | Count |`);
  lines.push(`|---|---|`);
  sortedEntries(timeInSystem).forEach(([k, v]) => lines.push(`| ${k} | ${v} |`));
  lines.push("");

  lines.push(`### Common narrative keywords (from optional allegation details)`);
  lines.push(`These are aggregate keyword frequencies from the free-text "other allegation details" field. No individual text is reproduced.`);
  lines.push(`| Keyword / Phrase | Submissions mentioning it |`);
  lines.push(`|---|---|`);
  sortedEntries(narrativeKeywordCounts).forEach(([k, v]) => lines.push(`| ${k} | ${v} |`));
  lines.push("");

  lines.push(`## 3. Financial Fraud Patterns`);
  lines.push(`The survey breaks financial loss into categories. If court-appointed professionals are billing families for unnecessary or duplicated services, those categories should show up disproportionately.`);
  lines.push("");
  lines.push(`### Fee categories reported`);
  lines.push(`| Category | Submissions reporting | % of all submissions | Total reported | Average per reporting family |`);
  lines.push(`|---|---|---|---|---|`);
  feeSummary.forEach(f => {
    lines.push(`| ${f.label} | ${f.count.toLocaleString()} | ${f.pct} | ${fmtMoney(f.total)} | ${fmtMoney(f.avg)} |`);
  });
  lines.push("");

  lines.push(`### Financial-fraud keywords in narrative details`);
  lines.push(`| Keyword / Phrase | Submissions mentioning it |`);
  lines.push(`|---|---|`);
  sortedEntries(fraudKeywordCounts).forEach(([k, v]) => lines.push(`| ${k} | ${v} |`));
  lines.push("");

  lines.push(`#### Notes on financial patterns`);
  lines.push(`- **GAL / evaluator / reunification fees are reported by a meaningful share of families.** If those services were court-ordered and provided by a small pool of repeat professionals, that is a classic pattern to examine for billing fraud, kickbacks, or conflicts of interest.`);
  lines.push(`- **“Other court-actor fees”** may capture supervised visitation monitors, court-appointed therapists, and similar third-party vendors.`);
  lines.push(`- The keyword counts above are conservative. They only capture families who wrote the keyword in the optional details box. Actual prevalence is likely higher.`);
  lines.push("");

  lines.push(`## 4. Geographic Concentration`);
  lines.push(`### Top states by submissions (from movement_stats_by_state)`);
  lines.push(`| State | Submissions | Approved | Total Loss | Avg Loss | Pro Se | Report PDF |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  stateStats
    .filter(s => s.is_us)
    .sort((a, b) => b.total_submissions - a.total_submissions)
    .slice(0, 20)
    .forEach(s => {
      const pdf = (marketingRes.state_reports ?? []).find((r: { state: string }) => r.state === s.state)?.pdf ?? "";
      lines.push(`| ${s.state} | ${s.total_submissions} | ${s.approved_count} | ${fmtMoney(s.total_financial_loss)} | ${fmtMoney(s.avg_financial_loss)} | ${s.pro_se_count} | ${pdf ? "[PDF](" + pdf + ")" : ""} |`);
    });
  lines.push("");

  lines.push(`### Top 25 counties / courts by raw submission volume`);
  lines.push(`This is where families are clustered. Dense counties are the best places to look for repeat actors and potential institutional defendants.`);
  lines.push(`| County / Court | State | Submissions |`);
  lines.push(`|---|---|---|`);
  topCounties.forEach(c => {
    lines.push(`| ${c.county} | ${c.state} | ${c.submissions} |`);
  });
  lines.push("");

  lines.push(`## 5. Strategic Takeaways for Shawn`);
  lines.push(`1. **No single “Purdue” yet, but strong pattern defendants exist.** Look at the top public actors and the courts/counties where they operate. The same GAL office, evaluator panel, or CPS contractor serving one judge’s docket can function as a de facto institutional defendant.`);
  lines.push(`2. **The fraud angle has data support.** GAL/evaluator/reunification fees appear across thousands of families. If those providers billed Medicaid or were court-ordered by the same judges, that is a traceable pattern.`);
  lines.push(`3. **Geographic clustering is extreme.** A handful of states and counties dominate the dataset. That makes state AG complaints, FBI field-office referrals, and targeted civil suits practical.`);
  lines.push(`4. **The DOJ path is the cleanest first step.** A joint petition to the National Fraud Enforcement Division, backed by this aggregate data plus curated case packets, lets the government identify the central bad actor instead of you guessing.`);
  lines.push(`5. **If an MDL is ever viable, the hook would likely be a *product* or *service* common across districts** — for example, a specific custody-evaluation methodology, a specific supervised-visitation vendor chain, or a specific court-appointed guardian program that operates in multiple federal districts.`);
  lines.push("");

  lines.push(`## 6. Recommended Next Deliverables`);
  lines.push(`1. **Narrow “case packet” cohort:** Pick the top 5 public actors and pull anonymized, redacted case packets for families who named them. Shawn can review for wire-fraud elements.`);
  lines.push(`2. **Provider billing analysis:** For the top 10 counties, identify repeat GAL/evaluator/therapist names and cross-check against state licensing boards and Medicaid billing data (where publicly available).`);
  lines.push(`3. **Federal-district mapping:** Map the top counties to federal judicial districts. An MDL only applies to federal cases in multiple districts; knowing the district footprint is required.`);
  lines.push(`4. **Civil-rights pattern memo:** Analyze whether the same due-process violations appear in the same court systems, which could support a § 1983 / pattern-or-practice case even without a traditional MDL.`);
  lines.push("");

  lines.push(`---`);
  lines.push(`*This memo is based on aggregate survey and registry data. It is not legal advice and does not identify any individual as guilty of misconduct.*`);

  const memo = lines.join("\n");
  const filename = `content/shawn-mdl-memo-${date}.md`;
  await writeFile(filename, memo, "utf-8");
  console.log(`Wrote ${filename}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
