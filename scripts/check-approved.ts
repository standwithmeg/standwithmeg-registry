import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { count: total } = await sb.from("survey_submissions").select("id", { count: "exact", head: true });
  const { count: approved } = await sb.from("survey_submissions").select("id", { count: "exact", head: true }).eq("approved", true);
  const { count: withQuote } = await sb.from("survey_submissions").select("id", { count: "exact", head: true })
    .eq("approved", true)
    .not("impact_quote", "is", null)
    .in("permission_to_share", ["public", "anonymous", "first_name"]);

  console.log(`Total survey_submissions:        ${total}`);
  console.log(`Approved:                         ${approved}`);
  console.log(`Approved + public-shareable:      ${withQuote}`);
}

main().catch(console.error);
