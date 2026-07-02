// Fraud Documentation Packet routing ("Which door?").
//
// CRITICAL DESIGN RULE (legal): this config is CASE-CENTRIC, never
// actor-accusation-centric. Nothing here pre-fills an accused person's name.
// Federal doors are uniform across every state and ship verified on day one.
// State doors (MFCU + Attorney General) start as "needs_review" until each
// state's exact agency page is confirmed against the HHS OIG MFCU directory.

export type FraudVerificationStatus = "verified" | "needs_review" | "unavailable";

export type FraudDoorScope = "federal" | "state";

export type FraudDoor = {
  key: string;
  name: string;
  url: string;
  // Plain-language "use this door when..." line.
  whenToUse: string;
  description: string;
  scope: FraudDoorScope;
  verificationStatus: FraudVerificationStatus;
};

// Shared cautions reused across cards (mirrors the judicial packet's tone).
const FAMILY_FOCUS =
  "Write only what you personally know: dates, exact words or actions, the document that proves each fact, and where that document is stored. File facts, not conclusions.";

const SECTION_1001_WARNING =
  "Knowingly false statements to federal investigators are a separate federal crime (18 U.S.C. §1001). Do not copy another family's allegations and do not exaggerate. File only what you can personally support.";

// ---------------------------------------------------------------------------
// Federal doors — uniform for every state, verified.
// ---------------------------------------------------------------------------

const FEDERAL_DOORS: FraudDoor[] = [
  {
    key: "fbi_tips",
    name: "FBI — Submit a Tip",
    url: "https://tips.fbi.gov",
    whenToUse: "Federal program money or interstate wires were involved (email, e-filing, billing, wire transfers).",
    description:
      "The FBI's online tip line for federal crimes, including wire fraud and mail fraud that crossed state lines or touched federal programs.",
    scope: "federal",
    verificationStatus: "verified",
  },
  {
    key: "usao",
    name: "U.S. Attorney's Office (your district)",
    url: "https://www.justice.gov/usao/find-your-united-states-attorney",
    whenToUse: "You want a federal prosecutor's office in your area to receive the documented case.",
    description:
      "Find and contact the United States Attorney's Office for your federal district. This is the office that prosecutes federal fraud.",
    scope: "federal",
    verificationStatus: "verified",
  },
  {
    key: "hhs_oig",
    name: "HHS OIG Fraud Hotline",
    url: "https://oig.hhs.gov/fraud/report-fraud/",
    whenToUse: "Healthcare billing fraud — Medicare or Medicaid services that were billed falsely.",
    description:
      "The U.S. Department of Health and Human Services Office of Inspector General hotline for healthcare billing fraud, waste, and abuse.",
    scope: "federal",
    verificationStatus: "verified",
  },
];

// HHS OIG maintains a complete, current directory of every state's Medicaid
// Fraud Control Unit. Linking the directory is verifiable today even before a
// given state's individual MFCU page is confirmed.
const MFCU_DIRECTORY: FraudDoor = {
  key: "mfcu_directory",
  name: "Your State Medicaid Fraud Control Unit (MFCU)",
  url: "https://oig.hhs.gov/fraud/medicaid-fraud-control-units-mfcu/",
  whenToUse: "Medicaid-billed services were involved (therapy, evaluations, supervised visits, placements billed to Medicaid).",
  description:
    "Each state runs a Medicaid Fraud Control Unit that investigates fraud in Medicaid-billed services. Use this official directory to find and contact yours.",
  scope: "state",
  verificationStatus: "verified",
};

// ---------------------------------------------------------------------------
// State Attorney General consumer / fraud door.
// ---------------------------------------------------------------------------

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

export function getFraudStateName(stateCode: string | null | undefined): string {
  const code = (stateCode || "").trim().toUpperCase();
  return STATE_NAMES[code] || "your state";
}

// State AG consumer/fraud pages vary; until a given state's exact page is
// confirmed we route to a scoped search and flag it "needs_review" so the UI
// shows the same caution badge the judicial packet uses.
function stateAttorneyGeneralDoor(stateCode: string): FraudDoor {
  const code = (stateCode || "").trim().toUpperCase();
  const stateName = getFraudStateName(code);
  return {
    key: "state_ag",
    name: `${stateName} Attorney General — consumer / fraud unit`,
    url: `https://www.google.com/search?q=${encodeURIComponent(`${stateName} attorney general report fraud consumer protection complaint`)}`,
    whenToUse: "State-level fraud that did not cross state lines or touch a federal program.",
    description:
      "Your state Attorney General's consumer protection or fraud unit handles state-level fraud complaints. Confirm the exact page before filing.",
    scope: "state",
    verificationStatus: "needs_review",
  };
}

/**
 * Ordered doors for the selected state: verified federal doors first, then the
 * verified MFCU directory, then the state Attorney General door. No actor data
 * is ever consulted — routing is by whose money was touched, not by who is named.
 */
export function getFraudDoorsForState(stateCode: string | null | undefined): FraudDoor[] {
  const code = (stateCode || "").trim().toUpperCase();
  return [...FEDERAL_DOORS, MFCU_DIRECTORY, stateAttorneyGeneralDoor(code)];
}

// ---------------------------------------------------------------------------
// "Which door?" decision tree — educational, by whose money was touched.
// ---------------------------------------------------------------------------

export type WhichDoorBranch = {
  when: string;
  route: string;
  /** Scroll target on the packet page; null = parallel licensing track (no filing door here). */
  doorKey: string | null;
};

export const whichDoorTree: WhichDoorBranch[] = [
  { when: "Medicaid-billed services", route: "Your state Medicaid Fraud Control Unit (MFCU)", doorKey: "mfcu_directory" },
  { when: "Federal program money or interstate wires", route: "FBI tip line + your U.S. Attorney's Office", doorKey: "fbi_tips" },
  { when: "Healthcare billing (Medicare / Medicaid)", route: "HHS OIG Fraud Hotline", doorKey: "hhs_oig" },
  { when: "State-level fraud", route: "Your State Attorney General's fraud unit", doorKey: "state_ag" },
  { when: "Licensed professional conduct", route: "The licensing board (a separate, parallel track)", doorKey: null },
];

// ---------------------------------------------------------------------------
// The Four Elements of wire fraud + the §1001 card. Educational labels only.
// ---------------------------------------------------------------------------

export const wireFraudElements: { title: string; body: string }[] = [
  {
    title: "1. A scheme built on false statements",
    body: "A plan to get money or property using statements that were not true.",
  },
  {
    title: "2. Intent to defraud",
    body: "The person meant to deceive — it was not an honest mistake.",
  },
  {
    title: "3. A wire was used",
    body: "An email, a Zoom call, an e-filing, a billing system, or an electronic transfer carried part of it.",
  },
  {
    title: "4. The wire moved the scheme forward",
    body: "That email, call, filing, or transfer actually helped the plan along.",
  },
];

export const falseStatementCard = {
  title: "18 U.S.C. §1001 — Lying to federal investigators",
  body: SECTION_1001_WARNING,
};

// ---------------------------------------------------------------------------
// Documentation checklist + facts-vs-conclusions explainer.
// ---------------------------------------------------------------------------

export const fraudChecklistItems: string[] = [
  "Date — when each thing happened",
  "Who — names and roles of the people involved",
  "What happened — the facts, in the order they occurred",
  "What document proves it — the email, filing, bill, or transfer record",
  "Where it is stored — so you can produce it on request",
];

export const factsVsConclusionsLine =
  'Write facts, not conclusions. "On 3/4 the invoice billed a session that did not happen" is a fact. "They committed fraud" is a conclusion — let the facts show it.';

// ---------------------------------------------------------------------------
// Copy-ready template. CASE-CENTRIC: no accused-person name is pre-filled.
// ---------------------------------------------------------------------------

export function fraudDocumentationTemplate(doorName: string, stateCode: string | null | undefined): string {
  const stateName = getFraudStateName(stateCode);
  const where = stateName === "your state" ? "[STATE]" : stateName;
  return `To: ${doorName}

Re: Documentation of suspected fraud — submitted by an affected family member

My name: [YOUR NAME]
My contact: [PHONE / EMAIL]
State: ${where}
Date of this summary: [DATE]

ONE-PAGE SUMMARY
[In 3-5 sentences, plainly state what you believe happened: what was billed, claimed, or transferred that was not true, and roughly when. Keep it factual.]

WHAT HAPPENED (in date order)
[List each event on its own line: the date, who was involved, exactly what was said or done, and the document that proves it.]
- [DATE] — [WHO] — [WHAT HAPPENED] — proof: [DOCUMENT] — stored: [WHERE]
- [DATE] — [WHO] — [WHAT HAPPENED] — proof: [DOCUMENT] — stored: [WHERE]

EVIDENCE I CAN PROVIDE
[List the records you actually hold: invoices, billing statements, emails, e-filings, transfer records, recordings, messages, and the names of any witnesses.]

HARM
[Explain the concrete harm: money lost, services billed but not delivered, or the effect on your family.]

DECLARATION
I declare that the statements above are true and correct to the best of my personal knowledge. I understand that knowingly false statements to federal investigators are a separate federal crime (18 U.S.C. §1001).

[YOUR SIGNATURE]   [DATE]`;
}

export const fraudDocumentationGuidance = FAMILY_FOCUS;

// ---------------------------------------------------------------------------
// Additional reporting resources Shawn references on reels / in teaching.
// ---------------------------------------------------------------------------

export type FraudReportingResource = {
  key: string;
  name: string;
  url: string;
  whenToUse: string;
  plainEnglish: string;
};

export const NATIONAL_FRAUD_ENFORCEMENT_CONTACT = {
  name: "National Fraud Enforcement Division — U.S. Department of Justice",
  address: "950 Pennsylvania Avenue NW, Washington, DC 20530",
  phone: "202-514-2000",
  email: "fraud.feedback@usdoj.gov",
};

export const fraudReportingResources: FraudReportingResource[] = [
  {
    key: "doj_report_fraud",
    name: "DOJ — Report Fraud (Task Force portal)",
    url: "https://www.justice.gov/archives/fraudtaskforce/report-fraud",
    whenToUse: "You have documented facts and want to submit a fraud tip through the Justice Department's public reporting portal.",
    plainEnglish:
      "The DOJ's central \"report fraud\" page — one place families can start when they have organized documentation and want the government to receive it.",
  },
  {
    key: "doj_nfed",
    name: "DOJ — National Fraud Enforcement Division",
    url: "https://www.justice.gov/fraud",
    whenToUse: "You are reporting theft or misuse of taxpayer dollars, benefit-program fraud, or large-scale billing fraud.",
    plainEnglish:
      "The division the Attorney General stood up in April 2026 to investigate fraud against government programs and taxpayer money.",
  },
  {
    key: "eo_13844",
    name: "Executive Order 13844 — Fraud Task Force (Federal Register, 2018)",
    url: "https://www.govinfo.gov/content/pkg/FR-2018-07-16/pdf/2018-15299.pdf",
    whenToUse: "You want the original presidential order that created the DOJ fraud task force Shawn references for historical context.",
    plainEnglish:
      "The 2018 Executive Order that established the DOJ Task Force on Market Integrity and Consumer Fraud — background for why federal fraud enforcement has been building for years.",
  },
];
