/**
 * Restore approved=true on imported rows whose permission allows public
 * display. Undoes accidental approval-reset from the last import run.
 */
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // All rows with a public-shareable permission should be approved
  // (that was the state before the accidental reset).
  const { count: before } = await sb.from("survey_submissions")
    .select("id", { count: "exact", head: true })
    .eq("approved", true);
  console.log(`Currently approved: ${before}`);

  const { error, count } = await sb.from("survey_submissions")
    .update({ approved: true }, { count: "exact" })
    .in("permission_to_share", ["public", "anonymous", "first_name"])
    .eq("approved", false);

  if (error) { console.error(error.message); process.exit(1); }
  console.log(`Re-approved ${count} rows.`);

  const { count: after } = await sb.from("survey_submissions")
    .select("id", { count: "exact", head: true })
    .eq("approved", true);
  console.log(`Now approved: ${after}`);
}
main().catch(console.error);
