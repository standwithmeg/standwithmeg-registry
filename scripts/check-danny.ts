import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await sb
    .from("court_actors")
    .select(
      "id, role, name, court_or_county, submission_id, source, location_key, survey_submissions(email, permission_to_share, approved, impact_quote, state_of_occurrence)"
    )
    .eq("state_code", "FL")
    .ilike("name", "%phillips%")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(`FL Phillips rows: ${data?.length ?? 0}\n`);
  for (const r of data ?? []) {
    const sub = Array.isArray(r.survey_submissions)
      ? r.survey_submissions[0]
      : r.survey_submissions;
    console.log(
      `• id=${r.id.slice(0, 8)} role="${r.role}" court="${r.court_or_county}" source=${r.source}`
    );
    console.log(
      `    reporter=${sub?.email} perm=${sub?.permission_to_share} approved=${sub?.approved} has_quote=${!!sub?.impact_quote}`
    );
    if (sub?.impact_quote) {
      console.log(`    quote: "${sub.impact_quote.slice(0, 100)}..."`);
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
