import assert from "node:assert/strict";
import { normalizeKitEmail } from "../../lib/report-kit-constants";
import {
  REPORT_KIT_DISCLAIMER,
  REPORT_KIT_ISSUES,
  REPORT_KIT_LESSONS,
  REPORT_KIT_PRIVACY_NOTICE,
  REPORT_KIT_ROUTES,
  REPORT_KIT_SOURCE_STATUSES,
} from "../../lib/report-kit-content";
import {
  buildReportKitPacket,
  createReportKitDraft,
  makeReportKitId,
  mergeReportKitDraft,
  packetTextToRtf,
  reportKitStorageKey,
  validateReportKitDraft,
} from "../../lib/report-kit-packet";
import { safeInternalNextPath } from "../../lib/safe-next-path";

// --- Email normalization (tester grants + access rows) ---
assert.equal(normalizeKitEmail("  Meg@Example.COM "), "meg@example.com");
assert.equal(normalizeKitEmail("not-an-email"), null);
assert.equal(normalizeKitEmail(""), null);
assert.equal(normalizeKitEmail("a@b"), null);
assert.equal(normalizeKitEmail("*@standwithmeg.com"), null);
assert.equal(normalizeKitEmail("admin@%"), null);
assert.equal(normalizeKitEmail("x".repeat(250) + "@ex.com"), null);

// --- Account-scoped localStorage keys ---
assert.equal(
  reportKitStorageKey("Meg@StandWithMeg.com"),
  "swm_report_kit_draft_v2:meg@standwithmeg.com",
);
assert.notEqual(
  reportKitStorageKey("meghann@example.com"),
  reportKitStorageKey("mandy@example.com"),
  "shared browsers must isolate drafts by exact email",
);

// --- Login next-path safety ---
assert.equal(safeInternalNextPath("/tools/fraud-kit"), "/tools/fraud-kit");
assert.equal(safeInternalNextPath("//evil.example"), "/report");
assert.equal(safeInternalNextPath("https://evil.example"), "/report");
assert.equal(safeInternalNextPath("/%2f%2fevil.example"), "/report");
assert.equal(safeInternalNextPath("\\evil"), "/report");
assert.equal(safeInternalNextPath(null), "/report");

// --- Blank draft validation ---
const blank = createReportKitDraft("tester@example.com");
assert.ok(validateReportKitDraft(blank).length >= 4, "blank drafts must not validate");
blank.pledges = ["fake-1", "fake-2", "fake-3", "fake-4"];
blank.routeIds = ["unknown-route"];
assert.match(validateReportKitDraft(blank).join("\n"), /Confirm all four/);
assert.match(validateReportKitDraft(blank).join("\n"), /reporting route/);

// --- Complete draft + safe packet ---
const complete = createReportKitDraft("tester@example.com");
complete.pledges = ["truth", "sources", "privacy", "outcome"];
complete.reporter.name = "Test Reporter";
complete.matter.state = "Kansas";
complete.matter.summary = "A neutral summary for test purposes.";
complete.facts = [{
  id: makeReportKitId("fact"),
  date: "2026-08-01",
  what: "An invoice lists a service the reporter says did not occur.",
  sourceStatus: "original-record",
  sourceDocument: "Invoice 1 and calendar export",
  storedAt: "Private folder",
  authenticity: "Downloaded from the billing portal",
  contradiction: "Provider response not yet received",
}];
complete.money = [{
  id: makeReportKitId("money"),
  date: "2026-08-01",
  payer: "Unknown program",
  payee: "Provider",
  amount: "$100",
  service: "Example service",
  fundingSource: "Unknown - not assumed",
  delivered: "Disputed",
  supportingRecord: "Invoice 1",
}];
complete.issueIds = ["wire-fraud"];
complete.routeIds = ["doj-gateway", "fbi"];

assert.deepEqual(validateReportKitDraft(complete), [], "complete source-labeled draft should validate");

const packet = buildReportKitPacket(complete);
assert.match(packet, /DOCUMENTATION & REPORTING PACKET/);
assert.match(packet, /Source status: Original record/);
assert.match(packet, /Unknown - not assumed/);
assert.match(packet, /https:\/\/www\.justice\.gov\/fraud\/report-fraud/);
assert.match(packet, /18 U\.S\.C\. § 1001|18 U\.S\.C\. \u00a7 1001|18 U\.S\.C\. § 1001|1001/);
assert.match(packet, /does not guarantee/);
assert.match(packet, /not a criminal complaint/i);
assert.doesNotMatch(packet, /^COUNT\s+[IVX\d]+/m, "packet must not generate criminal counts");
assert.doesNotMatch(packet, /has committed (wire fraud|mail fraud)/i, "packet must not declare guilt");
assert.doesNotMatch(packet, /guaranteed investigation/i);

// Adversarial user free-text must still not invent counts in template sections
const adversarial = createReportKitDraft("a@b.co");
adversarial.pledges = ["truth", "sources", "privacy", "outcome"];
adversarial.reporter.name = "A";
adversarial.matter.state = "TX";
adversarial.matter.summary = "They committed wire fraud and are guilty. COUNT I: Wire Fraud.";
adversarial.facts = [{
  id: makeReportKitId("fact"),
  date: "n/a",
  what: "Portal email existed. COUNT II.",
  sourceStatus: "personal-knowledge",
  sourceDocument: "none yet",
  storedAt: "",
  authenticity: "",
  contradiction: "",
}];
adversarial.routeIds = ["ic3"];
const adversarialPacket = buildReportKitPacket(adversarial);
// Free text may quote the user's words, but template must not mint structured counts.
assert.doesNotMatch(adversarialPacket, /^COUNT\s+[IVX\d]+\s*:/m);
assert.match(adversarialPacket, /issue-spotting|investigator or counsel|does not plead criminal counts/i);

// Multiline + Unicode
complete.matter.summary = "Line one\nLine two — em dash — 日本語 😀 §";
const unicodePacket = buildReportKitPacket(complete);
assert.match(unicodePacket, /Line one/);
assert.match(unicodePacket, /日本語/);

// RTF escaping
const rtf = packetTextToRtf("Braces {test} and slash \\ and section §");
assert.match(rtf, /^\{\\rtf1/);
assert.match(rtf, /\\\{test\\\}/);
assert.match(rtf, /\\u167\?/);
assert.match(packetTextToRtf("😀"), /\\u-10179\?\\u-8704\?/);
assert.match(packetTextToRtf("a\nb"), /\\par/);

// Draft merge isolation
const foreign = createReportKitDraft("other@example.com");
foreign.version = 2;
foreign.reporter.name = "Other Person";
foreign.matter.summary = "Should not leak without account key";
const merged = mergeReportKitDraft(foreign, "mandy@example.com");
assert.equal(merged.reporter.name, "Other Person");
assert.equal(merged.version, 2);
const rejected = mergeReportKitDraft({ version: 1, reporter: { name: "x" } }, "mandy@example.com");
assert.equal(rejected.reporter.name, "");
assert.equal(rejected.matter.summary, "");

// Routes — exact official HTTPS destinations required for beta
const requiredUrls = [
  "https://www.justice.gov/fraud/report-fraud",
  "https://tips.fbi.gov/home",
  "https://www.ic3.gov/",
  "https://www.uspis.gov/report",
  "https://oig.hhs.gov/fraud/report-fraud/",
  "https://oig.hhs.gov/fraud/medicaid-fraud-control-units-mfcu/",
  "https://www.oversight.gov/hotline",
  "https://reportfraud.ftc.gov/",
  "https://www.irs.gov/help/report-fraud",
  "https://www.usa.gov/state-attorney-general",
];
for (const url of requiredUrls) {
  assert.ok(REPORT_KIT_ROUTES.some(route => route.url === url), `missing route ${url}`);
}
assert.equal(new Set(REPORT_KIT_ROUTES.map(route => route.url)).size, REPORT_KIT_ROUTES.length, "route URLs should be unique");
assert.ok(REPORT_KIT_ROUTES.every(route => route.url.startsWith("https://")), "routes must use HTTPS");
const doj = REPORT_KIT_ROUTES.find(route => route.id === "doj-gateway");
assert.match(doj?.caution || "", /not a universal|routing|directs reports/i, "DOJ must not be sold as a direct inbox");

assert.deepEqual(
  REPORT_KIT_SOURCE_STATUSES.map(status => status.value),
  ["personal-knowledge", "original-record", "official-record", "reported-to-me", "analysis-or-inference"],
);

// Claim ladder + CT withhold + privacy notice
const claimLadder = REPORT_KIT_LESSONS.find(lesson => lesson.id === "claim-ladder");
assert.ok(claimLadder, "claim ladder lesson required");
assert.match(claimLadder!.summary, /allegation|charge|conviction|family report/i);

const withheld = REPORT_KIT_LESSONS.find(lesson => lesson.id === "ct-telework-withheld");
assert.equal(withheld?.status, "withheld", "unverified Connecticut lesson must remain withheld");
assert.match(withheld?.summary || "", /source letter was not present|withheld/i);

assert.match(REPORT_KIT_PRIVACY_NOTICE, /browser/i);
assert.match(REPORT_KIT_DISCLAIMER, /not legal advice/i);
assert.match(REPORT_KIT_DISCLAIMER, /does not decide that a crime occurred/i);

// Wire-fraud issue threshold must reject "email alone" theories
const wire = REPORT_KIT_ISSUES.find(issue => issue.id === "wire-fraud");
assert.match(wire?.threshold || "", /alone is not wire fraud/i);

// Invalid reporter email
const badEmail = createReportKitDraft("tester@example.com");
badEmail.pledges = ["truth", "sources", "privacy", "outcome"];
badEmail.reporter.name = "T";
badEmail.reporter.email = "not-valid";
badEmail.matter.state = "KS";
badEmail.matter.summary = "Summary";
badEmail.facts = complete.facts;
badEmail.routeIds = ["fbi"];
assert.match(validateReportKitDraft(badEmail).join("\n"), /valid reporter email/i);

console.log(
  "Report Kit checks passed: auth normalization, storage isolation keys, safe next paths, validation, packet safety, RTF, routes, source statuses, claim ladder, and CT withhold gate.",
);
