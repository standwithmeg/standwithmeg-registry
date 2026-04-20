import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const fields = ["case_status", "time_in_system", "custody_status", "legal_rep_history", "allegation_type"];
  for (const f of fields) {
    const { data } = await sb.from("survey_submissions").select(f);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const val = (row as Record<string, unknown>)[f] as string;
      counts[val] = (counts[val] ?? 0) + 1;
    }
    console.log(`\n── ${f} ──`);
    for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      console.log(`  ${v.toString().padStart(4)}  ${k}`);
    }
  }
}
main().catch(console.error);
