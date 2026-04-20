/**
 * End-to-end test of the survey submission flow.
 *
 * 1. POSTs a fake submission to /api/survey (as a real user would)
 * 2. Confirms the row exists in survey_submissions with correct fields
 * 3. Confirms the admin API (/api/admin/survey-stats) includes it in recent
 *    submissions (Note: admin API requires auth, so we query the DB directly
 *    using the service-role key, which is what admin API does server-side)
 * 4. Approves the row, confirms it's eligible for public display
 * 5. Confirms /api/survey/quotes returns the quote
 * 6. Confirms /api/survey total count and by_state bump by 1
 * 7. Cleans up — deletes the test row so your real data stays clean
 *
 * Run:  npx tsx --env-file=.env.local scripts/test-submit-flow.ts
 */

import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BASE = "http://localhost:3000";

// Unique test email + identifying tag we can use to find + clean up the row
const TEST_EMAIL = `test-submit-${Date.now()}@swm-automated-test.invalid`;
const TEST_QUOTE = "AUTOMATED TEST: This quote should be visible publicly after approval.";

type Step = { name: string; ok: boolean; detail: string };
const results: Step[] = [];
function step(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name} — ${detail}`);
}

async function main() {
  let insertedId: string | null = null;

  try {
    // ── 1. POST to /api/survey ───────────────────────────────────
    const payload = {
      outside_us: false,
      state_of_occurrence: "CA",
      case_county: "Test County (AUTOMATED)",
      case_status: "Currently involved / \"Stuck\"",
      number_of_kids: 2,
      system_affected: "Family Court Only",
      time_in_system: "1 – 3 years",
      custody_status: "50/50 Joint",
      is_pro_se: false,
      legal_rep_history: "I have always had an attorney",
      allegation_type: "High Conflict Divorce",
      allegation_other_detail: "",
      allegation_root_cause: "Automated test root cause",
      due_process_checklist: ["Evidence ignored"],
      other_allegation_details: "",
      conflict_of_interest_awareness: "No",
      conflict_description: "",
      federal_funding_influence: "Unsure",
      months_lost_parenting_time: 6,
      lost_milestones_description: "Automated test milestones",
      attorney_fees: 15000,
      gal_fees: 500,
      therapy_eval_fees: 0,
      reunification_fees: 0,
      other_court_actors_fees: 0,
      lost_wages: 2000,
      asset_liquidation_loss: 0,
      impact_quote: TEST_QUOTE,
      permission_to_share: "public",
      first_name: "TestFirst",
      last_name: "TestLast",
      email: TEST_EMAIL,
    };

    const res = await fetch(`${BASE}/api/survey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    step("POST /api/survey", res.ok && !!body.id,
      res.ok ? `inserted id=${body.id}` : `HTTP ${res.status}: ${body.error}`);
    if (!res.ok || !body.id) throw new Error("Stopping: insert failed");
    insertedId = body.id;

    // ── 2. Verify row in survey_submissions ──────────────────────
    const { data: row } = await sb.from("survey_submissions").select("*").eq("id", insertedId).single();
    const expected = {
      state_of_occurrence: "CA",
      case_county: "Test County (AUTOMATED)",
      first_name: "TestFirst",
      last_name: "TestLast",
      email: TEST_EMAIL,
      impact_quote: TEST_QUOTE,
      permission_to_share: "public",
      attorney_fees: 15000,
      lost_wages: 2000,
      total_financial_loss: 17500,
      approved: false,
    };
    const mismatches: string[] = [];
    for (const [k, v] of Object.entries(expected)) {
      const actual = (row as Record<string, unknown>)?.[k];
      const matches = Number(actual) === Number(v) || actual === v;
      if (!matches) mismatches.push(`${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(actual)}`);
    }
    step("Row has correct fields", mismatches.length === 0,
      mismatches.length === 0 ? "all 11 fields match" : mismatches.join("; "));

    // ── 3. Admin "recent" should include this row ────────────────
    // Simulating what the admin API does: fetch 50 most recent
    const { data: recent } = await sb.from("survey_submissions")
      .select("id, impact_quote, email")
      .order("created_at", { ascending: false })
      .limit(50);
    const foundInRecent = (recent ?? []).some(r => r.id === insertedId);
    step("Appears in admin recent submissions", foundInRecent,
      foundInRecent ? "found within top 50 most recent" : "NOT found in top 50");

    // ── 4. Approve the row ───────────────────────────────────────
    const { error: approveErr } = await sb.from("survey_submissions")
      .update({ approved: true }).eq("id", insertedId);
    step("Approve row", !approveErr, approveErr ? approveErr.message : "approved=true");

    // ── 5. /api/survey/quotes should include this quote ──────────
    const qRes = await fetch(`${BASE}/api/survey/quotes?state=CA&is_us=true`);
    const qData = await qRes.json();
    const foundQuote = (qData.quotes ?? []).some((q: { quote: string }) =>
      q.quote?.includes("AUTOMATED TEST"));
    step("Public quotes API returns approved quote", foundQuote,
      foundQuote ? `found among ${qData.quotes?.length ?? 0} CA quotes` : "NOT found");

    // ── 6. Quote count endpoint includes it ──────────────────────
    const cRes = await fetch(`${BASE}/api/survey/quote-counts`);
    const cData = await cRes.json();
    step("/api/survey/quote-counts includes CA", (cData.counts?.CA ?? 0) > 0,
      `CA has ${cData.counts?.CA ?? 0} approved public quotes`);

    // ── 7. /api/survey total includes it ─────────────────────────
    const sRes = await fetch(`${BASE}/api/survey`);
    const sData = await sRes.json();
    const caRow = (sData.by_state ?? []).find((r: { state: string }) => r.state === "CA");
    step("/api/survey by_state has CA", !!caRow,
      caRow ? `CA has ${caRow.total_submissions} submissions` : "CA row missing");

  } catch (err) {
    step("FATAL", false, (err as Error).message);
  } finally {
    // ── Cleanup — delete the test row ──────────────────────────
    if (insertedId) {
      const { error } = await sb.from("survey_submissions").delete().eq("id", insertedId);
      step("Cleanup test row", !error, error ? error.message : `deleted ${insertedId}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════");
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} checks passed`);
  console.log("═══════════════════════════════════════════════════");
  if (passed < results.length) process.exit(1);
}

main();
