/**
 * Public, cache-friendly marketing stats endpoint.
 *
 * Consumed by the standwithmeg.com marketing site to render headline numbers
 * (state count, country count, total reported loss, etc.) without freezing
 * those values in code.
 *
 * SAFETY: this endpoint MUST only return aggregate, non-identifying data.
 * It must never return:
 *   - names, emails, or any free-text fields
 *   - public quotes (those flow through a different curated endpoint)
 *   - court actor details (those are threshold-gated and admin-curated)
 *   - raw survey rows
 *
 * The shape of the response is intentionally narrow. New fields should be
 * added with the same discipline.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import {
  isUnitedStatesCountry,
  normalizeOutsideCountryForReporting,
  US_STATE_MISSING_LABEL,
} from "../../../../lib/survey-location";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface StateReportEntry {
  state: string;
  state_name: string;
  submissions: number;
  pdf: string;
  size_kb?: number;
}

interface GlobalCountryEntry {
  slug: string;
  country: string;
  region: string;
}

interface TopCountyEntry {
  state: string;
  state_name: string;
  county: string;
  slug: string;
  submissions: number;
}

interface PublicMarketingStats {
  generated_at: string;
  total_submissions: number;
  us_states_count: number;
  countries_count: number;
  total_financial_loss: number;
  parenting_time_lost_years: number;
  pro_se_count: number;
  report_ready_states: number;
  state_reports: StateReportEntry[];
  global_countries: GlobalCountryEntry[];
  top_counties: TopCountyEntry[];
}

const US_STATE_NAMES: Readonly<Record<string, string>> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DC: "District of Columbia", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", IA: "Iowa", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  MA: "Massachusetts", MD: "Maryland", ME: "Maine", MI: "Michigan", MN: "Minnesota",
  MO: "Missouri", MS: "Mississippi", MT: "Montana", NC: "North Carolina",
  ND: "North Dakota", NE: "Nebraska", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NV: "Nevada", NY: "New York", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VA: "Virginia",
  VT: "Vermont", WA: "Washington", WI: "Wisconsin", WV: "West Virginia",
  WY: "Wyoming",
};

// Region tagging happens locally because the registry stores country names,
// not regions. New countries default to "Global" — extend this map as new
// countries cross the public surface.
const COUNTRY_REGION: Readonly<Record<string, string>> = {
  canada: "North America",
  mexico: "North America",
  australia: "Oceania",
  "new-zealand": "Oceania",
  "united-kingdom": "Europe",
  ireland: "Europe",
  spain: "Europe",
  switzerland: "Europe",
  germany: "Europe",
  france: "Europe",
  italy: "Europe",
  netherlands: "Europe",
  norway: "Europe",
  sweden: "Europe",
  denmark: "Europe",
  finland: "Europe",
  poland: "Europe",
  portugal: "Europe",
  botswana: "Africa",
  "south-africa": "Africa",
  nigeria: "Africa",
  kenya: "Africa",
  india: "Asia",
  japan: "Asia",
  philippines: "Asia",
  singapore: "Asia",
  brazil: "South America",
  argentina: "South America",
};

// Country labels that look like sentinel/bucket values rather than real
// countries. We never surface these as discoverable countries.
const BLOCKED_COUNTRY_LABELS: ReadonlySet<string> = new Set([
  "",
  "other",
  "other / outside u.s.",
  "other/outside u.s.",
  "outside u.s.",
  "outside the u.s.",
  "outside us",
  "outside united states",
  "unknown",
  "missing",
  "n/a",
  "none",
  "tbd",
  "test",
  "international (location unspecified)",
  "international",
]);

// US territories. We surface these as separate registry locations alongside
// other countries so the published `countries_count` matches the public
// dashboard widget (which counts every distinct non-US-state row). They get
// their own region label so a user can tell them apart from foreign
// jurisdictions at a glance.
const US_TERRITORIES_LOWERCASE: ReadonlySet<string> = new Set([
  "american samoa",
  "american samoa (us)",
  "us minor outlying islands",
  "u.s. minor outlying islands",
  "guam",
  "puerto rico",
  "northern mariana islands",
  "u.s. virgin islands",
  "us virgin islands",
]);

// Hard sanity ceiling on a single family's reported `months_lost_parenting_time`.
// 720 months = 60 years. Anything over this is treated as data entry noise
// (someone typed a year as days, etc.) and ignored for the public aggregate.
const MAX_MONTHS_PER_ROW = 720;

// Counties below this threshold are not surfaced publicly to avoid
// re-identifying small-volume jurisdictions. Meg's home county is force-
// included regardless because that case is already on the public record.
const PUBLIC_COUNTY_THRESHOLD = 3;
const FORCE_INCLUDE_COUNTIES: ReadonlyArray<{ state: string; county: string }> = [
  { state: "KS", county: "Johnson County" },
];

interface ByStateRow {
  state: string | null;
  is_us: boolean | null;
  total_submissions: number | null;
  total_financial_loss: number | null;
}

interface CountyAggKey {
  state: string;
  county: string;
}

interface CountyAggValue extends CountyAggKey {
  count: number;
}

async function loadStateReports(): Promise<StateReportEntry[]> {
  try {
    const indexPath = path.join(process.cwd(), "public", "state-reports", "index.json");
    const raw = await fs.readFile(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as Array<{
      state: string;
      submissions: number;
      file: string;
      size_kb?: number;
    }>;
    return parsed.map(row => ({
      state: row.state,
      state_name: US_STATE_NAMES[row.state] ?? row.state,
      submissions: row.submissions,
      pdf: `https://my.standwithmeg.com${row.file}`,
      size_kb: row.size_kb,
    }));
  } catch {
    return [];
  }
}

async function aggregateProSeAndParenting(
  supabase: SupabaseClient
): Promise<{ pro_se_count: number; parenting_time_months: number }> {
  // We sum across both survey_submissions and legacy_submissions to mirror the
  // dashboard's combined view. Pagination is required because PostgREST caps
  // at 1000 rows per request and these tables can exceed that.
  const tables = ["survey_submissions", "legacy_submissions"] as const;
  let proSeCount = 0;
  let parentingMonths = 0;

  for (const table of tables) {
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select("is_pro_se,months_lost_parenting_time")
        .range(from, from + pageSize - 1);

      if (error) {
        // 42P01 = relation does not exist (older deployments).
        if ((error as { code?: string }).code === "42P01") break;
        throw error;
      }
      if (!data || data.length === 0) break;

      for (const row of data as Array<{
        is_pro_se: boolean | string | null;
        months_lost_parenting_time: number | string | null;
      }>) {
        const proSe = row.is_pro_se === true || row.is_pro_se === "true" || row.is_pro_se === "yes";
        if (proSe) proSeCount += 1;
        const months = Number(row.months_lost_parenting_time ?? 0);
        if (Number.isFinite(months) && months > 0) {
          parentingMonths += Math.min(months, MAX_MONTHS_PER_ROW);
        }
      }

      if (data.length < pageSize) break;
      from += pageSize;
    }
  }

  return { pro_se_count: proSeCount, parenting_time_months: parentingMonths };
}

async function aggregateTopCounties(
  supabase: SupabaseClient
): Promise<TopCountyEntry[]> {
  // Aggregate (case_county, state_of_occurrence) across both tables. Only US
  // states are kept — county-level data for non-US locations is too noisy and
  // jurisdiction-mismatched to surface publicly.
  const counts = new Map<string, CountyAggValue>();
  const tables = ["survey_submissions", "legacy_submissions"] as const;
  const pageSize = 1000;

  for (const table of tables) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select("case_county,state_of_occurrence")
        .range(from, from + pageSize - 1);

      if (error) {
        if ((error as { code?: string }).code === "42P01") break;
        throw error;
      }
      if (!data || data.length === 0) break;

      for (const row of data as Array<{
        case_county: string | null;
        state_of_occurrence: string | null;
      }>) {
        const county = normalizeCountyLabel(row.case_county);
        const state = String(row.state_of_occurrence ?? "").trim().toUpperCase();
        if (!county || !state) continue;
        if (!US_STATE_NAMES[state]) continue;
        const key = `${state}|${county}`;
        const existing = counts.get(key) ?? { state, county, count: 0 };
        existing.count += 1;
        counts.set(key, existing);
      }

      if (data.length < pageSize) break;
      from += pageSize;
    }
  }

  const all: CountyAggValue[] = Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.county.localeCompare(b.county)
  );

  const top = all.filter(c => c.count >= PUBLIC_COUNTY_THRESHOLD).slice(0, 20);

  // Force-include configured counties (Johnson County, KS) when present.
  for (const force of FORCE_INCLUDE_COUNTIES) {
    const already = top.some(
      c => c.state === force.state && c.county === force.county
    );
    if (already) continue;
    const found = all.find(
      c => c.state === force.state && c.county === force.county
    );
    if (found && found.count > 0) {
      top.push(found);
    }
  }

  return top.map(c => ({
    state: c.state,
    state_name: US_STATE_NAMES[c.state] ?? c.state,
    county: c.county,
    slug: slugifyCounty(c.county, c.state),
    submissions: c.count,
  }));
}

// Things people sometimes type in the case_county field that aren't counties.
const BAD_COUNTY_LABELS: ReadonlySet<string> = new Set([
  "yes", "no", "n/a", "na", "none", "unknown", "tbd", "test", "?", "x",
]);

function normalizeCountyLabel(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.length < 3) return "";
  if (BAD_COUNTY_LABELS.has(s.toLowerCase())) return "";

  // Title-case each whitespace-separated token. Treat "MO" / "co." style
  // suffixes naively — county name strings are free-form and noisy.
  let titled = s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  // Collapse common variants so "Johnson", "JOHNSON", and "Johnson County"
  // all aggregate as "Johnson County".
  if (!/\bcounty\b/i.test(titled) && !/\bparish\b/i.test(titled) && !/\bborough\b/i.test(titled)) {
    titled = `${titled} County`;
  }
  return titled;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugifyCounty(county: string, state: string): string {
  const stateName = US_STATE_NAMES[state] ?? state;
  const c = slugify(county);
  const s = slugify(stateName);
  return `${c}-${s}`;
}

function titleCaseCountry(raw: string): string {
  // Country names should render with each word capitalized — "Northern Ireland"
  // not "Northern ireland". Lowercase short link words inside a multi-word
  // name (of, the, and).
  const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean);
  const small = new Set(["of", "the", "and", "in", "for"]);
  return tokens
    .map((t, i) => {
      if (i > 0 && small.has(t)) return t;
      return t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join(" ");
}

function buildGlobalCountriesFromRows(
  rows: ReadonlyArray<ByStateRow>
): GlobalCountryEntry[] {
  const seen = new Map<string, GlobalCountryEntry>();
  for (const row of rows) {
    if (row.is_us) continue;
    const stateLabel = (row.state ?? "").trim();
    if (!stateLabel) continue;
    const normalized = normalizeOutsideCountryForReporting(stateLabel);
    if (!normalized) continue;
    if (normalized === US_STATE_MISSING_LABEL) continue;
    if (isUnitedStatesCountry(normalized)) continue;

    const lower = normalized.toLowerCase();
    if (BLOCKED_COUNTRY_LABELS.has(lower)) continue;

    const country = titleCaseCountry(normalized);
    const slug = slugify(country);
    if (!slug || seen.has(slug)) continue;

    // Tag US territories with their own region label so a viewer can tell a
    // territory apart from a foreign country at a glance, but they still
    // count toward the registry's "places on record" total.
    let region: string;
    if (US_TERRITORIES_LOWERCASE.has(lower)) {
      region = "U.S. territory";
    } else {
      region = COUNTRY_REGION[slug] ?? "Global";
    }

    seen.set(slug, { slug, country, region });
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.country.localeCompare(b.country)
  );
}

export async function GET() {
  try {
    const supabase = createAdminSupabaseClient();

    const [byStateResult, agg, stateReports, topCounties] = await Promise.all([
      supabase
        .from("movement_stats_by_state")
        .select("state,is_us,total_submissions,total_financial_loss"),
      aggregateProSeAndParenting(supabase),
      loadStateReports(),
      aggregateTopCounties(supabase),
    ]);

    if (byStateResult.error) throw byStateResult.error;

    const rows = (byStateResult.data ?? []) as ByStateRow[];

    let totalSubmissions = 0;
    let totalLoss = 0;
    const usStates = new Set<string>();

    for (const row of rows) {
      totalSubmissions += Number(row.total_submissions) || 0;
      totalLoss += Number(row.total_financial_loss) || 0;
      const stateLabel = (row.state ?? "").trim();
      if (!stateLabel) continue;
      if (row.is_us) usStates.add(stateLabel);
    }

    const globalCountries = buildGlobalCountriesFromRows(rows);
    // countries_count: 1 (United States) + the cleaned non-US country list.
    // Both the headline number and the rendered country chips on the
    // marketing site read off the same source of truth — they should always
    // agree. The cleaned list still drops sentinel labels like
    // "International (location unspecified)" but keeps US territories with a
    // distinct region tag so the count matches the public dashboard.
    const countriesCount = (usStates.size > 0 ? 1 : 0) + globalCountries.length;

    const stats: PublicMarketingStats = {
      generated_at: new Date().toISOString(),
      total_submissions: totalSubmissions,
      us_states_count: usStates.size,
      countries_count: countriesCount,
      total_financial_loss: Math.round(totalLoss),
      parenting_time_lost_years: Math.round(agg.parenting_time_months / 12),
      pro_se_count: agg.pro_se_count,
      report_ready_states: stateReports.length,
      state_reports: stateReports,
      global_countries: globalCountries,
      top_counties: topCounties,
    };

    return Response.json(stats, {
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("GET /api/public/marketing-stats error:", err);
    return Response.json(
      { error: "Stats unavailable" },
      { status: 503, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
