import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { count: survey } = await sb.from("survey_submissions").select("id", { count: "exact", head: true });
  const { count: legacy } = await sb.from("legacy_submissions").select("id", { count: "exact", head: true });

  // Check overlap between survey_submissions and legacy_submissions by email
  async function getAllEmails(table: string): Promise<Set<string>> {
    const emails = new Set<string>();
    let from = 0;
    while (true) {
      const { data } = await sb.from(table).select("email").not("email", "is", null).range(from, from + 999);
      if (!data || data.length === 0) break;
      for (const r of data) if (r.email) emails.add(r.email.toLowerCase().trim());
      if (data.length < 1000) break;
      from += 1000;
    }
    return emails;
  }

  const surveyEmails = await getAllEmails("survey_submissions");
  const legacyEmails = await getAllEmails("legacy_submissions");
  const overlap = [...legacyEmails].filter(e => surveyEmails.has(e)).length;
  const uniqueTotal = new Set([...surveyEmails, ...legacyEmails]).size;

  console.log(`survey_submissions:     ${survey}`);
  console.log(`legacy_submissions:     ${legacy}`);
  console.log(`combined raw total:     ${(survey ?? 0) + (legacy ?? 0)}`);
  console.log(``);
  console.log(`unique survey emails:   ${surveyEmails.size}`);
  console.log(`unique legacy emails:   ${legacyEmails.size}`);
  console.log(`emails in both tables:  ${overlap}`);
  console.log(`unique emails overall:  ${uniqueTotal}`);
}

main().catch(console.error);
