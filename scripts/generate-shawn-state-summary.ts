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

type StateStat = {
  state: string;
  is_us: boolean;
  total_submissions: number;
  approved_count: number;
  total_financial_loss: number;
  avg_financial_loss: number;
  pro_se_count: number;
  total_loss_count: number;
  avg_months_lost: number;
};

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

function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function topItems<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T,
  count = 3
): string {
  const sorted = [...items].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));
  return sorted
    .slice(0, count)
    .map(a => {
      const entries = Object.entries(a).map(([k, v]) => `${k}: ${v}`).join(" | ");
      return entries;
    })
    .join("; ");
}

async function main() {
  const adminSupabase = createAdminSupabaseClient();

  const [{ data: stateRows, error: stateError }, actorsRes, marketingRes] = await Promise.all([
    adminSupabase.from("movement_stats_by_state").select("*"),
    fetch("https://my.standwithmeg.com/api/actors/all").then(r => r.json()),
    fetch("https://my.standwithmeg.com/api/public/marketing-stats").then(r => r.json()),
  ]);

  if (stateError) throw stateError;

  const statsByState = new Map<string, StateStat>();
  for (const row of (stateRows ?? []) as StateStat[]) {
    const code = String(row.state ?? "").trim();
    if (!code) continue;
    statsByState.set(code, row);
  }

  const actors: Actor[] = actorsRes.actors ?? [];
  const reportMap = new Map<string, string>();
  for (const s of (marketingRes.state_reports ?? []) as { state: string; pdf: string }[]) {
    reportMap.set(s.state, s.pdf);
  }

  // Group actors by state.
  const actorsByState = new Map<string, Actor[]>();
  for (const a of actors) {
    const state = a.state_code ?? a.location_key ?? "Unknown";
    if (!actorsByState.has(state)) actorsByState.set(state, []);
    actorsByState.get(state)!.push(a);
  }

  // Top roles per state (use the first role listed for multi-role actors).
  const topRolesByState = new Map<string, { role: string; actors: number; families: number }[]>();
  for (const [state, list] of actorsByState) {
    const roleCounts = new Map<string, { actors: number; families: number }>();
    for (const a of list) {
      const firstRole = a.role.split(/\s*\/\s*/)[0].split(/\s*\+\s*\d+\s+more/)[0].trim();
      const entry = roleCounts.get(firstRole) ?? { actors: 0, families: 0 };
      entry.actors += 1;
      entry.families += a.family_count;
      roleCounts.set(firstRole, entry);
    }
    topRolesByState.set(
      state,
      Array.from(roleCounts.entries())
        .map(([role, counts]) => ({ role, ...counts }))
        .sort((a, b) => b.families - a.families || b.actors - a.actors)
    );
  }

  const allStates = new Set([...statsByState.keys(), ...actorsByState.keys()]);
  const sortedStates = Array.from(allStates).sort((a, b) => a.localeCompare(b));

  const headers = [
    "State",
    "Country_or_Non_US",
    "Total_Family_Submissions",
    "Approved_Submissions",
    "Total_Financial_Loss",
    "Avg_Financial_Loss",
    "Parents_Pro_Se",
    "Reported_Loss_Count",
    "Avg_Months_Lost",
    "Actor_Name_Groups",
    "Public_Actors",
    "Below_Threshold_Actors",
    "Total_Families_Naming_Actors",
    "Top_3_Actors",
    "Top_3_Roles",
    "Report_PDF",
  ];

  const rows = sortedStates.map(state => {
    const stat = statsByState.get(state);
    const actorList = actorsByState.get(state) ?? [];
    const publicActors = actorList.filter(a => a.at_threshold);
    const belowThreshold = actorList.filter(a => !a.at_threshold);
    const totalFamiliesNamingActors = actorList.reduce((sum, a) => sum + a.family_count, 0);

    const topActors = actorList
      .sort((a, b) => b.family_count - a.family_count || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map(a => `${a.name} (${a.role}) — ${a.family_count} families`)
      .join("; ");

    const topRoles = (topRolesByState.get(state) ?? [])
      .slice(0, 3)
      .map(r => `${r.role}: ${r.actors} actors / ${r.families} families`)
      .join("; ");

    const isUs = stat ? stat.is_us : /^[A-Z]{2}$/.test(state);
    const countryOrNonUs = isUs ? "" : state;

    return [
      csvCell(isUs ? state : ""),
      csvCell(countryOrNonUs),
      csvCell(stat?.total_submissions ?? ""),
      csvCell(stat?.approved_count ?? ""),
      csvCell(stat?.total_financial_loss ?? ""),
      csvCell(stat?.avg_financial_loss ?? ""),
      csvCell(stat?.pro_se_count ?? ""),
      csvCell(stat?.total_loss_count ?? ""),
      csvCell(stat?.avg_months_lost ?? ""),
      csvCell(actorList.length),
      csvCell(publicActors.length),
      csvCell(belowThreshold.length),
      csvCell(totalFamiliesNamingActors),
      csvCell(topActors),
      csvCell(topRoles),
      csvCell(reportMap.get(state) ?? ""),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const filename = `content/shawn-state-summary-${new Date().toISOString().slice(0, 10)}.csv`;
  await writeFile(filename, csv, "utf-8");
  console.log(`Wrote ${filename}`);
  console.log(`States/countries: ${sortedStates.length}`);
  console.log(`Total actor name groups: ${actors.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
