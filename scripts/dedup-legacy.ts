/**
 * Remove rows from legacy_submissions where the same (email, state) exists
 * in survey_submissions. The survey row is authoritative (newer, editable).
 *
 * This fixes the double-count problem in movement_stats_by_state without
 * needing to modify the view itself.
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Row = { id: string; email: string | null; state_of_occurrence: string | null };

async function fetchAll(table: string): Promise<Row[]> {
  const out: Row[] = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from(table)
      .select("id, email, state_of_occurrence")
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

function keyFor(r: Row): string | null {
  if (!r.email || !r.state_of_occurrence) return null;
  return `${r.email.toLowerCase().trim()}|${r.state_of_occurrence.toUpperCase().trim()}`;
}

// Also dedup just by email (no state), because some legacy rows have a
// state spelled inconsistently or truncated.
function emailOnlyKey(r: Row): string | null {
  if (!r.email) return null;
  return r.email.toLowerCase().trim();
}

async function main() {
  console.log("Loading survey_submissions...");
  const survey = await fetchAll("survey_submissions");
  const surveyKeys = new Set(survey.map(keyFor).filter((k): k is string => k !== null));
  const surveyEmails = new Set(survey.map(emailOnlyKey).filter((k): k is string => k !== null));
  console.log(`  ${surveyKeys.size} unique (email, state) keys, ${surveyEmails.size} unique emails.`);

  console.log("Loading legacy_submissions...");
  const legacy = await fetchAll("legacy_submissions");
  console.log(`  ${legacy.length} rows total.`);

  // Find legacy rows duplicated by survey (by email alone — if the email
  // is in the current sheet, the survey row is authoritative regardless of
  // state spelling differences).
  const toDelete: string[] = [];
  for (const r of legacy) {
    const emailKey = emailOnlyKey(r);
    if (emailKey && surveyEmails.has(emailKey)) toDelete.push(r.id);
  }

  console.log(`\n${toDelete.length} legacy rows shadow a survey row. Deleting...`);

  // Delete in batches
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    const { error } = await sb.from("legacy_submissions").delete().in("id", batch);
    if (error) { console.error("Delete error:", error.message); break; }
    process.stdout.write(`\r  Deleted ${Math.min(i + batch.length, toDelete.length)}/${toDelete.length}`);
  }

  console.log("\n");
  const { count: nowLegacy } = await sb.from("legacy_submissions").select("id", { count: "exact", head: true });
  const { count: nowSurvey } = await sb.from("survey_submissions").select("id", { count: "exact", head: true });
  console.log(`Final: survey_submissions=${nowSurvey}, legacy_submissions=${nowLegacy}`);
  console.log(`Combined: ${(nowSurvey ?? 0) + (nowLegacy ?? 0)}`);
}

main().catch(console.error);
