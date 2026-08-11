// Fraud Documentation Packet routing ("Which door?").
//
// CRITICAL DESIGN RULE (legal): this config is CASE-CENTRIC, never
// actor-accusation-centric. Nothing here pre-fills an accused person's name.
// Federal routes are uniform across every state. State routing uses current
// official federal directories so the tool does not hard-code stale office URLs.

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
  "18 U.S.C. §1001 covers materially false statements and related conduct in matters within federal jurisdiction. Do not copy another family's allegations, exaggerate, or present a report or inference as personal knowledge. File only what you can support and label the source of each fact.";

// ---------------------------------------------------------------------------
// Federal doors — uniform for every state, verified against current official pages.
// ---------------------------------------------------------------------------

const FEDERAL_DOORS: FraudDoor[] = [
  {
    key: "doj_gateway",
    name: "DOJ — Report Fraud routing page",
    url: "https://www.justice.gov/fraud/report-fraud",
    whenToUse: "You are unsure which federal investigative agency has jurisdiction.",
    description:
      "The Justice Department's current routing page directs reporters to the appropriate investigative agency. It is a gateway, not a universal complaint inbox.",
    scope: "federal",
    verificationStatus: "verified",
  },
  {
    key: "fbi_tips",
    name: "FBI — Submit a Tip",
    url: "https://tips.fbi.gov/home",
    whenToUse: "General federal fraud, public corruption, or another federal criminal matter may be involved.",
    description:
      "The FBI's official online tip line. A portal message, email, or e-filing is evidence of a communication, but its existence alone does not establish wire fraud.",
    scope: "federal",
    verificationStatus: "verified",
  },
  {
    key: "ic3",
    name: "FBI Internet Crime Complaint Center (IC3)",
    url: "https://www.ic3.gov/",
    whenToUse: "The suspected conduct was cyber-enabled, internet-enabled, or involved an online scam or account compromise.",
    description:
      "IC3 is the FBI's central hub for cyber-enabled crime complaints. It may refer information to another federal, state, local, or international agency.",
    scope: "federal",
    verificationStatus: "verified",
  },
  {
    key: "uspis",
    name: "U.S. Postal Inspection Service",
    url: "https://www.uspis.gov/report",
    whenToUse: "U.S. Mail carried a documented invoice, check, solicitation, or other part of the suspected conduct.",
    description:
      "The Postal Inspection Service accepts reports of suspected fraud and scams related to U.S. Mail. Use it only when the mail connection is real and documented.",
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
  {
    key: "federal_ig",
    name: "Oversight.gov — federal Inspector General routing",
    url: "https://www.oversight.gov/hotline",
    whenToUse: "A specific federal agency, program, grant, contract, or federal funds were harmed.",
    description:
      "Use Oversight.gov to identify the Inspector General responsible for the federal agency or program actually involved.",
    scope: "federal",
    verificationStatus: "verified",
  },
  {
    key: "ftc",
    name: "Federal Trade Commission — ReportFraud",
    url: "https://reportfraud.ftc.gov/",
    whenToUse: "Consumer scams, identity theft, or deceptive business practices are involved.",
    description:
      "FTC reports support pattern detection and enforcement. The FTC does not resolve every individual dispute.",
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

function stateAttorneyGeneralDoor(stateCode: string): FraudDoor {
  const code = (stateCode || "").trim().toUpperCase();
  const stateName = getFraudStateName(code);
  return {
    key: "state_ag",
    name: `${stateName} Attorney General — consumer / fraud unit`,
    url: "https://www.usa.gov/state-attorney-general",
    whenToUse: "State-level fraud that did not cross state lines or touch a federal program.",
    description:
      "Use the official USAGov directory to open your state Attorney General's current site, then confirm that office's jurisdiction and intake instructions.",
    scope: "state",
    verificationStatus: "verified",
  };
}

/**
 * Ordered doors for the selected state: verified federal doors first, then the
 * verified MFCU directory, then the state Attorney General door. No actor data
 * is ever consulted — routing is by whose money was touched, not by who is named.
 */
export function getFraudDoorsForState(stateCode: string | null | undefined): FraudDoor[] {
  const code = (stateCode || "").trim().toUpperCase();
  const primary = FEDERAL_DOORS.filter(door => door.key === "fbi_tips");
  const remaining = FEDERAL_DOORS.filter(door => door.key !== "fbi_tips");
  return [...primary, ...remaining, MFCU_DIRECTORY, stateAttorneyGeneralDoor(code)];
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
  { when: "General federal fraud or public corruption", route: "FBI tip line", doorKey: "fbi_tips" },
  { when: "Cyber-enabled or internet-enabled crime", route: "FBI Internet Crime Complaint Center (IC3)", doorKey: "ic3" },
  { when: "U.S. Mail carried part of the suspected conduct", route: "U.S. Postal Inspection Service", doorKey: "uspis" },
  { when: "A specific federal agency or program was harmed", route: "The appropriate federal Inspector General", doorKey: "federal_ig" },
  { when: "Healthcare billing (Medicare / Medicaid)", route: "HHS OIG Fraud Hotline", doorKey: "hhs_oig" },
  { when: "State-level fraud", route: "Your State Attorney General's fraud unit", doorKey: "state_ag" },
  { when: "Licensed professional conduct", route: "The licensing board (a separate, parallel track)", doorKey: null },
];

// ---------------------------------------------------------------------------
// The Four Elements of wire fraud + the §1001 card. Educational labels only.
// ---------------------------------------------------------------------------

export const wireFraudElements: { title: string; body: string }[] = [
  {
    title: "1. A scheme to obtain money or property",
    body: "The alleged plan must target money or property; a disagreement, unfair ruling, or inaccurate statement is not enough by itself.",
  },
  {
    title: "2. Intent to defraud",
    body: "The government must prove an intent to deceive and cheat; a mistake, negligence, or poor service is not automatically criminal intent.",
  },
  {
    title: "3. A wire was used",
    body: "An interstate wire communication was used. Preserve the email, portal export, e-filing, billing record, or transfer record without assuming what it proves.",
  },
  {
    title: "4. The wire moved the scheme forward",
    body: "The wire must have been used for the purpose of carrying out the alleged scheme. The mere existence of an electronic communication is not enough.",
  },
];

export const falseStatementCard = {
  title: "18 U.S.C. §1001 — Materially false statements in federal matters",
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
  "Source status — personal knowledge, original record, official record, third-party report, or analysis",
  "What contradicts it — and whether the record is complete, certified, or disputed",
];

export const factsVsConclusionsLine =
  'Write facts, not conclusions. "On 3/4 the invoice billed a session that did not happen" is a fact. "They committed fraud" is a conclusion — let the facts show it.';

// ---------------------------------------------------------------------------
// Documentation summary template. CASE-CENTRIC: no accused-person name is pre-filled.
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

SOURCE STATUS
[For each fact, label whether it is personal knowledge, an original record, an official record, something reported to you, or your analysis. Do not present an allegation or charge as a finding.]

DECLARATION
I declare that the statements above are true and correct to the best of my knowledge and that I have labeled information I did not personally observe. I understand that 18 U.S.C. §1001 applies to materially false statements in matters within federal jurisdiction.

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

export const fraudReportingResources: FraudReportingResource[] = [
  {
    key: "doj_report_fraud",
    name: "DOJ — Report Fraud (Task Force portal)",
    url: "https://www.justice.gov/fraud/report-fraud",
    whenToUse: "You have documented facts and want to submit a fraud tip through the Justice Department's public reporting portal.",
    plainEnglish:
      "The DOJ's current routing page directs a reporter to the investigative agency that fits; it is not a universal complaint inbox.",
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
