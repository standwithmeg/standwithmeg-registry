import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { count } = await sb.from("survey_submissions").select("id", { count: "exact", head: true });
  console.log("Total survey_submissions:", count);

  const { count: imported } = await sb.from("survey_submissions")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", "imported_from_master_xlsx");
  console.log("Imported records:", imported);

  const { count: legacy } = await sb.from("legacy_submissions").select("id", { count: "exact", head: true });
  console.log("Legacy submissions:", legacy);

  // Delete duplicates: keep the OLDEST record per email, delete newer dupes
  console.log("\nChecking for duplicate emails...");
  const { data: dupes } = await sb.rpc("find_duplicate_emails" as never).catch(() => ({ data: null }));

  // Manual approach: find imported records whose emails already existed
  let from = 0;
  const dupeIds: string[] = [];
  while (true) {
    const { data } = await sb.from("survey_submissions")
      .select("id, email, created_at")
      .eq("ip_hash", "imported_from_master_xlsx")
      .range(from, from + 999);
    if (!data || data.length === 0) break;

    for (const rec of data) {
      // Check if another record with same email exists (not this one)
      const { count: matchCount } = await sb.from("survey_submissions")
        .select("id", { count: "exact", head: true })
        .eq("email", rec.email)
        .neq("id", rec.id);
      if (matchCount && matchCount > 0) {
        dupeIds.push(rec.id);
      }
    }
    if (data.length < 1000) break;
    from += 1000;
  }

  console.log(`Found ${dupeIds.length} duplicate imported records to delete.`);

  if (dupeIds.length > 0) {
    // Delete in batches
    for (let i = 0; i < dupeIds.length; i += 100) {
      const batch = dupeIds.slice(i, i + 100);
      const { error } = await sb.from("survey_submissions").delete().in("id", batch);
      if (error) console.error("Delete error:", error.message);
      else console.log(`  Deleted batch ${i/100 + 1}: ${batch.length} records`);
    }
  }

  const { count: finalCount } = await sb.from("survey_submissions").select("id", { count: "exact", head: true });
  console.log("\nFinal survey_submissions count:", finalCount);
}

main().catch(console.error);
