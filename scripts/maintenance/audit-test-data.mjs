// Scan the whole database for test/seed/demo data leaking into public-facing counts.
// Default: preview only. Pass --execute to delete.
// Conservative: only matches high-confidence test patterns, not anything that
// could plausibly belong to a real family.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const EXECUTE = process.argv.includes("--execute");

// High-confidence test patterns. These domains do NOT belong to real families.
// .local is a reserved TLD that can never be used for real email per RFC 6762.
// We also flag any explicit seed-, demo-, test-, qa-, or fixture- prefix.
const TEST_EMAIL_PATTERNS = [
  "%@%-test.local",          // *.test.local — fixture/CI domain
  "%@circle-test.local",     // the specific fixture domain we already saw
  "%@example.com",           // RFC 2606 reserved for documentation/test
  "%@example.org",
  "%@example.net",
  "%@test.local",
  "%@localhost",
  "seed-%@%",                // explicit seed-* prefix
  "fixture-%@%",
];

console.log("=== Scanning survey_submissions for test/seed/demo patterns ===\n");

// Fetch any survey_submissions matching any of the patterns, with their linked court_actors.
const orClause = TEST_EMAIL_PATTERNS.map(p => `email.ilike.${p}`).join(",");

const { data: hits, error } = await supabase
  .from("survey_submissions")
  .select("id, email, first_name, last_name, state_of_occurrence, approved, permission_to_share, created_at")
  .or(orClause);

if (error) { console.error("query error:", error); process.exit(1); }

if (!hits?.length) {
  console.log("No test-pattern submissions found.\n");
  process.exit(0);
}

console.log(`Found ${hits.length} survey_submissions matching test patterns.\n`);

// Pull linked court_actors so we can show impact
const subIds = hits.map(h => h.id);
const { data: actors } = await supabase
  .from("court_actors")
  .select("id, name, state_code, submission_id, source, notes")
  .in("submission_id", subIds);

const actorsBySub = new Map();
for (const a of actors ?? []) {
  if (!actorsBySub.has(a.submission_id)) actorsBySub.set(a.submission_id, []);
  actorsBySub.get(a.submission_id).push(a);
}

// Group by email domain for the summary
const byDomain = new Map();
for (const h of hits) {
  const domain = h.email?.split("@")[1] ?? "<no-email>";
  if (!byDomain.has(domain)) byDomain.set(domain, []);
  byDomain.get(domain).push(h);
}

console.log("=== Summary by email domain ===");
for (const [domain, subs] of [...byDomain.entries()].sort((a,b) => b[1].length - a[1].length)) {
  const approvedCount = subs.filter(s => s.approved).length;
  const linkedActorCount = subs.reduce((sum, s) => sum + (actorsBySub.get(s.id)?.length ?? 0), 0);
  console.log(`  @${domain}: ${subs.length} submissions (${approvedCount} approved) → ${linkedActorCount} court_actor rows`);
}

console.log("\n=== Detail: every submission that would be deleted ===");
for (const h of hits) {
  const linked = actorsBySub.get(h.id) ?? [];
  const flag = h.approved ? "⚠ APPROVED (public)" : "ok (not approved)";
  console.log(`\n  - ${h.email} | ${h.state_of_occurrence ?? "??"} | ${flag} | perm=${h.permission_to_share}`);
  console.log(`    submitted ${h.created_at?.slice(0,10)} | sub ${h.id.slice(0,8)}`);
  for (const a of linked) {
    console.log(`      → court_actor: "${a.name}" (${a.state_code}) src=${a.source}`);
  }
}

if (!EXECUTE) {
  console.log("\n(preview only — re-run with --execute to delete all of the above)");
  process.exit(0);
}

console.log("\n=== EXECUTING DELETE ===\n");
const actorIds = (actors ?? []).map(a => a.id);
if (actorIds.length) {
  const { data: deletedActors, error: ea } = await supabase
    .from("court_actors")
    .delete()
    .in("id", actorIds)
    .select("id");
  if (ea) { console.error("court_actors delete error:", ea); process.exit(1); }
  console.log(`Deleted ${deletedActors?.length ?? 0} court_actors rows.`);
}

const { data: deletedSubs, error: es } = await supabase
  .from("survey_submissions")
  .delete()
  .in("id", subIds)
  .select("id, email");
if (es) { console.error("survey_submissions delete error:", es); process.exit(1); }
console.log(`Deleted ${deletedSubs?.length ?? 0} survey_submissions rows.`);

console.log("\nDone.");
