import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await sb
    .from("court_actors")
    .select(
      "id, role, name, court_or_county, state_code, created_at, submission_id, survey_submissions!inner(email, first_name, last_name, permission_to_share)"
    )
    .eq("state_code", "OR")
    .ilike("role", "%attorney%")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(`OR attorneys: ${data?.length ?? 0}\n`);
  for (const a of data ?? []) {
    const sub: any = Array.isArray(a.survey_submissions)
      ? a.survey_submissions[0]
      : a.survey_submissions;
    console.log(`• ${a.name} [${a.role}] — ${a.court_or_county ?? "(no county)"}`);
    console.log(
      `    submitted by: ${sub?.first_name ?? ""} ${sub?.last_name ?? ""} <${sub?.email ?? ""}>  perm=${sub?.permission_to_share ?? ""}`
    );
    console.log(`    when: ${a.created_at}`);
    console.log();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
