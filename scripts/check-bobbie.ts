import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const email = "bobbiemh1229@gmail.com";

  const { data: subs, error } = await sb
    .from("survey_submissions")
    .select("*")
    .ilike("email", email)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    process.exit(1);
  }

  if (!subs || subs.length === 0) {
    console.log(`No submissions for ${email}.`);

    // Also try by first name "Bobbie" in case email differs from form email
    const { data: byName } = await sb
      .from("survey_submissions")
      .select(
        "id, created_at, first_name, last_name, email, state_of_occurrence, case_county, permission_to_share, approved, impact_quote"
      )
      .ilike("first_name", "Bobbie")
      .order("created_at", { ascending: false });
    console.log(`\nFallback by first_name=Bobbie: ${byName?.length ?? 0}`);
    for (const r of byName ?? []) {
      console.log(
        `  ${r.id}  ${r.first_name} ${r.last_name}  <${r.email}>  ${r.state_of_occurrence}/${r.case_county}  perm=${r.permission_to_share}  approved=${r.approved}  created=${r.created_at}`
      );
    }
    return;
  }

  type SubmissionRow = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    state_of_occurrence: string | null;
    case_county: string | null;
    permission_to_share: boolean | string | null;
    approved: boolean | string | null;
    impact_quote: string | null;
    created_at: string;
  };

  console.log(`Found ${subs.length} submission(s) for ${email}:\n`);
  for (const r of subs as SubmissionRow[]) {
    console.log(`── ${r.first_name ?? ""} ${r.last_name ?? ""} ──`);
    console.log(`  id:                  ${r.id}`);
    console.log(`  created_at:          ${r.created_at}`);
    console.log(`  state / county:      ${r.state_of_occurrence} / ${r.case_county}`);
    console.log(`  permission_to_share: ${r.permission_to_share}`);
    console.log(`  approved:            ${r.approved}`);
    console.log(`  impact_quote:        "${r.impact_quote ?? ""}"`);

    const { data: actors } = await sb
      .from("court_actors")
      .select("id, role, name, court_or_county, state_code, notes")
      .eq("submission_id", r.id);

    console.log(`  court_actors:        ${actors?.length ?? 0} named`);
    for (const a of actors ?? []) {
      console.log(`    • [${a.role}] ${a.name} — ${a.court_or_county ?? ""} (${a.state_code ?? ""})`);
      if (a.notes) console.log(`        notes: ${a.notes}`);
    }
    console.log();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
