export type ReportKitLesson = {
  id: string;
  episode: string;
  title: string;
  summary: string;
  takeaways: string[];
  sourceNote: string;
  status: "verified" | "theory" | "withheld";
};

export type ReportKitIssue = {
  id: string;
  cite: string;
  title: string;
  threshold: string;
  collect: string[];
  officialUrl: string;
};

export type ReportKitRoute = {
  id: string;
  name: string;
  useWhen: string;
  caution: string;
  url: string;
};

export const REPORT_KIT_LESSONS: ReportKitLesson[] = [
  {
    id: "claim-ladder",
    episode: "Episodes 5-7 update",
    title: "Use the claim ladder before using a legal label",
    summary:
      "Separate a question, a family report, a documented discrepancy, an official allegation, a filed charge, and a conviction. They are not interchangeable.",
    takeaways: [
      "A complaint or indictment records allegations; it is not a verdict.",
      "A charge can be reported as a charge only while the outcome remains unverified.",
      "A plea, verdict, sentence, and appeal status should each be labeled separately.",
      "Your packet should describe the record, not upgrade its status.",
    ],
    sourceNote: "Shawn Lee Report episode packages 5-7; source-status method cross-checked against official case records.",
    status: "verified",
  },
  {
    id: "facts-elements",
    episode: "Core framework",
    title: "Facts and elements, not adjectives",
    summary:
      "Investigators can test dates, documents, amounts, communications, and program money. Labels such as corrupt, criminal, or fraudulent do not establish an element.",
    takeaways: [
      "Write one event per line: when, who, what, and which record supports it.",
      "Record what you personally observed separately from what another person reported.",
      "Do not write intent as a fact unless a record directly supports it.",
      "Identify what is still missing or disputed.",
    ],
    sourceNote: "Shawn Lee, Memorandum of Law - Virtual Court Fraud (July 1, 2026), with legal-safety corrections.",
    status: "theory",
  },
  {
    id: "portal-map",
    episode: "Episode 6 update",
    title: "Map the portal, the bill, and the underlying event",
    summary:
      "A portal message or electronic invoice is a communication record. Its existence alone does not prove fraud. Preserve the complete chain and compare it with the underlying service, order, or event.",
    takeaways: [
      "Save the original message or export, not only a cropped screenshot.",
      "Record sender, recipient, timestamp, platform, and export method.",
      "Match each invoice line to a hearing, session, order, or service record.",
      "Preserve terms, receipts, audit logs, and later corrections without altering originals.",
    ],
    sourceNote: "Memo on Portal Systems (July 26, 2026) and Episode 6 teaching.",
    status: "theory",
  },
  {
    id: "money-map",
    episode: "Episodes 5-7 update",
    title: "Follow whose money was touched",
    summary:
      "Routing turns on jurisdiction: consumer money, U.S. Mail, cyber-enabled conduct, tax information, or a specific federal healthcare or benefit program.",
    takeaways: [
      "Name the payer, payee, amount, date, service, and funding source when known.",
      "Do not assume Medicaid or another federal program paid without an EOB, claim record, or other reliable source.",
      "A billing dispute and a suspected false claim are not automatically the same thing.",
      "Use the agency's current official intake page instead of an old generic mailing address.",
    ],
    sourceNote: "Episode 7 jurisdiction teaching, checked against current DOJ and agency reporting pages on August 11, 2026.",
    status: "verified",
  },
  {
    id: "case-examples",
    episode: "Episode 5 update",
    title: "Use public cases as status examples, not templates",
    summary:
      "The recent case folders demonstrate the difference between a filed allegation, a guilty plea, a jury verdict, and a sentence. They do not prove that a different family's facts satisfy the same law.",
    takeaways: [
      "Moreiko material is treated as a filed-charge example unless a later disposition is verified.",
      "Celebrezze criminal disposition and separate civil allegations must stay separate.",
      "Dugan's conviction, acquittal, sentence, and appeal status must be stated independently.",
      "News coverage is a lead; the filed record or official release controls status language.",
    ],
    sourceNote: "Recent Shawn case folders plus official DOJ record for United States v. Dugan.",
    status: "verified",
  },
  {
    id: "records-request",
    episode: "Episodes 5-6 update",
    title: "Request and preserve the record before drawing the inference",
    summary:
      "A reliable packet shows the source of each fact, how the record was obtained, whether it is complete, and what directly contradicts it.",
    takeaways: [
      "Keep the original file, a working copy, and a simple chain-of-custody note.",
      "Record the request date and the responding custodian when you obtain official records.",
      "Label transcripts as certified, unofficial, auto-generated, or excerpted.",
      "Do not upload sealed records, children's records, or private family files to a public AI tool.",
    ],
    sourceNote: "Episodes 5-6 evidence discipline and Stand With Meg privacy guardrails.",
    status: "verified",
  },
  {
    id: "route-and-supplement",
    episode: "Episode 7 update",
    title: "Route once, keep the confirmation, supplement carefully",
    summary:
      "Use the route that matches the conduct and funding source. Save the confirmation number and add later evidence as a labeled supplement instead of resubmitting inconsistent versions.",
    takeaways: [
      "The DOJ Report Fraud page is a routing gateway, not a universal complaint inbox.",
      "FBI tips are for general federal criminal matters; IC3 is for cyber-enabled crime.",
      "USPIS is the specific route when U.S. Mail is part of the suspected conduct.",
      "A submission does not guarantee a response, investigation, or prosecution.",
    ],
    sourceNote: "Current DOJ, FBI, IC3, USPIS, HHS OIG, FTC, IRS, and Oversight.gov reporting pages.",
    status: "verified",
  },
  {
    id: "ct-telework-withheld",
    episode: "Episode 7 - withheld",
    title: "Connecticut telework claim is not included yet",
    summary:
      "The episode transcript ended mid-discussion and the referenced source letter was not present in the shared Drive snapshot. The '80 percent' claim and any causal conclusion remain withheld.",
    takeaways: [
      "Add the source letter before publishing a lesson.",
      "Verify the exact wording, date, author, scope, and current status.",
      "Do not convert an unfinished episode statement into a factual module.",
    ],
    sourceNote: "Publication gate recorded August 11, 2026.",
    status: "withheld",
  },
];

export const REPORT_KIT_ISSUES: ReportKitIssue[] = [
  {
    id: "wire-fraud",
    cite: "18 U.S.C. § 1343",
    title: "Wire fraud - issue for investigator or counsel review",
    threshold:
      "Generally requires a scheme to obtain money or property by material deception, intent to defraud, and use of interstate wires for the purpose of the scheme. An email, portal, or video call alone is not wire fraud.",
    collect: ["The exact representation", "Why it was material", "Money or property sought", "The communication record", "Facts bearing on intent"],
    officialUrl: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1343&num=0&edition=prelim",
  },
  {
    id: "mail-fraud",
    cite: "18 U.S.C. § 1341",
    title: "Mail fraud - issue for investigator or counsel review",
    threshold:
      "Generally requires a scheme to obtain money or property by material deception and use of U.S. Mail or a qualifying carrier for the purpose of the scheme. A mailed document alone is not mail fraud.",
    collect: ["Mailing or tracking record", "Document mailed", "Material representation", "Money or property sought", "Facts bearing on intent"],
    officialUrl: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1341&num=0&edition=prelim",
  },
  {
    id: "health-care-fraud",
    cite: "18 U.S.C. § 1347",
    title: "Health care fraud - issue for investigator or counsel review",
    threshold:
      "Requires a knowing and willful scheme involving a health care benefit program. Confirm the program, claim, service, provider, and payment record before selecting this issue.",
    collect: ["EOB or claim record", "Program or insurer", "Provider and service date", "Service actually delivered", "Amount billed or paid"],
    officialUrl: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1347&num=0&edition=prelim",
  },
  {
    id: "honest-services",
    cite: "18 U.S.C. § 1346",
    title: "Honest-services theory - restricted issue for counsel review",
    threshold:
      "The Supreme Court limited honest-services fraud to bribery and kickback schemes. A conflict, poor service, or allegedly false report is not enough by itself.",
    collect: ["Documented bribe or kickback", "Who paid whom", "What official action or referral was exchanged", "Payment records", "Qualified legal analysis"],
    officialUrl: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1346&num=0&edition=prelim",
  },
];

export const REPORT_KIT_ROUTES: ReportKitRoute[] = [
  {
    id: "doj-gateway",
    name: "DOJ - Report Fraud routing page",
    useWhen: "Start here when you are unsure which federal investigative agency fits.",
    caution: "This page directs reports to the appropriate agency; it is not a universal filing inbox.",
    url: "https://www.justice.gov/fraud/report-fraud",
  },
  {
    id: "fbi",
    name: "FBI - Submit a Tip",
    useWhen: "General federal fraud, public corruption, or another federal criminal matter.",
    caution: "A tip may be shared or referred and does not guarantee direct contact or an investigation.",
    url: "https://tips.fbi.gov/home",
  },
  {
    id: "ic3",
    name: "FBI Internet Crime Complaint Center (IC3)",
    useWhen: "Cyber-enabled crime, online scams, email hoaxes, account compromise, or internet-enabled conduct.",
    caution: "Use facts and preserve the complaint ID; IC3 may refer the matter to another agency.",
    url: "https://www.ic3.gov/",
  },
  {
    id: "uspis",
    name: "U.S. Postal Inspection Service",
    useWhen: "The suspected scheme used U.S. Mail, including mailed invoices, checks, or solicitations.",
    caution: "Use this route only when the mail connection is real and documented.",
    url: "https://www.uspis.gov/report",
  },
  {
    id: "hhs-oig",
    name: "HHS Office of Inspector General Hotline",
    useWhen: "Suspected fraud, waste, or abuse involving Medicare, Medicaid, or another HHS program.",
    caution: "Identify the actual program and claim record; do not assume federal payment.",
    url: "https://oig.hhs.gov/fraud/report-fraud/",
  },
  {
    id: "mfcu",
    name: "State Medicaid Fraud Control Unit directory",
    useWhen: "Suspected Medicaid provider fraud or qualifying patient abuse or neglect within state MFCU jurisdiction.",
    caution: "Use the HHS OIG directory to locate the current state unit.",
    url: "https://oig.hhs.gov/fraud/medicaid-fraud-control-units-mfcu/",
  },
  {
    id: "oversight",
    name: "Oversight.gov - federal Inspector General routing",
    useWhen: "A specific federal agency, program, grant, contract, or federal funds were harmed.",
    caution: "Choose the Inspector General tied to the federal agency or program actually involved.",
    url: "https://www.oversight.gov/hotline",
  },
  {
    id: "ftc",
    name: "Federal Trade Commission - ReportFraud",
    useWhen: "Consumer scams, identity theft, or deceptive business practices.",
    caution: "The FTC uses reports for pattern detection and enforcement; it does not resolve every individual dispute.",
    url: "https://reportfraud.ftc.gov/",
  },
  {
    id: "irs",
    name: "IRS - Report Fraud",
    useWhen: "You have specific information about suspected tax fraud, evasion, or a tax-related scheme.",
    caution: "Do not use the IRS route for a general billing or family-court complaint without a real tax issue.",
    url: "https://www.irs.gov/help/report-fraud",
  },
  {
    id: "state-ag",
    name: "State Attorney General directory",
    useWhen: "A state consumer-protection or state fraud route may fit.",
    caution: "Use the official USAGov directory, then read the selected office's jurisdiction before filing.",
    url: "https://www.usa.gov/state-attorney-general",
  },
];

export const REPORT_KIT_SOURCE_STATUSES = [
  { value: "personal-knowledge", label: "Personal knowledge", help: "I directly saw, heard, received, paid, or did this." },
  { value: "original-record", label: "Original record", help: "I hold the native email, invoice, portal export, recording, or other original." },
  { value: "official-record", label: "Official record", help: "A court, agency, custodian, or public official produced this record." },
  { value: "reported-to-me", label: "Reported to me", help: "Another person told me; I have not independently verified it." },
  { value: "analysis-or-inference", label: "Analysis or inference", help: "This is my interpretation, not a direct fact." },
] as const;

export const REPORT_KIT_PRIVACY_NOTICE =
  "Your draft is stored only in this browser. The Report Kit does not upload your answers or evidence files. Do not paste sealed records, children's full names, Social Security numbers, medical identifiers, or account numbers into this workspace.";

export const REPORT_KIT_DISCLAIMER =
  "General legal education only - not legal advice. This tool does not decide that a crime occurred, does not create an attorney-client relationship, and does not guarantee a response, investigation, charge, prosecution, custody change, or recovery. Review every statement and each agency's current instructions before submitting.";
