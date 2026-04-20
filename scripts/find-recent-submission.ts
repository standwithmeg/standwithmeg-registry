import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Anything inserted in the last 30 minutes
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await sb.from("survey_submissions")
    .select("id, created_at, first_name, last_name, email, state_of_occurrence, case_county, case_status, system_affected, impact_quote, permission_to_share, approved, total_financial_loss")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) { console.error(error); process.exit(1); }

  if (!data || data.length === 0) {
    console.log("No submissions in the last 30 minutes.");
    console.log("The form might not be reaching the DB — or you submitted earlier.");
    return;
  }

  console.log(`Found ${data.length} recent submission(s):\n`);
  for (const r of data) {
    console.log(`── ${r.first_name} ${r.last_name} (${r.email}) ──`);
    console.log(`  id:              ${r.id}`);
    console.log(`  created_at:      ${r.created_at}`);
    console.log(`  state / county:  ${r.state_of_occurrence} / ${r.case_county}`);
    console.log(`  system:          ${r.system_affected}`);
    console.log(`  status:          ${r.case_status}`);
    console.log(`  total loss:      $${r.total_financial_loss ?? 0}`);
    console.log(`  permission:      ${r.permission_to_share}`);
    console.log(`  approved:        ${r.approved}`);
    console.log(`  quote:           "${(r.impact_quote || "").slice(0, 120)}${(r.impact_quote || "").length > 120 ? "..." : ""}"`);
    console.log();
  }
}
main().catch(console.error);
