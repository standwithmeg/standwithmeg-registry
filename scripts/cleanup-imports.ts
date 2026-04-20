import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log("Deleting all imported_from_master_xlsx records...");

  // Delete in batches (Supabase has row limits)
  let totalDeleted = 0;
  while (true) {
    const { data } = await sb.from("survey_submissions")
      .select("id")
      .eq("ip_hash", "imported_from_master_xlsx")
      .limit(500);

    if (!data || data.length === 0) break;

    const ids = data.map(r => r.id);
    const { error } = await sb.from("survey_submissions").delete().in("id", ids);
    if (error) { console.error("Delete error:", error.message); break; }
    totalDeleted += ids.length;
    console.log(`  Deleted ${totalDeleted} so far...`);
  }

  console.log(`Done. Deleted ${totalDeleted} imported records.`);

  const { count } = await sb.from("survey_submissions").select("id", { count: "exact", head: true });
  console.log(`survey_submissions count now: ${count}`);
}

main().catch(console.error);
