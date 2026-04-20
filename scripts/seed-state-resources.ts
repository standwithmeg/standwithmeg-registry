/**
 * Seeds state_resource_links with all 50 US states.
 * Sets the Drive root folder as default URL for all states.
 * Admin can update individual state URLs + report_available via Supabase table editor.
 *
 * Run:  npx tsx --env-file=.env.local scripts/seed-state-resources.ts
 */

import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ROOT_DRIVE = "https://drive.google.com/drive/folders/1sgFj-G1zRnPIevAMRm9AWHPG4R4304km";

const STATES: [string, string][] = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
];

async function main() {
  const rows = STATES.map(([code, name]) => ({
    state_code: code,
    state_name: name,
    drive_folder_url: ROOT_DRIVE,
    report_available: false,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await sb.from("state_resource_links").upsert(rows, { onConflict: "state_code" });

  if (error) {
    console.error("Seed error:", error.message);
    process.exit(1);
  }

  console.log(`Seeded ${rows.length} states into state_resource_links.`);
  console.log(`Root Drive folder: ${ROOT_DRIVE}`);
  console.log("Update individual state URLs via Supabase table editor.");
}

main().catch(console.error);
