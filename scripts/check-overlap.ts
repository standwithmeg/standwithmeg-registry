import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function fetchAll(table: string) {
  const out: Array<{ email: string | null; state_of_occurrence: string | null }> = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from(table)
      .select("email, state_of_occurrence").range(from, from + 999);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

async function main() {
  const survey = await fetchAll("survey_submissions");
  const legacy = await fetchAll("legacy_submissions");

  const surveyEmails = new Set(survey.filter(r => r.email).map(r => r.email!.toLowerCase().trim()));
  const legacyEmails = new Set(legacy.filter(r => r.email).map(r => r.email!.toLowerCase().trim()));
  const surveyEmailStates = new Set(survey.filter(r => r.email && r.state_of_occurrence).map(r => `${r.email!.toLowerCase().trim()}|${r.state_of_occurrence!.toUpperCase()}`));
  const legacyEmailStates = new Set(legacy.filter(r => r.email && r.state_of_occurrence).map(r => `${r.email!.toLowerCase().trim()}|${r.state_of_occurrence!.toUpperCase()}`));

  const emailOverlap = [...legacyEmails].filter(e => surveyEmails.has(e)).length;
  const keyOverlap = [...legacyEmailStates].filter(k => surveyEmailStates.has(k)).length;

  console.log(`Survey:  ${survey.length} rows, ${surveyEmails.size} unique emails, ${surveyEmailStates.size} unique (email+state)`);
  console.log(`Legacy:  ${legacy.length} rows, ${legacyEmails.size} unique emails, ${legacyEmailStates.size} unique (email+state)`);
  console.log(`\nEmail overlap:          ${emailOverlap} (legacy rows whose email is also in survey)`);
  console.log(`(email+state) overlap:  ${keyOverlap}`);
  console.log(`\nLegacy rows with NULL email: ${legacy.filter(r => !r.email).length}`);
  console.log(`Legacy rows with NULL state: ${legacy.filter(r => !r.state_of_occurrence).length}`);
}
main().catch(console.error);
