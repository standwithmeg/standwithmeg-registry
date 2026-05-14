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

  type SurveySubmissionRef = {
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    permission_to_share?: boolean | string | null;
  };

  console.log(`OR attorneys: ${data?.length ?? 0}\n`);
  for (const a of data ?? []) {
    const sub: SurveySubmissionRef | undefined = Array.isArray(a.survey_submissions)
      ? (a.survey_submissions[0] as SurveySubmissionRef | undefined)
      : (a.survey_submissions as SurveySubmissionRef | undefined);
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
