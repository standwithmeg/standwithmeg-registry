import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const email = "hilarykgold@gmail.com";

  const { data: subs, error } = await sb
    .from("survey_submissions")
    .select(
      "id, created_at, first_name, last_name, email, state_of_occurrence, case_county, permission_to_share, approved, impact_quote"
    )
    .ilike("email", email)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("submissions query error:", error);
    process.exit(1);
  }

  if (!subs || subs.length === 0) {
    console.log(`No survey_submissions found for ${email}.`);
    return;
  }

  console.log(`Found ${subs.length} submission(s) for ${email}:\n`);
  for (const r of subs) {
    console.log(`── ${r.first_name ?? ""} ${r.last_name ?? ""} ──`);
    console.log(`  id:                  ${r.id}`);
    console.log(`  created_at:          ${r.created_at}`);
    console.log(`  state / county:      ${r.state_of_occurrence} / ${r.case_county}`);
    console.log(`  permission_to_share: ${r.permission_to_share}`);
    console.log(`  approved:            ${r.approved}`);
    console.log(
      `  quote:               "${(r.impact_quote || "").slice(0, 180)}${
        (r.impact_quote || "").length > 180 ? "..." : ""
      }"`
    );

    const { data: actors, error: aErr } = await sb
      .from("court_actors")
      .select("id, role, name, court_or_county, state_code, notes")
      .eq("submission_id", r.id);

    if (aErr) {
      console.log(`  court_actors:        ERROR ${aErr.message}`);
    } else {
      console.log(`  court_actors:        ${actors?.length ?? 0} named`);
      for (const a of actors ?? []) {
        console.log(
          `    • [${a.role}] ${a.name} — ${a.court_or_county ?? ""} (${a.state_code ?? ""})`
        );
        if (a.notes) console.log(`        notes: ${a.notes}`);
      }
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
