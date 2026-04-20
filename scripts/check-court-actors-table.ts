import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { error } = await sb.from("court_actors").select("id").limit(1);
  if (error) {
    console.log("court_actors table does NOT exist yet.");
    console.log("\nRun this SQL in Supabase Dashboard → SQL Editor:");
    console.log("  supabase/migrations/007_court_actors.sql");
    console.log("\nAfter it runs, this script will confirm:");
    console.log(`  Error: ${error.message}`);
    process.exit(1);
  }
  console.log("court_actors table exists and is accessible.");
}
main();
