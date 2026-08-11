import {
  REPORT_KIT_DISCLAIMER,
  REPORT_KIT_ISSUES,
  REPORT_KIT_ROUTES,
  REPORT_KIT_SOURCE_STATUSES,
} from "./report-kit-content";

export type ReportKitPerson = {
  id: string;
  name: string;
  role: string;
  organization: string;
  documentedAction: string;
  supportingRecord: string;
};

export type ReportKitFact = {
  id: string;
  date: string;
  what: string;
  sourceStatus: string;
  sourceDocument: string;
  storedAt: string;
  authenticity: string;
  contradiction: string;
};

export type ReportKitMoneyItem = {
  id: string;
  date: string;
  payer: string;
  payee: string;
  amount: string;
  service: string;
  fundingSource: string;
  delivered: string;
  supportingRecord: string;
};

export type ReportKitSubmission = {
  id: string;
  agency: string;
  date: string;
  reference: string;
  notes: string;
};

export type ReportKitDraft = {
  version: 2;
  updatedAt: string;
  pledges: string[];
  reporter: {
    name: string;
    email: string;
    phone: string;
    city: string;
    state: string;
  };
  matter: {
    state: string;
    county: string;
    type: string;
    year: string;
    ongoing: "yes" | "no" | "unknown";
    summary: string;
  };
  people: ReportKitPerson[];
  facts: ReportKitFact[];
  money: ReportKitMoneyItem[];
  harm: {
    financial: string;
    service: string;
    other: string;
  };
  issueIds: string[];
  routeIds: string[];
  submissions: ReportKitSubmission[];
};

export const REPORT_KIT_STORAGE_PREFIX = "swm_report_kit_draft_v2";

/** Browser localStorage key — scoped to the authenticated account email. */
export function reportKitStorageKey(email: string): string {
  return `${REPORT_KIT_STORAGE_PREFIX}:${String(email || "").trim().toLowerCase()}`;
}

export function makeReportKitId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createReportKitDraft(email = ""): ReportKitDraft {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    pledges: [],
    reporter: { name: "", email: String(email || "").trim(), phone: "", city: "", state: "" },
    matter: { state: "", county: "", type: "", year: "", ongoing: "unknown", summary: "" },
    people: [],
    facts: [],
    money: [],
    harm: { financial: "", service: "", other: "" },
    issueIds: [],
    routeIds: [],
    submissions: [],
  };
}

/** Parse a localStorage draft while binding it to the current account email. */
export function mergeReportKitDraft(value: unknown, email: string): ReportKitDraft {
  const empty = createReportKitDraft(email);
  if (!value || typeof value !== "object") return empty;
  const incoming = value as Partial<ReportKitDraft>;
  if (incoming.version !== 2) return empty;
  return {
    ...empty,
    ...incoming,
    version: 2,
    reporter: {
      ...empty.reporter,
      ...incoming.reporter,
      // Prefer the signed-in account email when the saved contact email is blank.
      email: String(incoming.reporter?.email || email || "").trim(),
    },
    matter: { ...empty.matter, ...incoming.matter },
    harm: { ...empty.harm, ...incoming.harm },
    people: Array.isArray(incoming.people) ? incoming.people : [],
    facts: Array.isArray(incoming.facts) ? incoming.facts : [],
    money: Array.isArray(incoming.money) ? incoming.money : [],
    submissions: Array.isArray(incoming.submissions) ? incoming.submissions : [],
    pledges: Array.isArray(incoming.pledges) ? incoming.pledges : [],
    issueIds: Array.isArray(incoming.issueIds) ? incoming.issueIds : [],
    routeIds: Array.isArray(incoming.routeIds) ? incoming.routeIds : [],
  };
}

function clean(value: unknown, fallback = "Not provided"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function sourceStatusLabel(value: string): string {
  return REPORT_KIT_SOURCE_STATUSES.find(status => status.value === value)?.label ?? clean(value);
}

function section(lines: string[], title: string) {
  lines.push("", title.toUpperCase(), "-".repeat(title.length));
}

const REQUIRED_PLEDGES = ["truth", "sources", "privacy", "outcome"];

export function validateReportKitDraft(draft: ReportKitDraft): string[] {
  const errors: string[] = [];
  if (!REQUIRED_PLEDGES.every(pledge => draft.pledges.includes(pledge))) {
    errors.push("Confirm all four truth, privacy, status, and outcome statements.");
  }
  if (!draft.reporter.name.trim()) errors.push("Add the reporter's name.");
  if (!draft.reporter.email.trim() && !draft.reporter.phone.trim()) errors.push("Add an email or phone number for follow-up.");
  if (draft.reporter.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.reporter.email.trim())) {
    errors.push("Enter a valid reporter email, or remove it and provide a phone number.");
  }
  if (!draft.matter.state.trim()) errors.push("Add the state connected to the matter.");
  if (!draft.matter.summary.trim()) errors.push("Add a neutral matter summary.");
  if (!draft.facts.some(fact => fact.what.trim())) errors.push("Add at least one dated or approximately dated factual event.");
  draft.facts.forEach((fact, index) => {
    const knownStatus = REPORT_KIT_SOURCE_STATUSES.some(status => status.value === fact.sourceStatus);
    if (fact.what.trim() && !knownStatus) errors.push(`Choose a source status for event ${index + 1}.`);
    if (fact.what.trim() && !fact.sourceDocument.trim()) errors.push(`Name the supporting record, or write "none yet," for event ${index + 1}.`);
  });
  if (!draft.routeIds.some(routeId => REPORT_KIT_ROUTES.some(route => route.id === routeId))) {
    errors.push("Choose at least one reporting route to research or use.");
  }
  return errors;
}

export function buildReportKitPacket(draft: ReportKitDraft): string {
  const lines: string[] = [];
  const generated = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const selectedIssues = REPORT_KIT_ISSUES.filter(issue => draft.issueIds.includes(issue.id));
  const selectedRoutes = REPORT_KIT_ROUTES.filter(route => draft.routeIds.includes(route.id));

  lines.push(
    "DOCUMENTATION & REPORTING PACKET",
    "Private draft - review every line before submitting",
    "The Shawn Lee Report with Stand With Meg",
    `Prepared: ${generated}`,
    "",
    REPORT_KIT_DISCLAIMER,
  );

  section(lines, "Purpose and limits");
  lines.push(
    "This packet organizes a reporter's own facts, records, source status, money trail, and proposed reporting routes.",
    "It is not a criminal complaint drafted by counsel, does not plead criminal counts, and does not state that any named person committed a crime.",
    "Legal references below are issue-spotting notes for an investigator or licensed attorney to evaluate.",
  );

  section(lines, "Reporter contact");
  lines.push(
    `Name: ${clean(draft.reporter.name)}`,
    `Email: ${clean(draft.reporter.email)}`,
    `Phone: ${clean(draft.reporter.phone)}`,
    `Location: ${[draft.reporter.city, draft.reporter.state].filter(Boolean).join(", ") || "Not provided"}`,
  );

  section(lines, "Matter overview");
  lines.push(
    `State: ${clean(draft.matter.state)}`,
    `County: ${clean(draft.matter.county)}`,
    `Matter type: ${clean(draft.matter.type)}`,
    `Year begun: ${clean(draft.matter.year)}`,
    `Ongoing: ${clean(draft.matter.ongoing)}`,
    `Neutral summary: ${clean(draft.matter.summary)}`,
  );

  section(lines, "People and organizations named in the records");
  if (!draft.people.length) {
    lines.push("None listed.");
  } else {
    draft.people.forEach((person, index) => {
      lines.push(
        `${index + 1}. ${clean(person.name)} - ${clean(person.role)}${person.organization.trim() ? `, ${person.organization.trim()}` : ""}`,
        `   Documented action or role: ${clean(person.documentedAction)}`,
        `   Supporting record: ${clean(person.supportingRecord)}`,
      );
    });
  }

  section(lines, "Chronology and source status");
  if (!draft.facts.length) {
    lines.push("No factual events listed.");
  } else {
    draft.facts.forEach((fact, index) => {
      lines.push(
        `${index + 1}. Date: ${clean(fact.date, "Date not yet confirmed")}`,
        `   Event: ${clean(fact.what)}`,
        `   Source status: ${sourceStatusLabel(fact.sourceStatus)}`,
        `   Supporting record: ${clean(fact.sourceDocument)}`,
        `   Stored at: ${clean(fact.storedAt)}`,
        `   Authenticity / how obtained: ${clean(fact.authenticity)}`,
        `   Contradictory or missing record: ${clean(fact.contradiction)}`,
      );
    });
  }

  section(lines, "Money and program map");
  if (!draft.money.length) {
    lines.push("No money or program entries listed. Do not infer a federal program connection without a supporting record.");
  } else {
    draft.money.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${clean(item.date, "Date not yet confirmed")} - ${clean(item.payer)} to ${clean(item.payee)} - ${clean(item.amount)}`,
        `   Service or charge: ${clean(item.service)}`,
        `   Funding source or program: ${clean(item.fundingSource, "Unknown - not assumed")}`,
        `   Service delivered: ${clean(item.delivered)}`,
        `   Supporting record: ${clean(item.supportingRecord)}`,
      );
    });
  }

  section(lines, "Concrete harm reported");
  lines.push(
    `Financial: ${clean(draft.harm.financial)}`,
    `Service or program: ${clean(draft.harm.service)}`,
    `Other documented harm: ${clean(draft.harm.other)}`,
  );

  section(lines, "Legal issues for investigator or counsel review");
  if (!selectedIssues.length) {
    lines.push("No federal issue selected. The reporter is asking the receiving agency to determine what law, if any, applies.");
  } else {
    selectedIssues.forEach((issue, index) => {
      lines.push(
        `${index + 1}. ${issue.cite} - ${issue.title}`,
        `   Threshold: ${issue.threshold}`,
        `   Records to evaluate: ${issue.collect.join("; ")}`,
        `   Official text: ${issue.officialUrl}`,
      );
    });
  }

  section(lines, "Proposed reporting routes");
  selectedRoutes.forEach((route, index) => {
    lines.push(
      `${index + 1}. ${route.name}`,
      `   Use when: ${route.useWhen}`,
      `   Caution: ${route.caution}`,
      `   Current official page: ${route.url}`,
    );
  });

  section(lines, "Submission and supplement log");
  if (!draft.submissions.length) {
    lines.push("No submission recorded yet. After filing, record the exact agency, date, and confirmation or reference number here.");
  } else {
    draft.submissions.forEach((submission, index) => {
      lines.push(
        `${index + 1}. ${clean(submission.agency)} - submitted ${clean(submission.date)}`,
        `   Confirmation or reference: ${clean(submission.reference)}`,
        `   Notes / supplement status: ${clean(submission.notes)}`,
      );
    });
  }

  section(lines, "Truthfulness declaration");
  lines.push(
    "I declare that this packet distinguishes my personal knowledge from records, third-party reports, and my own analysis. I have not intentionally included a statement I know is false. I understand that 18 U.S.C. § 1001 applies to materially false statements in matters within federal jurisdiction.",
    "",
    "Signature: ____________________________________",
    "Date: ________________________________________",
  );

  section(lines, "Final review checklist");
  lines.push(
    "[ ] I removed children's full names, Social Security numbers, account numbers, and unrelated medical details.",
    "[ ] I labeled every item by source status and did not present an allegation or charge as a finding.",
    "[ ] I kept originals and attached only copies or agency-requested uploads.",
    "[ ] I verified each reporting link and followed that agency's current instructions.",
    "[ ] I saved the submission confirmation and a complete copy of what I sent.",
    "[ ] I understand submission does not guarantee contact, investigation, charge, prosecution, or any case outcome.",
  );

  return `${lines.join("\n").trim()}\n`;
}

export function reportKitPacketFilename(extension: "txt" | "rtf" | "json"): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `Documentation-Reporting-Packet-${stamp}.${extension}`;
}

export function packetTextToRtf(text: string): string {
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/[^\x00-\x7F]/g, character => {
      const codeUnit = character.charCodeAt(0);
      const signedCodeUnit = codeUnit > 32_767 ? codeUnit - 65_536 : codeUnit;
      return `\\u${signedCodeUnit}?`;
    })
    .replace(/\n/g, "\\par\n");
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\fs24 ${escaped}}`;
}
