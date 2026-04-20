/**
 * CourtListener API Integration
 * Pro Se Legal Platform
 *
 * CourtListener covers:
 *  - Case law / judicial opinions (state + federal)
 *  - Docket entries
 *  - Court filings (PACER data)
 *  - Judges
 *  - Citation networks
 *
 * Paired with GovInfo (statutes + regulations), this gives the AI
 * complete legal research capability: what the law says + how courts ruled.
 *
 * Base URL: https://www.courtlistener.com/api/rest/v3
 * Auth: Token in header  Authorization: Token YOUR_KEY
 */

const CL_BASE = process.env.COURTLISTENER_BASE_URL || "https://www.courtlistener.com/api/rest/v4";
const CL_KEY  = process.env.COURTLISTENER_API_KEY;

async function clFetch(path, params = {}) {
  const url = new URL(`${CL_BASE}${path}/`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      "Authorization": `Token ${CL_KEY}`,
      "Content-Type": "application/json"
    },
    next: { revalidate: 3600 }
  });

  if (!res.ok) throw new Error(`CourtListener error: ${res.status} — ${path}`);
  return res.json();
}

// ─── OPINION SEARCH ───────────────────────────────────────────────────────────

/**
 * Search court opinions — the core of case law research.
 *
 * @param {string} query       Search terms e.g. "parental rights termination DCF"
 * @param {string} state       State abbreviation e.g. "TX", "CA", "FL" (or null for federal)
 * @param {string} type        "o" = opinions (default), "r" = RECAP docs, "p" = people
 * @param {number} pageSize    Results per page
 *
 * @returns { count, results: [{ caseName, court, dateFiled, citation, absoluteUrl, snippet }] }
 */
export async function searchOpinions(query, state = null, type = "o", _pageSize = 10) {
  const params = {
    q: query,
    type,
    order_by: "score desc",
    stat_Precedential: "on",
    format: "json"
  };

  if (state) {
    // Filter to state courts + federal courts in that state
    params.court = getStateCourtCodes(state).join(",");
  }

  return clFetch("/search", params);
}

/**
 * Search for opinions citing a specific statute or case.
 * Useful for: "Show me cases where courts ruled on parental access to DCF records."
 */
export async function searchOpinionsByCitation(citation, state = null) {
  return searchOpinions(`"${citation}"`, state, "o", 10);
}

// ─── DOCKET SEARCH ────────────────────────────────────────────────────────────

/**
 * Search court dockets.
 * Useful for finding similar pro se cases and seeing how they were handled.
 */
export async function searchDockets(query, state = null) {
  const params = { q: query, type: "r", format: "json" };
  if (state) params.court = getStateCourtCodes(state).join(",");
  return clFetch("/search", params);
}

// ─── SPECIFIC OPINION LOOKUP ──────────────────────────────────────────────────

/**
 * Get full text of a specific opinion by its CourtListener ID.
 */
export async function getOpinion(opinionId) {
  return clFetch(`/opinions/${opinionId}`);
}

/**
 * Get the cluster (group of opinions from same case) with full citation info.
 */
export async function getCluster(clusterId) {
  return clFetch(`/clusters/${clusterId}`);
}

// ─── COURT INFO ───────────────────────────────────────────────────────────────

/**
 * Get info about a specific court by its code.
 */
export async function getCourt(courtId) {
  return clFetch(`/courts/${courtId}`);
}

// ─── CITATION LOOKUP ──────────────────────────────────────────────────────────

/**
 * Find a case by its citation string.
 * @param {string} citation  e.g. "530 U.S. 57" (Troxel v. Granville)
 */
export async function findCaseByCitation(citation) {
  return clFetch("/search", { q: `"${citation}"`, type: "o", format: "json" });
}

// ─── LEGAL Q&A SUPPORT ────────────────────────────────────────────────────────

/**
 * For the AI legal assistant: find relevant case law for a user's question.
 * Returns formatted citations ready to include in AI answers.
 *
 * @param {string} question    User's legal question
 * @param {string} state       User's state
 * @param {string} caseType    e.g. "family_court", "child_welfare"
 *
 * @returns { cases: [{ citation, caseName, court, year, snippet, url }] }
 */
export async function getCaseLawForQuestion(question, state, caseType) {
  const queries = buildCaseLawQueries(question, caseType);

  const results = await Promise.allSettled(
    queries.map(q => searchOpinions(q, state, "o", 5))
  );

  const allCases = results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value?.results || []);

  // Deduplicate
  const seen = new Set();
  const unique = allCases.filter(c => {
    if (seen.has(c.caseName)) return false;
    seen.add(c.caseName);
    return true;
  });

  return {
    cases: unique.slice(0, 8).map(formatCase),
    state,
    caseType,
    queryUsed: queries[0]
  };
}

function formatCase(c) {
  return {
    caseName:  c.caseName || "Unknown",
    citation:  c.citation  || "",
    court:     c.court     || "",
    year:      c.dateFiled ? new Date(c.dateFiled).getFullYear() : "",
    snippet:   c.snippet   || "",
    url:       `https://www.courtlistener.com${c.absoluteUrl || ""}`,
    source:    "CourtListener.com"
  };
}

function buildCaseLawQueries(question, caseType) {
  const baseQueries = {
    family_court:  ["parental rights family court", "custody modification best interest child"],
    child_welfare: ["parental rights DCF child protective services", "termination parental rights due process"],
    hipaa:         ["HIPAA right of access medical records", "protected health information disclosure"],
    bankruptcy:    ["automatic stay family court", "bankruptcy exemption"],
    civil:         ["civil rights due process"],
  };

  const base = baseQueries[caseType] || ["pro se litigant rights"];

  // Add question-specific terms
  const questionWords = question.split(" ")
    .filter(w => w.length > 4)
    .slice(0, 4)
    .join(" ");

  return [questionWords, ...base].filter(Boolean);
}

// ─── ALWAYS-CITE LANDMARK CASES ───────────────────────────────────────────────

/**
 * Landmark cases that apply across all family court / child welfare matters.
 * The AI cites these proactively when relevant.
 */
export const LANDMARK_CASES = [
  {
    name:     "Troxel v. Granville",
    citation: "530 U.S. 57 (2000)",
    holding:  "Parents have a fundamental constitutional right to make decisions concerning the care, custody, and control of their children. State interference requires compelling justification.",
    relevance: ["custody", "visitation", "parental rights", "DCF", "GAL", "child welfare"],
    url:      "https://www.courtlistener.com/?q=%22Troxel+v.+Granville%22&type=o"
  },
  {
    name:     "Santosky v. Kramer",
    citation: "455 U.S. 745 (1982)",
    holding:  "Before a State may sever the parent-child relationship, it must support its allegations by at least clear and convincing evidence.",
    relevance: ["termination of parental rights", "burden of proof", "DCF", "child welfare"],
    url:      "https://www.courtlistener.com/?q=%22Santosky+v.+Kramer%22&type=o"
  },
  {
    name:     "Stanley v. Illinois",
    citation: "405 U.S. 645 (1972)",
    holding:  "Parents have a protectable interest in maintaining their relationship with their children. Due process is required before that interest can be terminated.",
    relevance: ["due process", "parental rights", "DCF", "termination", "unmarried fathers"],
    url:      "https://www.courtlistener.com/?q=%22Stanley+v.+Illinois%22&type=o"
  },
  {
    name:     "Meyer v. Nebraska",
    citation: "262 U.S. 390 (1923)",
    holding:  "The right to establish a home and raise children is a fundamental liberty interest protected by the 14th Amendment.",
    relevance: ["parental rights", "fundamental rights", "due process"],
    url:      "https://www.courtlistener.com/?q=%22Meyer+v.+Nebraska%22&type=o"
  },
  {
    name:     "Pierce v. Society of Sisters",
    citation: "268 U.S. 510 (1925)",
    holding:  "Parents have the right to direct the upbringing and education of their children.",
    relevance: ["parental rights", "education", "custody"],
    url:      "https://www.courtlistener.com/?q=%22Pierce+v.+Society+of+Sisters%22&type=o"
  }
];

/**
 * Get landmark cases relevant to a specific topic.
 */
export function getLandmarkCases(topic) {
  const t = topic.toLowerCase();
  return LANDMARK_CASES.filter(c =>
    c.relevance.some(r => t.includes(r) || r.includes(t))
  );
}

// ─── STATE COURT CODE MAPPING ─────────────────────────────────────────────────

/**
 * CourtListener court codes for each state's courts.
 * Used to filter search results to relevant courts.
 */
function getStateCourtCodes(stateAbbr) {
  const courts = {
    AL: ["ala", "almd", "alnd", "alsd"],
    AK: ["alaska", "akd"],
    AZ: ["ariz", "azd"],
    AR: ["ark", "ared", "arwd"],
    CA: ["cal", "cacd", "caed", "cand", "casd"],
    CO: ["colo", "cod"],
    CT: ["conn", "ctd"],
    DE: ["del", "ded"],
    FL: ["fla", "flmd", "flnd", "flsd"],
    GA: ["ga", "gamd", "gand", "gasd"],
    HI: ["haw", "hid"],
    ID: ["idaho", "idd"],
    IL: ["ill", "ilcd", "ilnd", "ilsd"],
    IN: ["ind", "innd", "insd"],
    IA: ["iowa", "iand", "iasd"],
    KS: ["kan", "ksd"],
    KY: ["ky", "kyed", "kywd"],
    LA: ["la", "laed", "lamd", "lawd"],
    ME: ["me", "med"],
    MD: ["md", "mdd"],
    MA: ["mass", "mad"],
    MI: ["mich", "mied", "miwd"],
    MN: ["minn", "mnd"],
    MS: ["miss", "msnd", "mssd"],
    MO: ["mo", "moed", "mowd"],
    MT: ["mont", "mtd"],
    NE: ["neb", "ned"],
    NV: ["nev", "nvd"],
    NH: ["nh", "nhd"],
    NJ: ["nj", "njd"],
    NM: ["nm", "nmd"],
    NY: ["ny", "nyed", "nynd", "nysd", "nywd"],
    NC: ["nc", "nced", "ncmd", "ncwd"],
    ND: ["nd", "ndd"],
    OH: ["ohio", "ohnd", "ohsd"],
    OK: ["okla", "oked", "oknd", "okwd"],
    OR: ["or", "ord"],
    PA: ["pa", "paed", "pamd", "pawd"],
    RI: ["ri", "rid"],
    SC: ["sc", "scd"],
    SD: ["sd", "sdd"],
    TN: ["tenn", "tned", "tnmd", "tnwd"],
    TX: ["tex", "txed", "txnd", "txsd", "txwd"],
    UT: ["utah", "utd"],
    VT: ["vt", "vtd"],
    VA: ["va", "vaed", "vawd"],
    WA: ["wash", "waed", "wawd"],
    WV: ["wva", "wvnd", "wvsd"],
    WI: ["wis", "wied", "wiwd"],
    WY: ["wyo", "wyd"],
  };
  return courts[stateAbbr?.toUpperCase()] || [];
}
