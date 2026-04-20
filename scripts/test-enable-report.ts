/**
 * Toggle a state's report_available flag.
 * Usage: pass state code as arg, e.g. `npx tsx ... scripts/test-enable-report.ts CA true`
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const stateCode = (process.argv[2] || "CA").toUpperCase();
  const available = (process.argv[3] ?? "true") === "true";

  const { error } = await sb.from("state_resource_links")
    .update({ report_available: available, updated_at: new Date().toISOString() })
    .eq("state_code", stateCode);
  if (error) { console.error(error); process.exit(1); }
  console.log(`${stateCode} report_available = ${available}`);
}

main();
