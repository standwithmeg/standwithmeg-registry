import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Get all permission_to_share values with counts
  const { data } = await sb.from("survey_submissions").select("permission_to_share, approved");

  const byPerm = new Map<string, { total: number; approved: number }>();
  for (const r of data ?? []) {
    const p = r.permission_to_share || "(null)";
    const entry = byPerm.get(p) || { total: 0, approved: 0 };
    entry.total++;
    if (r.approved) entry.approved++;
    byPerm.set(p, entry);
  }

  console.log("Permission distribution:");
  for (const [perm, counts] of [...byPerm.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${perm}: ${counts.total} total, ${counts.approved} approved`);
  }
}

main().catch(console.error);
