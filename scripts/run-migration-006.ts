import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const sql = readFileSync("supabase/migrations/006_dedup_movement_view.sql", "utf8");

  // Supabase doesn't let us run arbitrary SQL through the REST client.
  // But we can test whether the view already reflects our fix by querying
  // it and looking at the row count structure.
  const { data, error } = await sb.from("movement_stats_by_state").select("state, total_submissions").limit(1);
  if (error) {
    console.error("Can't query view:", error.message);
    process.exit(1);
  }

  console.log("Migration SQL saved. To apply it:");
  console.log("  1. Open Supabase Dashboard → SQL Editor → New query");
  console.log("  2. Paste contents of supabase/migrations/006_dedup_movement_view.sql");
  console.log("  3. Run it");
  console.log("");
  console.log("OR paste this into the editor:");
  console.log("━".repeat(60));
  console.log(sql);
  console.log("━".repeat(60));
}

main();
