/**
 * GovInfo.gov API Integration
 * Pro Se Legal Platform
 *
 * Covers:
 *  - U.S. Code (USCODE)       → federal statutes cited in templates & AI answers
 *  - Code of Federal Regulations (CFR) → HIPAA (45 CFR 164), child welfare regs
 *  - Federal Register (FR)    → alerts when new rules affect family court
 *  - U.S. Courts (USCOURTS)   → federal court documents
 *  - Public Laws (PLAW)       → enacted legislation
 *
 * Authentication: API key via query param or X-Api-Key header
 * Base URL: https://api.govinfo.gov
 */

const GOVINFO_BASE = "https://api.govinfo.gov";

// ─── Store your key in an environment variable — never hardcode it ────────────
// In your .env file:  GOVINFO_API_KEY=your_key_here
// In Next.js:        process.env.GOVINFO_API_KEY
const API_KEY = process.env.GOVINFO_API_KEY;

// ─── Core fetch helper ────────────────────────────────────────────────────────
async function govFetch(path, params = {}) {
  const url = new URL(`${GOVINFO_BASE}${path}`);
  url.searchParams.set("api_key", API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
    next: { revalidate: 3600 } // cache for 1 hour (Next.js)
  });

  if (!res.ok) {
    throw new Error(`GovInfo API error: ${res.status} ${res.statusText} — ${path}`);
  }
  return res.json();
}

// ─── COLLECTIONS ─────────────────────────────────────────────────────────────

/**
 * List all available GovInfo collections.
 * Returns collection codes, labels, and date ranges.
 */
export async function listCollections() {
  return govFetch("/collections");
}

/**
 * Get packages in a collection from a start date.
 * @param {string} collectionCode  e.g. "USCODE", "CFR", "FR", "USCOURTS", "PLAW"
 * @param {string} startDate       ISO date string e.g. "2024-01-01T00:00:00Z"
 * @param {number} pageSize        default 10, max 100
 */
export async function getCollectionPackages(collectionCode, startDate, pageSize = 10) {
  return govFetch(`/collections/${collectionCode}/${startDate}`, { pageSize });
}

// ─── PACKAGES ────────────────────────────────────────────────────────────────

/**
 * Get metadata for a specific package.
 * @param {string} packageId  e.g. "USCODE-2022-title42", "CFR-2023-title45"
 */
export async function getPackage(packageId) {
  return govFetch(`/packages/${packageId}/summary`);
}

/**
 * Get granules (sections/parts) within a package.
 * @param {string} packageId
 * @param {number} pageSize
 */
export async function getGranules(packageId, pageSize = 20) {
  return govFetch(`/packages/${packageId}/granules`, { pageSize });
}

/**
 * Get a specific granule (individual section of law).
 * @param {string} packageId   e.g. "USCODE-2022-title42"
 * @param {string} granuleId   e.g. "USCODE-2022-title42-section5106a"
 */
export async function getGranule(packageId, granuleId) {
  return govFetch(`/packages/${packageId}/granules/${granuleId}`);
}

// ─── SEARCH ──────────────────────────────────────────────────────────────────

/**
 * Full-text search across GovInfo collections.
 * This is the primary function for the AI legal assistant.
 *
 * @param {string} query         Search terms
 * @param {string[]} collections Filter to specific collections e.g. ["USCODE","CFR"]
 * @param {number} pageSize      Results per page (max 100)
 * @param {string} offsetMark    Pagination token from previous result
 *
 * @returns {Object} { count, results: [{ packageId, granuleId, title, collectionCode, dateIssued, download }] }
 */
export async function searchGovInfo(query, collections = [], pageSize = 10, offsetMark = "*") {
  const params = {
    query,
    pageSize,
    offsetMark,
    resultLevel: "default"
  };
  if (collections.length > 0) {
    params.collection = collections.join(",");
  }
  return govFetch("/search", params);
}

// ─── U.S. CODE LOOKUPS ───────────────────────────────────────────────────────
// These are the federal statutes cited in all our templates.

/**
 * Look up a specific U.S. Code section by title and section number.
 * Uses the most recent available year of the U.S. Code.
 *
 * @param {number} title    e.g. 42 (Public Health & Welfare)
 * @param {string} section  e.g. "5106a"
 * @param {number} year     Optional year, defaults to most recent (2022)
 *
 * @example lookupUSCode(42, "5106a") → CAPTA child welfare records access
 * @example lookupUSCode(42, "671")   → foster care/adoption assistance
 */
export async function lookupUSCode(title, section, year = 2022) {
  const packageId = `USCODE-${year}-title${title}`;
  const granuleId = `USCODE-${year}-title${title}-section${section}`;

  try {
    const granule = await getGranule(packageId, granuleId);
    return {
      citation: `42 U.S.C. § ${section}`,
      title: granule.title,
      packageId,
      granuleId,
      pdfUrl: granule.download?.pdfLink,
      xmlUrl: granule.download?.xmlLink,
      textUrl: granule.download?.txtLink,
      source: "GovInfo.gov — U.S. Code (official)"
    };
  } catch {
    // Fall back to search if direct lookup fails
    return searchGovInfo(`title ${title} section ${section}`, ["USCODE"], 3);
  }
}

/**
 * Pre-built lookups for statutes cited in every platform template.
 * Call this to verify all federal citations before generating a document.
 */
export async function verifyTemplateFederalCitations() {
  const citations = [
    { title: 42, section: "5106a",  label: "CAPTA — child welfare records access" },
    { title: 42, section: "671",    label: "Foster care / adoption assistance" },
    { title: 42, section: "672",    label: "Foster care maintenance payments" },
    { title: 42, section: "1983",   label: "Civil rights violations (§ 1983 claims)" },
  ];

  const results = await Promise.allSettled(
    citations.map(c => lookupUSCode(c.title, c.section).then(r => ({ ...c, ...r })))
  );

  return results.map((r, i) => ({
    ...citations[i],
    status: r.status,
    data: r.status === "fulfilled" ? r.value : null,
    error: r.status === "rejected" ? r.reason?.message : null
  }));
}

// ─── CFR LOOKUPS (HIPAA & Child Welfare Regulations) ─────────────────────────

/**
 * Look up a Code of Federal Regulations section.
 *
 * @param {number} title    CFR title number e.g. 45 (HHS — includes HIPAA)
 * @param {number} part     CFR part number  e.g. 164 (HIPAA Security/Privacy)
 * @param {string} section  Section number   e.g. "524" (patient access to records)
 * @param {number} year     Year, defaults to most recent
 *
 * @example lookupCFR(45, 164, "524") → HIPAA right of access (cited in Psychologist template)
 * @example lookupCFR(45, 1355, "20") → child welfare program requirements
 */
export async function lookupCFR(title, part, section, year = 2023) {
  const packageId = `CFR-${year}-title${title}`;
  const granuleId = `CFR-${year}-title${title}-vol${getVolForTitle(title)}-sec${part}-${section}`;

  try {
    const granule = await getGranule(packageId, granuleId);
    return {
      citation: `${title} C.F.R. § ${part}.${section}`,
      title: granule.title,
      packageId,
      granuleId,
      pdfUrl: granule.download?.pdfLink,
      xmlUrl: granule.download?.xmlLink,
      source: "GovInfo.gov — Code of Federal Regulations (official)"
    };
  } catch {
    return searchGovInfo(`CFR title ${title} part ${part} section ${section}`, ["CFR"], 3);
  }
}

// Helper: approximate volume numbers for common CFR titles
function getVolForTitle(title) {
  const volMap = { 45: 1, 42: 1, 28: 1, 34: 1 };
  return volMap[title] || 1;
}

/**
 * Pre-built lookups for CFR sections cited in platform templates (especially HIPAA).
 */
export async function verifyHIPAACitations() {
  const hipaa = [
    { title: 45, part: 164, section: "524",    label: "HIPAA — right of access to PHI" },
    { title: 45, part: 164, section: "502",    label: "HIPAA — applicability" },
    { title: 45, part: 164, section: "524",    label: "HIPAA § 164.524(a)(1)(i) — psychotherapy notes exemption" },
    { title: 45, part: 1355, section: "20",   label: "Child welfare program requirements" },
    { title: 45, part: 1356, section: "21",   label: "Federal foster care requirements" },
  ];

  const results = await Promise.allSettled(
    hipaa.map(c => lookupCFR(c.title, c.part, c.section).then(r => ({ ...c, ...r })))
  );

  return results.map((r, i) => ({
    ...hipaa[i],
    status: r.status,
    data: r.status === "fulfilled" ? r.value : null,
    error: r.status === "rejected" ? r.reason?.message : null
  }));
}

// ─── FEDERAL REGISTER ALERTS ─────────────────────────────────────────────────

/**
 * Search the Federal Register for recent rules/notices affecting a topic.
 * Powers the "Federal Law Alerts" feature on user dashboards.
 *
 * @param {string} topic     e.g. "child welfare", "HIPAA", "family court", "foster care"
 * @param {string} startDate ISO date — how far back to look e.g. "2024-01-01T00:00:00Z"
 * @param {number} pageSize
 *
 * @returns Recent Federal Register entries matching the topic
 */
export async function getFederalRegisterAlerts(topic, startDate, pageSize = 5) {
  return getCollectionPackages("FR", startDate, pageSize).then(async (packages) => {
    // Also do a targeted search
    const searchResults = await searchGovInfo(topic, ["FR"], pageSize);
    return {
      recentPackages: packages,
      topicSearchResults: searchResults,
      query: topic,
      since: startDate
    };
  });
}

/**
 * Topics to monitor for each case type on the platform.
 * The platform runs these weekly and notifies users when new results appear.
 */
export const ALERT_TOPICS = {
  family_court:    ["child welfare", "family court", "parental rights", "foster care", "termination of parental rights"],
  bankruptcy:      ["bankruptcy exemptions", "means test", "automatic stay", "Chapter 7", "Chapter 13"],
  civil:           ["civil procedure", "discovery rules", "summary judgment"],
  child_welfare:   ["CAPTA", "foster care", "adoption", "reunification", "child abuse prevention"],
  hipaa:           ["HIPAA", "protected health information", "right of access", "psychotherapy notes"],
  housing:         ["eviction", "fair housing", "tenant rights", "habitability"],
};

// ─── DOCUMENT WRITING ASSISTANT ──────────────────────────────────────────────

/**
 * When a user asks the AI to help write a legal document, this function
 * fetches the relevant federal statutes and regulations to give the AI
 * accurate, current legal grounding.
 *
 * @param {string} documentType  e.g. "motion_to_compel", "records_request", "affidavit"
 * @param {string} caseType      e.g. "family_court", "dcf", "hipaa_records"
 * @param {string} state         User's state abbreviation e.g. "CA", "TX"
 *
 * @returns { federalStatutes, regulations, searchResults } — fed to the AI as context
 */
export async function getDocumentWritingContext(documentType, caseType, state) {
  const queries = getQueriesForDocument(documentType, caseType);

  const [statutes, regs, searchResults] = await Promise.allSettled([
    Promise.all(queries.statutes.map(s => lookupUSCode(s.title, s.section))),
    Promise.all(queries.cfr.map(c => lookupCFR(c.title, c.part, c.section))),
    searchGovInfo(`${queries.searchTerm} ${state}`, queries.collections, 5)
  ]);

  return {
    documentType,
    caseType,
    state,
    federalStatutes: statutes.status === "fulfilled" ? statutes.value : [],
    regulations: regs.status === "fulfilled" ? regs.value : [],
    searchResults: searchResults.status === "fulfilled" ? searchResults.value : {},
    timestamp: new Date().toISOString(),
    source: "GovInfo.gov — official U.S. government publications"
  };
}

/**
 * Map document types to the federal statutes and regs the AI needs.
 */
function getQueriesForDocument(documentType, caseType) {
  const map = {
    records_request: {
      statutes: [{ title: 42, section: "5106a" }],
      cfr: [{ title: 45, part: 164, section: "524" }],
      collections: ["USCODE", "CFR"],
      searchTerm: "parental access child welfare records"
    },
    motion_to_compel: {
      statutes: [{ title: 42, section: "1983" }],
      cfr: [],
      collections: ["USCODE", "USCOURTS"],
      searchTerm: "motion to compel discovery family court"
    },
    motion_to_modify_custody: {
      statutes: [{ title: 42, section: "5106a" }, { title: 42, section: "671" }],
      cfr: [{ title: 45, part: 1355, section: "20" }],
      collections: ["USCODE", "CFR"],
      searchTerm: "custody modification best interest child"
    },
    affidavit: {
      statutes: [],
      cfr: [],
      collections: ["USCODE"],
      searchTerm: `affidavit ${caseType} court`
    },
    exhibit_list: {
      statutes: [],
      cfr: [],
      collections: ["USCOURTS"],
      searchTerm: "exhibit list federal rules evidence"
    }
  };
  return map[documentType] || map.records_request;
}

// ─── LEGAL Q&A ENGINE ────────────────────────────────────────────────────────

/**
 * Powers the AI legal Q&A feature.
 * When a user asks a legal question, this fetches relevant official sources
 * before the AI generates its answer — so answers cite real, current law.
 *
 * @param {string} question    The user's legal question
 * @param {string} caseType    e.g. "family_court", "bankruptcy", "civil"
 * @param {string} state       User's state abbreviation
 *
 * @returns { govInfoResults, recommendedCitations } — context for AI answer
 *
 * @example
 *   const context = await getLegalQAContext(
 *     "Can DCF deny me access to my child's records?",
 *     "family_court", "TX"
 *   );
 *   // Then pass context to AI:
 *   const answer = await ai.answer(question, context);
 */
export async function getLegalQAContext(question, caseType, state) {
  // Search GovInfo with the question across relevant collections
  const collections = getCollectionsForCaseType(caseType);

  const [govInfoSearch, federalRegSearch] = await Promise.allSettled([
    searchGovInfo(question, collections, 5),
    searchGovInfo(question, ["FR"], 3)
  ]);

  // Also fetch standing statutes relevant to the case type
  const standingStatutes = await getStandingStatutes(caseType);

  return {
    question,
    caseType,
    state,
    govInfoResults: govInfoSearch.status === "fulfilled" ? govInfoSearch.value?.results || [] : [],
    federalRegisterResults: federalRegSearch.status === "fulfilled" ? federalRegSearch.value?.results || [] : [],
    standingStatutes,
    instructions: buildAIInstructions(state),
    timestamp: new Date().toISOString()
  };
}

function getCollectionsForCaseType(caseType) {
  const map = {
    family_court:  ["USCODE", "CFR", "USCOURTS"],
    bankruptcy:    ["USCODE", "USCOURTS"],
    civil:         ["USCODE", "USCOURTS"],
    child_welfare: ["USCODE", "CFR"],
    hipaa:         ["CFR", "USCODE"],
    housing:       ["USCODE", "CFR"]
  };
  return map[caseType] || ["USCODE", "CFR"];
}

async function getStandingStatutes(caseType) {
  const statutes = {
    family_court:  [{ title: 42, section: "5106a" }, { title: 42, section: "671" }],
    child_welfare: [{ title: 42, section: "5106a" }, { title: 42, section: "672" }],
    hipaa:         [],
    bankruptcy:    [{ title: 11, section: "362" }, { title: 11, section: "522" }],
    civil:         [{ title: 42, section: "1983" }],
  };

  const list = statutes[caseType] || [];
  const results = await Promise.allSettled(list.map(s => lookupUSCode(s.title, s.section)));
  return results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);
}

function buildAIInstructions(state) {
  return `You are a legal research assistant for pro se litigants in ${state}.
Use the GovInfo.gov sources provided as your primary citation basis for federal law.
Always cite the official source (e.g., "42 U.S.C. § 5106a, available at GovInfo.gov").
Remind users this is legal information, not legal advice, and to verify citations
with official sources before filing. For state law, note that results reflect federal
law only — the user should verify equivalent ${state} state statutes.`;
}

// ─── USER DOCUMENT ANALYSIS ──────────────────────────────────────────────────

/**
 * When a user uploads a court document to their vault and asks the AI questions,
 * this function searches GovInfo for laws relevant to the document's content.
 *
 * @param {string} documentText   Extracted text from the uploaded court document
 * @param {string} caseType       Detected or user-selected case type
 * @param {string} state          User's state
 *
 * @returns { relevantStatutes, relevantRegs, citations } to feed AI for document Q&A
 */
export async function getDocumentAnalysisContext(documentText, caseType, state) {
  // Extract key legal terms from the document text for targeted search
  const keyTerms = extractLegalTerms(documentText);

  const searchPromises = keyTerms.slice(0, 3).map(term =>
    searchGovInfo(term, getCollectionsForCaseType(caseType), 3)
  );

  const results = await Promise.allSettled(searchPromises);
  const allResults = results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value?.results || []);

  // Deduplicate by packageId
  const seen = new Set();
  const unique = allResults.filter(r => {
    if (seen.has(r.packageId)) return false;
    seen.add(r.packageId);
    return true;
  });

  return {
    documentType: caseType,
    state,
    keyTermsExtracted: keyTerms,
    relevantSources: unique.slice(0, 8),
    instructions: `Analyze the uploaded court document using the GovInfo.gov federal law sources provided.
    Answer questions about the document while citing relevant federal statutes.
    Note any federal law violations, rights, or procedures that apply to this document.`,
    timestamp: new Date().toISOString()
  };
}

/**
 * Extract legal terms from document text for GovInfo searches.
 * Simple keyword extraction — in production, use an AI call for smarter extraction.
 */
function extractLegalTerms(text) {
  const legalKeywords = [
    "parental rights", "child welfare", "HIPAA", "foster care", "custody",
    "visitation", "GAL", "guardian ad litem", "DCF", "DCS", "DFPS", "CPS",
    "termination", "reunification", "contempt", "discovery", "subpoena",
    "motion to compel", "affidavit", "declaration", "exhibit", "evidence",
    "due process", "equal protection", "14th amendment", "§ 1983",
    "bankruptcy", "automatic stay", "discharge", "exemption"
  ];

  return legalKeywords.filter(kw =>
    text.toLowerCase().includes(kw.toLowerCase())
  ).slice(0, 5);
}
