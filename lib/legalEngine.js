/**
 * Unified Legal Research Engine
 * Pro Se Legal Platform
 *
 * This is the master module that combines:
 *   GovInfo.gov    → Federal statutes (U.S. Code) + Regulations (CFR) + Federal Register
 *   CourtListener  → Case law (judicial opinions, state + federal)
 *   AI (Claude)    → Synthesis, Q&A, document writing, template adaptation
 *
 * ┌────────────────────────────────────────────────────────────┐
 * │                   USER ASKS A QUESTION                     │
 * └──────────────────────────┬─────────────────────────────────┘
 *                            │
 *           ┌────────────────┼────────────────┐
 *           ▼                ▼                ▼
 *     GovInfo.gov      CourtListener    User's Vault
 *   (What law says)  (How courts ruled)  (Their docs)
 *           │                │                │
 *           └────────────────┼────────────────┘
 *                            ▼
 *                      AI Synthesis
 *                (Combines all sources,
 *                 writes answer with
 *                 citations from all 3)
 *                            │
 *                            ▼
 *               ANSWER + DOWNLOADABLE DOCUMENT
 */

import {
  getLegalQAContext,
  getDocumentWritingContext,
  getDocumentAnalysisContext,
  getFederalRegisterAlerts,
  verifyTemplateFederalCitations,
  ALERT_TOPICS
} from "./govinfo.js";

import {
  getCaseLawForQuestion,
  getLandmarkCases,
} from "./courtlistener.js";

// ─── MAIN: ANSWER A LEGAL QUESTION ──────────────────────────────────────────
/**
 * The primary function powering the AI legal Q&A.
 *
 * Flow:
 *  1. Fetch relevant federal statutes from GovInfo
 *  2. Fetch relevant case law from CourtListener
 *  3. Find applicable landmark cases
 *  4. Combine everything into a context object
 *  5. Pass to AI to generate a cited, accurate answer
 *
 * @param {string} question    User's question
 * @param {string} state       User's state abbreviation e.g. "TX"
 * @param {string} caseType    e.g. "family_court", "child_welfare", "bankruptcy"
 * @param {string[]} vaultDocs Extracted text from user's uploaded documents (optional)
 *
 * @returns { answer, citations, sources, disclaimer }
 */
export async function answerLegalQuestion(question, state, caseType, vaultDocs = []) {
  // ── Step 1: Fetch from all three sources in parallel ──
  const [govInfoCtx, caseLawCtx] = await Promise.allSettled([
    getLegalQAContext(question, caseType, state),
    getCaseLawForQuestion(question, state, caseType),
  ]);

  // ── Step 2: Get applicable landmark cases ──
  const landmarks = getLandmarkCases(question + " " + caseType);

  // ── Step 3: Analyze user's vault documents if provided ──
  let vaultContext = null;
  if (vaultDocs.length > 0) {
    const combinedText = vaultDocs.join("\n\n");
    vaultContext = await getDocumentAnalysisContext(combinedText, caseType, state)
      .catch(() => null);
  }

  // ── Step 4: Build the AI prompt context ──
  const aiContext = buildAIContext({
    question,
    state,
    caseType,
    govInfo:    govInfoCtx.status === "fulfilled" ? govInfoCtx.value : null,
    caseLaw:    caseLawCtx.status === "fulfilled" ? caseLawCtx.value : null,
    landmarks,
    vaultContext
  });

  // ── Step 5: Return structured context (pass this to your AI API call) ──
  return {
    question,
    state,
    caseType,
    aiPrompt: aiContext.prompt,
    sources: {
      federalStatutes: aiContext.statutes,
      caseLaw:         aiContext.cases,
      landmarkCases:   landmarks,
      vaultDocuments:  vaultDocs.length > 0 ? "User documents analyzed" : null,
    },
    disclaimer: "This is legal information, not legal advice. Always verify citations with official sources and consult a licensed attorney in your state before filing.",
    timestamp: new Date().toISOString()
  };
}

function buildAIContext({ question, state, govInfo, caseLaw, landmarks, vaultContext }) {
  const statutes = govInfo?.standingStatutes || [];
  const cases = caseLaw?.cases || [];

  const statuteText = statutes.length > 0
    ? statutes.map(s => `• ${s.citation}: ${s.title || "Federal statute"}`).join("\n")
    : "No statutes pre-loaded — search GovInfo for relevant statutes.";

  const caseText = cases.length > 0
    ? cases.map(c => `• ${c.caseName}, ${c.citation} (${c.court}, ${c.year})\n  "${c.snippet}"`).join("\n")
    : "No matching cases found in CourtListener.";

  const landmarkText = landmarks.length > 0
    ? landmarks.map(l => `• ${l.name}, ${l.citation}: ${l.holding}`).join("\n")
    : "";

  const vaultText = vaultContext
    ? `\n\nUSER'S UPLOADED DOCUMENTS:\nKey terms detected: ${vaultContext.keyTermsExtracted.join(", ")}\nRelevant sources found: ${vaultContext.relevantSources.length}`
    : "";

  const prompt = `You are a legal research assistant for a pro se litigant in ${state}.
The user has asked: "${question}"

FEDERAL STATUTES (from GovInfo.gov — official U.S. government source):
${statuteText}

RELEVANT CASE LAW (from CourtListener):
${caseText}

LANDMARK CASES that may apply:
${landmarkText}
${vaultText}

INSTRUCTIONS:
- Answer the question clearly and practically for someone representing themselves in ${state} court
- Cite specific statutes and cases from the sources above
- Note where state law may differ from federal law and that they should check their state's equivalent statutes
- Explain what the user can DO — not just what the law says
- Flag any deadlines, filing requirements, or procedural traps they should know about
- End with: "This is legal information, not legal advice. Verify citations with official sources and consult a licensed attorney in ${state} if possible."
- Keep your answer focused and practical — no more than 400 words`;

  return { prompt, statutes, cases };
}

// ─── DOCUMENT WRITING WITH GOVINFO + COURTLISTENER ───────────────────────────

/**
 * Help the AI write a legal document grounded in current law.
 * Used when user says "help me write a motion" or "draft my affidavit."
 *
 * @param {string} documentType  e.g. "motion_to_compel", "affidavit", "records_request"
 * @param {string} state         User's state
 * @param {string} caseType      e.g. "family_court"
 * @param {Object} userFacts     Facts from user: { childrenNames, caseNumber, courtName, ... }
 */
export async function getDocumentDraftingContext(documentType, state, caseType, userFacts = {}) {
  const [govInfoCtx, caseLawCtx] = await Promise.allSettled([
    getDocumentWritingContext(documentType, caseType, state),
    getCaseLawForQuestion(`${documentType} ${caseType}`, state, caseType)
  ]);

  const statutes = govInfoCtx.status === "fulfilled"
    ? govInfoCtx.value?.federalStatutes || []
    : [];
  const cases = caseLawCtx.status === "fulfilled"
    ? caseLawCtx.value?.cases || []
    : [];

  // State-specific statute data previously came from state_data.json, which is
  // not part of this app. Keep the current no-data fallback explicit.
  const stateStatutes = await loadStateStatutes(state, caseType);

  return {
    documentType,
    state,
    caseType,
    userFacts,
    federalStatutes: statutes,
    stateStatutes,
    supportingCases: cases,
    landmarkCases: getLandmarkCases(caseType),
    templateInstructions: getTemplateInstructions(documentType, state),
    disclaimer: "Always have a licensed attorney review any document before filing."
  };
}

async function loadStateStatutes() {
  return [];
}

function getTemplateInstructions(documentType, state) {
  const instructions = {
    records_request: `Draft a formal records request letter for ${state}. Include: (1) specific records requested, (2) legal authority, (3) response deadlines, (4) non-compliance consequences. Use formal legal letter format.`,
    motion_to_compel: `Draft a Motion to Compel Discovery for ${state} court. Include: (1) caption, (2) introduction, (3) factual background, (4) legal argument citing FRCP Rule 37, (5) prayer for relief.`,
    motion_to_modify: `Draft a Motion to Modify Custody/Visitation for ${state}. Include: (1) caption, (2) statement of case, (3) change in circumstances, (4) best interest factors, (5) proposed modification, (6) prayer for relief.`,
    affidavit: `Draft an Affidavit/Declaration for ${state} court. Include: (1) caption, (2) identification, (3) sworn statement of facts (numbered paragraphs), (4) signature block with notary.`,
    objection_to_gal: `Draft an Objection to GAL Report for ${state}. Include: (1) caption, (2) procedural history, (3) specific objections to GAL findings, (4) alternative recommendations, (5) conclusion.`,
    contempt: `Draft a Motion for Contempt for ${state}. Include: (1) caption, (2) introduction, (3) prior court orders violated, (4) specific violations, (5) requested relief including sanctions.`,
  };
  return instructions[documentType] || `Draft a ${documentType} document for ${state} court. Cite relevant statutes and case law.`;
}

// ─── TEMPLATE STATE ADAPTATION WITH GOVINFO VERIFICATION ────────────────────

/**
 * Adapt a records request template to a specific state AND verify
 * all federal citations are current using GovInfo.
 *
 * @param {string} templateType  e.g. "dcf", "gal", "kvc", "psychologist", "supervised_visitation"
 * @param {string} state         Target state abbreviation
 */
export async function adaptTemplateForState(templateType, state) {
  // Verify federal citations are current
  const citationCheck = await verifyTemplateFederalCitations().catch(() => null);

  const stateData = null;

  return {
    templateType,
    state,
    stateData,
    federalCitationStatus: citationCheck,
    adaptationInstructions: buildAdaptationInstructions(templateType, state, stateData),
    timestamp: new Date().toISOString()
  };
}

function buildAdaptationInstructions(templateType, state, stateData) {
  if (!stateData) return `State data not found for ${state}. Adaptation cannot be performed.`;

  return {
    replaceAgency: {
      from: "Kansas Department for Children and Families (DCF)",
      to: stateData.child_welfare_agency
    },
    replaceContractedAgency: {
      from: "KVC Kansas",
      to: stateData.contracted_agencies
    },
    replaceOpenRecordsLaw: {
      from: "Kansas Open Records Act (K.S.A. 45-215 et seq.)",
      to: stateData.open_records_law
    },
    replaceStatutes: stateData.records_access_statutes,
    replaceConstitution: stateData.state_constitution,
    replaceGALStatute: stateData.gal_statute,
    updateDeadlines: stateData.records_deadline_days !== 30
      ? `Update response deadline to ${stateData.records_deadline_days} business days per ${stateData.open_records_law}`
      : "Deadline unchanged (30 days standard)",
    stateNotes: stateData.notes
  };
}

// ─── FEDERAL REGISTER MONITORING ─────────────────────────────────────────────

/**
 * Check for recent federal law changes affecting a user's case type.
 * Run this weekly for all active subscribers.
 *
 * @param {string} caseType  User's primary case type
 * @param {Date}   since     Date to check from (default: 30 days ago)
 */
export async function checkForLegalUpdates(caseType, since = null) {
  const startDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const isoDate = startDate.toISOString();

  const topics = ALERT_TOPICS[caseType] || ALERT_TOPICS.family_court;

  const alerts = await Promise.allSettled(
    topics.slice(0, 3).map(topic => getFederalRegisterAlerts(topic, isoDate, 3))
  );

  const results = alerts
    .filter(a => a.status === "fulfilled")
    .map((a, i) => ({ topic: topics[i], ...a.value }));

  return {
    caseType,
    since: isoDate,
    alertsFound: results.filter(r => (r.topicSearchResults?.results?.length || 0) > 0),
    total: results.length
  };
}

// ─── EXPORT SUMMARY FOR DEVELOPER REFERENCE ──────────────────────────────────

export const API_SUMMARY = {
  govinfo: {
    base:    "https://api.govinfo.gov",
    keyVar:  "GOVINFO_API_KEY",
    covers:  ["U.S. Code (USCODE)", "Code of Federal Regulations (CFR)", "Federal Register (FR)", "U.S. Courts (USCOURTS)", "Public Laws (PLAW)"],
    rateLimit: "1,000 requests/hour with API key",
    signup:  "https://api.govinfo.gov/api-signup/"
  },
  courtlistener: {
    base:    "https://www.courtlistener.com/api/rest/v3",
    keyVar:  "COURTLISTENER_API_KEY",
    covers:  ["Judicial opinions (state + federal)", "Dockets", "PACER documents", "Citation networks"],
    rateLimit: "5,000 requests/day on free tier",
    signup:  "https://www.courtlistener.com/sign-in/"
  }
};
