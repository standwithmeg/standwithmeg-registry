/**
 * End-to-end test including court actors + auto-approval + generated column.
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BASE = "http://localhost:3000";

const TEST_EMAIL = `test-full-${Date.now()}@swm-automated-test.invalid`;
const TEST_QUOTE = "AUTOMATED FULL TEST: quote should auto-approve.";
const TEST_JUDGE = `Judge Test ${Date.now()}`; // unique per run so it doesn't clash

type Step = { name: string; ok: boolean; detail: string };
const results: Step[] = [];
function step(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name} — ${detail}`);
}

async function main() {
  let submissionId: string | null = null;

  try {
    // 1. Submit with court actors
    const payload = {
      outside_us: false,
      state_of_occurrence: "CA",
      case_county: "Test County",
      case_status: "Currently involved / \"Stuck\"",
      number_of_kids: 2,
      system_affected: "Family Court Only",
      time_in_system: "1 – 3 years",
      custody_status: "50/50 Joint",
      is_pro_se: false,
      legal_rep_history: "I have always had an attorney",
      allegation_type: "High Conflict Divorce",
      allegation_root_cause: "Test",
      due_process_checklist: ["Evidence ignored"],
      conflict_of_interest_awareness: "No",
      months_lost_parenting_time: 6,
      attorney_fees: 15000,
      gal_fees: 500,
      lost_wages: 2000,
      impact_quote: TEST_QUOTE,
      permission_to_share: "public",
      first_name: "TestFirst",
      last_name: "TestLast",
      email: TEST_EMAIL,
      court_actors: [
        { role: "Judge", name: TEST_JUDGE, court: "Test Superior Court", notes: "this should land in admin view" },
        { role: "Attorney (Opposing)", name: "Test Attorney", court: null, notes: null },
      ],
    };

    const res = await fetch(`${BASE}/api/survey`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    step("POST /api/survey with court actors", res.ok, res.ok ? `id=${body.id}` : body.error);
    if (!res.ok) throw new Error("insert failed");
    submissionId = body.id;

    // 2. Row auto-approved (permission=public)
    const { data: row } = await sb.from("survey_submissions").select("approved, total_financial_loss").eq("id", submissionId).single();
    step("Row auto-approved because permission=public", row?.approved === true,
      row?.approved === true ? "approved=true" : `approved=${row?.approved}`);

    // 3. total_financial_loss computed by generated column
    step("total_financial_loss auto-computed", Number(row?.total_financial_loss) === 17500,
      `expected 17500, got ${row?.total_financial_loss}`);

    // 4. Court actors saved
    const { data: actors } = await sb.from("court_actors").select("*").eq("submission_id", submissionId);
    step("Court actors saved", (actors?.length ?? 0) === 2,
      `found ${actors?.length ?? 0} actors`);

    // 5. Admin actors endpoint (by-email) can't run without auth — test table directly
    const foundJudge = (actors ?? []).find(a => a.name === TEST_JUDGE);
    step("Judge row has role+state+notes", foundJudge?.role === "Judge" && foundJudge?.state_code === "CA" && !!foundJudge?.notes,
      `role=${foundJudge?.role}, state=${foundJudge?.state_code}, notes=${foundJudge?.notes?.slice(0,30)}`);

    // 6. Public court-actors API doesn't list this name (only 1 family, threshold is 5)
    const pubRes = await fetch(`${BASE}/api/survey/court-actors?state=CA`);
    const pubData = await pubRes.json();
    const leaked = (pubData.actors ?? []).find((a: { name: string }) => a.name === TEST_JUDGE);
    step("Public API respects 5-family threshold", !leaked,
      leaked ? "LEAKED — test judge visible publicly" : "judge correctly hidden (only 1 reporter)");

    // 7. Approved quote visible publicly
    const qRes = await fetch(`${BASE}/api/survey/quotes?state=CA&is_us=true`);
    const qData = await qRes.json();
    const foundQuote = (qData.quotes ?? []).some((q: { quote: string }) => q.quote?.includes("AUTOMATED FULL TEST"));
    step("Public quote visible (auto-approved)", foundQuote, foundQuote ? "quote found" : "not found");

  } catch (err) {
    step("FATAL", false, (err as Error).message);
  } finally {
    if (submissionId) {
      // Delete actors first (FK cascade should handle but do it explicitly)
      await sb.from("court_actors").delete().eq("submission_id", submissionId);
      await sb.from("survey_submissions").delete().eq("id", submissionId);
      step("Cleanup", true, "test rows deleted");
    }
  }

  const passed = results.filter(r => r.ok).length;
  console.log(`\n═══ ${passed}/${results.length} passed ═══`);
  if (passed < results.length) process.exit(1);
}

main();
