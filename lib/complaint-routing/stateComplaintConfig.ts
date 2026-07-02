export type ComplaintVerificationStatus = "verified" | "needs_review" | "unavailable";

export type ComplaintAgency = {
  name: string;
  url: string;
  roleTypes: string[];
  description: string;
  canReview: string[];
  cannotReview: string[];
  verificationStatus: ComplaintVerificationStatus;
};

export type StateComplaintConfig = {
  stateCode: string;
  stateName: string;
  judicialConduct?: ComplaintAgency;
  attorneyDiscipline?: ComplaintAgency;
  childWelfare?: ComplaintAgency;
  therapistLicensing?: ComplaintAgency;
  evaluatorLicensing?: ComplaintAgency;
  notes?: string[];
  legalRules?: {
    title: string;
    url: string;
    description: string;
  }[];
};

export type ComplaintRoleType =
  | "judge"
  | "attorney"
  | "child_welfare"
  | "therapist"
  | "evaluator"
  | "supervisor"
  | "other";

const APPELLATE_WARNING =
  "Discipline agencies usually cannot reverse custody, parenting-time, support, or evidentiary orders. Appeals, objections, motions to reconsider, motions to disqualify, writs, and other case remedies are separate from professional conduct complaints.";

const FAMILY_FOCUS =
  "Focus on dates, exact words or actions, orders, transcripts, messages, exhibits, witnesses, and how the conduct affected your ability to be heard or safely parent. Do not file conclusions by themselves.";

function agency(
  name: string,
  url: string,
  roleTypes: string[],
  description: string,
  verificationStatus: ComplaintVerificationStatus = "needs_review",
): ComplaintAgency {
  return {
    name,
    url,
    roleTypes,
    description,
    verificationStatus,
    canReview: [
      "Possible misconduct, ethics violations, conflicts, delay, bias, ex parte communications, dishonesty, abuse of authority, or professional conduct concerns within the agency's jurisdiction.",
      "Documented conduct supported by dates, orders, transcripts, correspondence, recordings, witness names, or other evidence.",
    ],
    cannotReview: [
      "A request to change custody, visitation, support, placement, or a court order.",
      "A general disagreement with a ruling without facts showing possible misconduct.",
      "Another family's allegations that you did not personally witness or experience.",
    ],
  };
}

const defaultRules = (stateName: string, stateCode: string) => [
  {
    title: `${stateName} complaint routing pending verification`,
    url: `https://www.google.com/search?q=${encodeURIComponent(`${stateName} judicial conduct attorney discipline child welfare licensing complaint`)}`,
    description: `Routing for ${stateCode} has a placeholder until the exact agency pages are verified. Confirm the agency before filing.`,
  },
];

function pendingConfig(stateCode: string, stateName: string): StateComplaintConfig {
  return {
    stateCode,
    stateName,
    judicialConduct: agency(
      `${stateName} judicial conduct complaint agency`,
      `https://www.google.com/search?q=${encodeURIComponent(`${stateName} judicial conduct complaint`)}`,
      ["judge"],
      "Complaint routing pending verification.",
      "needs_review",
    ),
    attorneyDiscipline: agency(
      `${stateName} attorney discipline agency`,
      `https://www.google.com/search?q=${encodeURIComponent(`${stateName} attorney misconduct complaint`)}`,
      ["attorney"],
      "Complaint routing pending verification.",
      "needs_review",
    ),
    childWelfare: agency(
      `${stateName} child welfare complaint or ombudsman path`,
      `https://www.google.com/search?q=${encodeURIComponent(`${stateName} child welfare complaint ombudsman`)}`,
      ["child_welfare"],
      "Complaint routing pending verification.",
      "needs_review",
    ),
    therapistLicensing: agency(
      `${stateName} professional licensing board`,
      `https://www.google.com/search?q=${encodeURIComponent(`${stateName} therapist social worker counselor licensing board complaint`)}`,
      ["therapist", "evaluator"],
      "Complaint routing pending verification.",
      "needs_review",
    ),
    evaluatorLicensing: agency(
      `${stateName} evaluator licensing or professional board`,
      `https://www.google.com/search?q=${encodeURIComponent(`${stateName} custody evaluator licensing complaint`)}`,
      ["evaluator"],
      "Complaint routing pending verification.",
      "needs_review",
    ),
    notes: [
      "Complaint routing pending verification. Confirm the exact agency before filing.",
      FAMILY_FOCUS,
      APPELLATE_WARNING,
    ],
    legalRules: defaultRules(stateName, stateCode),
  };
}

const CONFIGS: Record<string, StateComplaintConfig> = {
  CA: {
    stateCode: "CA",
    stateName: "California",
    judicialConduct: agency(
      "California Commission on Judicial Performance",
      "https://cjp.ca.gov/file_a_complaint/",
      ["judge"],
      "Independent California agency for complaints about judicial misconduct and judicial incapacity involving state judges, with shared authority for some commissioners and referees.",
      "verified",
    ),
    attorneyDiscipline: agency(
      "State Bar of California - Attorney Misconduct Complaint",
      "https://www.calbar.ca.gov/form/attorney-misconduct-complaint",
      ["attorney"],
      "Attorney discipline path for California lawyers, including attorneys and attorney GALs or minors' counsel when they are acting as lawyers.",
      "verified",
    ),
    childWelfare: agency(
      "California Department of Social Services - Child Welfare Complaint Paths",
      "https://www.cdss.ca.gov/reporting/file-a-complaint",
      ["child_welfare"],
      "CDSS complaint hub for county child welfare agency complaints, Foster Care Ombudsman contact, discrimination complaints, and related child welfare paths.",
      "verified",
    ),
    therapistLicensing: agency(
      "California Board of Behavioral Sciences - Enforcement",
      "https://www.bbs.ca.gov/consumers/enforcement_actions.html",
      ["therapist"],
      "Licensing and enforcement path for California marriage and family therapists, clinical social workers, professional clinical counselors, and educational psychologists.",
      "needs_review",
    ),
    evaluatorLicensing: agency(
      "California professional licensing board for the provider's license",
      "https://search.dca.ca.gov/",
      ["evaluator"],
      "Custody evaluators and reunification providers may be licensed through different California boards. Confirm the person's license type before filing.",
      "needs_review",
    ),
    notes: [
      "California's Commission on Judicial Performance says it is not an appellate court and cannot change custody, visitation, support, or other orders.",
      "For subordinate judicial officers, California says complaints should first be directed to the court where the officer serves.",
      "Background context only: the California State Auditor's 2019 report criticized CJP oversight weaknesses and said investigators did not always take a broad approach to possible misconduct patterns. Do not state that the Auditor found misconduct by any specific actor unless there is a specific public finding.",
      FAMILY_FOCUS,
      APPELLATE_WARNING,
    ],
    legalRules: [
      {
        title: "California Code of Judicial Ethics",
        url: "https://courts.ca.gov/system/files/file/canons.pdf",
        description: "Ethics canons for California judicial officers.",
      },
      {
        title: "California Rules of Professional Conduct",
        url: "https://www.calbar.ca.gov/Attorneys/Conduct-Discipline/Rules/Rules-of-Professional-Conduct",
        description: "Professional conduct rules for California attorneys.",
      },
      {
        title: "California State Auditor Report 2016-137",
        url: "https://information.auditor.ca.gov/reports/2016-137/index.html",
        description: "Background oversight audit concerning the Commission on Judicial Performance.",
      },
    ],
  },
  KS: {
    stateCode: "KS",
    stateName: "Kansas",
    judicialConduct: agency(
      "Kansas Commission on Judicial Conduct",
      "https://kscourts.gov/Judges/Commission-on-Judicial-Conduct",
      ["judge"],
      "Kansas judicial conduct path for possible misconduct by judges under the Kansas Supreme Court's judicial discipline authority.",
      "verified",
    ),
    attorneyDiscipline: agency(
      "Kansas Office of the Disciplinary Administrator",
      "https://kscourts.gov/Attorneys/Office-of-Disciplinary-Administration",
      ["attorney"],
      "Kansas attorney discipline path for lawyers, including attorneys or GALs who are lawyers.",
      "verified",
    ),
    childWelfare: agency(
      "Kansas DCF Customer Service / Ombudsman complaint path",
      "https://www.dcf.ks.gov/Agency/Pages/CustomerService.aspx",
      ["child_welfare"],
      "Kansas DCF complaint and customer service path for DCF or child welfare concerns.",
      "needs_review",
    ),
    therapistLicensing: agency(
      "Kansas Behavioral Sciences Regulatory Board",
      "https://www.ksbsrb.ks.gov/complaints/complaint-faqs",
      ["therapist"],
      "Kansas licensing board complaint path for psychologists, social workers, marriage and family therapists, counselors, addiction counselors, behavior analysts, and related behavioral science licensees.",
      "verified",
    ),
    evaluatorLicensing: agency(
      "Kansas Behavioral Sciences Regulatory Board or provider-specific licensing board",
      "https://www.ksbsrb.ks.gov/complaints/complaint-faqs",
      ["evaluator"],
      "Use this path when the evaluator or reunification provider is a BSRB licensee. Confirm license type first.",
      "verified",
    ),
    notes: [
      "Bad ruling alone usually belongs in appeal or motion practice. A conduct complaint should focus on misconduct, delay, bias, conflict, ex parte communication, denial of a meaningful hearing, dishonesty, or improper conduct.",
      FAMILY_FOCUS,
      APPELLATE_WARNING,
    ],
    legalRules: [
      {
        title: "Kansas Code of Judicial Conduct",
        url: "https://kscourts.gov/Rules-Orders/Rules/Kansas-Code-of-Judicial-Conduct",
        description: "Kansas judicial conduct code.",
      },
      {
        title: "Kansas Commission on Judicial Conduct Rule 602",
        url: "https://kscourts.gov/Rules-Orders/Rules/Commission-on-Judicial-Conduct",
        description: "Kansas rule creating the Commission on Judicial Conduct.",
      },
      {
        title: "Kansas Rules of Professional Conduct",
        url: "https://kscourts.gov/KSCourts/media/KsCourts/Rules/Rule-240-Prefatory-Rule.pdf?ext=.pdf",
        description: "Kansas professional conduct rules for attorneys.",
      },
    ],
  },
  FL: pendingConfig("FL", "Florida"),
  NC: pendingConfig("NC", "North Carolina"),
  WV: pendingConfig("WV", "West Virginia"),
  OH: pendingConfig("OH", "Ohio"),
  OK: pendingConfig("OK", "Oklahoma"),
  GA: pendingConfig("GA", "Georgia"),
  MT: pendingConfig("MT", "Montana"),
  TX: pendingConfig("TX", "Texas"),
  NY: pendingConfig("NY", "New York"),
  MN: pendingConfig("MN", "Minnesota"),
  TN: pendingConfig("TN", "Tennessee"),
  SC: pendingConfig("SC", "South Carolina"),
  LA: pendingConfig("LA", "Louisiana"),
  MA: pendingConfig("MA", "Massachusetts"),
  IN: pendingConfig("IN", "Indiana"),
};

export function getStateComplaintConfig(stateCode: string | null | undefined): StateComplaintConfig {
  const code = (stateCode || "").trim().toUpperCase();
  if (code && CONFIGS[code]) return CONFIGS[code];
  return pendingConfig(code || "UNKNOWN", code || "Unknown location");
}

export function classifyComplaintRole(role: string | null | undefined): ComplaintRoleType[] {
  const raw = (role || "").toLowerCase();
  const types = new Set<ComplaintRoleType>();

  if (/\b(judge|magistrate|commissioner|referee|justice|hon\.?|honorable)\b/.test(raw)) types.add("judge");
  if (/\b(attorney|lawyer|counsel|gal|guardian ad litem|child rep|minor'?s counsel|minor counsel)\b/.test(raw)) types.add("attorney");
  if (/\b(cps|dcf|dss|dcfs|child welfare|caseworker|case worker|social worker|family services)\b/.test(raw)) types.add("child_welfare");
  if (/\b(therapist|counselor|psychologist|social worker|reunification|therapy)\b/.test(raw)) types.add("therapist");
  if (/\b(evaluator|evaluation|custody evaluator|parenting coordinator|forensic)\b/.test(raw)) types.add("evaluator");
  if (/\b(supervisor|visitation supervisor|supervised visitation)\b/.test(raw)) types.add("supervisor");

  return types.size ? [...types] : ["other"];
}

export function getComplaintAgenciesForActor(actor: { role?: string | null; roles?: string[] | null; state_code?: string | null; location_key?: string | null }) {
  const config = getStateComplaintConfig(actor.state_code || actor.location_key);
  const roleText = actor.roles?.length ? actor.roles.join(" / ") : actor.role || "";
  const roleTypes = classifyComplaintRole(roleText);
  const agencies: ComplaintAgency[] = [];

  if (roleTypes.includes("judge") && config.judicialConduct) agencies.push(config.judicialConduct);
  if (roleTypes.includes("attorney") && config.attorneyDiscipline) agencies.push(config.attorneyDiscipline);
  if (roleTypes.includes("child_welfare") && config.childWelfare) agencies.push(config.childWelfare);
  if (roleTypes.includes("therapist") && config.therapistLicensing) agencies.push(config.therapistLicensing);
  if (roleTypes.includes("evaluator") && config.evaluatorLicensing) agencies.push(config.evaluatorLicensing);

  const deduped = agencies.filter((agencyItem, index) =>
    agencies.findIndex(candidate => candidate.name === agencyItem.name && candidate.url === agencyItem.url) === index
  );

  if (deduped.length > 0) return deduped;

  return [
    agency(
      `${config.stateName} complaint routing manual review needed`,
      config.legalRules?.[0]?.url || `https://www.google.com/search?q=${encodeURIComponent(`${config.stateName} professional complaint agency`)}`,
      ["other"],
      "No exact role match was found. Confirm the correct agency before filing.",
      "needs_review",
    ),
  ];
}

export const complaintChecklistItems = [
  "Case number",
  "Court name",
  "Judge or actor name",
  "Dates of hearings, orders, incidents, calls, messages, or meetings",
  "What happened, in chronological order",
  "Why the conduct may violate judicial, ethical, or professional rules",
  "Witnesses and how to contact them",
  "Evidence list",
  "Orders, transcripts, audio, video, messages, emails, exhibits, and billing records",
  "Harm caused",
  "What action you are requesting from the agency",
];

export const complaintPatternCategories = [
  "Due process concerns",
  "Ex parte concerns",
  "Ignored evidence",
  "Delayed rulings",
  "Parenting-time restrictions",
  "No-contact outcomes",
  "Financial gatekeeping",
  "Retaliation",
  "Bias/conflict concerns",
  "CPS/family court overlap",
  "Other family-reported pattern categories",
];
