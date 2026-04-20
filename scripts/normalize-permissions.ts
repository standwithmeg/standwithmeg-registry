/**
 * Normalizes permission_to_share values in survey_submissions.
 * Converts full-text labels to short enum values used by filters:
 *   "Share away! I consent..."          → "public"
 *   "Use my quote anonymously..."       → "anonymous"
 *   "Use my quote with my first name..." → "first_name"
 *   "For data purposes only..."         → "data_only"
 */

import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAPPING: Array<[string, string]> = [
  ["Share away!", "public"],
  ["Use my quote anonymously", "anonymous"],
  ["Use my quote with my first name", "first_name"],
  ["For data purposes only", "data_only"],
];

async function main() {
  // Fetch all rows with their permission values
  let from = 0;
  let totalUpdated = 0;

  while (true) {
    const { data } = await sb.from("survey_submissions")
      .select("id, permission_to_share")
      .range(from, from + 999);
    if (!data || data.length === 0) break;

    const updates: Array<{ id: string; permission_to_share: string }> = [];
    for (const r of data) {
      const raw = r.permission_to_share || "";
      if (["public", "anonymous", "first_name", "data_only"].includes(raw)) continue;

      for (const [startsWith, short] of MAPPING) {
        if (raw.startsWith(startsWith)) {
          updates.push({ id: r.id, permission_to_share: short });
          break;
        }
      }
    }

    // Update in batches
    for (const u of updates) {
      const { error } = await sb.from("survey_submissions")
        .update({ permission_to_share: u.permission_to_share })
        .eq("id", u.id);
      if (error) {
        console.error(`  Error updating ${u.id}:`, error.message);
      }
    }

    totalUpdated += updates.length;
    console.log(`  Page ${from / 1000 + 1}: normalized ${updates.length} rows (total: ${totalUpdated})`);

    if (data.length < 1000) break;
    from += 1000;
  }

  console.log(`\nDone. Normalized ${totalUpdated} rows.`);

  // Verify
  const { count: publicCount } = await sb.from("survey_submissions")
    .select("id", { count: "exact", head: true })
    .in("permission_to_share", ["public", "anonymous", "first_name"])
    .eq("approved", true)
    .not("impact_quote", "is", null);
  console.log(`Approved public-shareable rows now: ${publicCount}`);
}

main().catch(console.error);
