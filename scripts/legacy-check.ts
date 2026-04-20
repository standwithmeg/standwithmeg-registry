import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data } = await sb.from("legacy_submissions")
    .select("email, state_of_occurrence, created_at, data_source, imported_at")
    .limit(10);
  console.log("Sample legacy_submissions:");
  for (const r of data ?? []) console.log(`  ${r.email} | ${r.state_of_occurrence} | created:${r.created_at} | source:${r.data_source}`);
  
  // Count by data_source
  const { count: v1 } = await sb.from("legacy_submissions").select("id", { count: "exact", head: true }).eq("data_source", "legacy_v1");
  const { count: v1c } = await sb.from("legacy_submissions").select("id", { count: "exact", head: true }).eq("data_source", "legacy_v1_email_corrupted");
  console.log(`\nBy data_source: legacy_v1=${v1}, legacy_v1_email_corrupted=${v1c}`);
}
main().catch(console.error);
