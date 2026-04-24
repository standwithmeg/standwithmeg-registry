import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await sb
    .from("survey_submissions")
    .select("id, first_name, last_name, email, state_of_occurrence, case_county, created_at, approved, permission_to_share, impact_quote")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) { console.error("Error:", error.message); process.exit(1); }

  console.log("=== Most recent 5 submissions ===");
  for (const r of data ?? []) {
    console.log(`  ${r.created_at}  |  ${r.first_name} ${r.last_name}  |  ${r.state_of_occurrence}/${r.case_county}  |  ${r.email}  |  perm=${r.permission_to_share}  |  approved=${r.approved}`);
    console.log(`     quote: "${(r.impact_quote || "").slice(0, 80)}"`);
  }

  const { count: mdRaw } = await sb
    .from("survey_submissions")
    .select("id", { count: "exact", head: true })
    .eq("state_of_occurrence", "MD");
  console.log(`\nMD raw survey_submissions count: ${mdRaw}`);

  const { data: viewMD } = await sb
    .from("movement_stats_by_state")
    .select("state, is_us, total_submissions")
    .eq("state", "MD");
  console.log(`MD in deduped view: ${JSON.stringify(viewMD)}`);

  const { data: total } = await sb
    .from("movement_stats_by_state")
    .select("total_submissions");
  const sum = (total ?? []).reduce((s: number, r: { total_submissions: number | null }) => s + (Number(r.total_submissions) || 0), 0);
  console.log(`Grand deduped total: ${sum}`);
}

main();
