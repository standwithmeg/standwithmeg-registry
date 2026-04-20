import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { error: e1 } = await sb.from("dashboard_access_log").select("id").limit(1);
  const { error: e2 } = await sb.from("state_resource_links").select("id").limit(1);

  if (!e1 && !e2) {
    console.log("Both tables exist and are accessible!");
    return;
  }

  if (e1) console.log("dashboard_access_log:", e1.message);
  if (e2) console.log("state_resource_links:", e2.message);
  console.log("\nPlease run the migration SQL in Supabase Dashboard > SQL Editor:");
  console.log("File: supabase/migrations/005_dashboard_access_and_resources.sql");
}

main().catch(console.error);
