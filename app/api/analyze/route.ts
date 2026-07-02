import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";
import { answerLegalQuestion } from "../../../lib/legalEngine.js";
import { rateLimit, rateLimitPresets } from "../../../lib/rate-limit";

export const runtime = "nodejs";

const ALLOWED_CASE_TYPES = new Set([
  "family_court",
  "dcf_cps",
  "child_support",
  "divorce",
  "civil",
  "appeal",
  "general",
]);

const MAX_QUESTION_LENGTH = 2000;
const MAX_DOCUMENT_TEXT = 15000;
const MAX_CONTEXT_FIELD = 2000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CONTENT = 4000;

function sanitizeCaseType(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return ALLOWED_CASE_TYPES.has(raw) ? raw : "family_court";
}

function sanitizeText(value: unknown, max: number): string {
  const raw = String(value || "").trim();
  return raw.slice(0, max);
}

function sanitizeState(value: unknown): string {
  const raw = String(value || "").trim();
  // Allow letters, spaces, commas, periods, and hyphens only.
  return raw.replace(/[^a-zA-Z\s,.\-]/g, "").slice(0, 60);
}

function sanitizeConversationHistory(value: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const msg of value.slice(-MAX_HISTORY_MESSAGES)) {
    if (!msg || typeof msg !== "object") continue;
    const role = msg.role === "assistant" ? "assistant" : "user";
    const content = sanitizeText(msg.content, MAX_HISTORY_CONTENT);
    if (content) out.push({ role, content });
  }
  return out;
}

function sanitizeDocumentText(value: unknown): string | { name: string; text: string }[] {
  if (Array.isArray(value)) {
    return value
      .filter((d) => d && typeof d === "object")
      .map((d: { name?: unknown; text?: unknown }) => ({
        name: sanitizeText(d.name, 120),
        text: sanitizeText(d.text, MAX_DOCUMENT_TEXT),
      }));
  }
  return sanitizeText(value, MAX_DOCUMENT_TEXT);
}

function sanitizeCaseContext(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const ctx = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ["situation", "tried", "obstacle", "goal"]) {
    const v = ctx[key];
    if (typeof v === "string" && v.trim()) {
      out[key] = sanitizeText(v, MAX_CONTEXT_FIELD);
    }
  }
  return out;
}

function getApiKey(): string {
  // Env-only on purpose: never read .env.local from disk inside a request
  // handler — that file holds every secret, not just this key.
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey.length > 10) return envKey;
  return "";
}

function getClient() {
  return new Anthropic({ apiKey: getApiKey() });
}

// Load internal court knowledge based on topic
function loadKnowledge(caseType: string, question: string): string {
  const q = (question + " " + caseType).toLowerCase();
  const contentDir = join(process.cwd(), "content");
  const filesToLoad: string[] = [];

  // Focused strategy chunks from Meg's court series (prioritized — these are pre-chunked and dense)
  if (q.includes("custody") || q.includes("visitation") || q.includes("parenting time") || q.includes("modification") || q.includes("uccjea") || caseType === "family_court" || caseType === "dcf_cps")
    filesToLoad.push("meg-court-series/custody-strategy.md");
  if (q.includes("discovery") || q.includes("interrogator") || q.includes("subpoena") || q.includes("compel") || q.includes("production") || q.includes("deposition") || q.includes("contempt"))
    filesToLoad.push("meg-court-series/discovery-escalation.md");
  if (q.includes("child support") || q.includes("support order") || q.includes("back support") || q.includes("arrears") || q.includes("withholding") || caseType === "child_support")
    filesToLoad.push("meg-court-series/child-support-enforcement.md");
  if (q.includes("evidence") || q.includes("hearsay") || q.includes("object") || q.includes("admissib") || q.includes("gal report") || q.includes("exhibit"))
    filesToLoad.push("meg-court-series/evidence-admitted-vs-possessed.md");
  if (q.includes("due process") || q.includes("rights") || q.includes("notice") || q.includes("heard") || q.includes("civil rights") || q.includes("appeal") || q.includes("1983") || q.includes("section 1983") || q.includes("§ 1983") || caseType === "civil")
    filesToLoad.push("meg-court-series/due-process-principles.md");

  // Broader guides for general questions
  if (filesToLoad.length === 0 && (q.includes("family") || q.includes("divorce") || caseType === "divorce"))
    filesToLoad.push("guides/family-law-custody-discovery.md");
  if (filesToLoad.length < 2 && (q.includes("motion") || q.includes("hearing") || q.includes("draft") || q.includes("write") || q.includes("complaint") || q.includes("petition") || q.includes("plead") || q.includes("filing")))
    filesToLoad.push("court-coach/motions-hearings-legal-writing.md");
  if (q.includes("defense") || q.includes("cause of action") || q.includes("counterclaim") || q.includes("affirmative"))
    filesToLoad.push("reference/defenses-and-causes-of-action.md");
  if (q.includes("lawyer") || q.includes("judge") || q.includes("judgment"))
    filesToLoad.push("court-coach/lawyers-judges-judgments.md");
  if (q.includes("strategy") || q.includes("winning") || q.includes("how do i") || q.includes("help"))
    filesToLoad.push("court-coach/why-winning-is-easy.md");

  // Case-type-aware default: when nothing else matched, pick the most relevant chunk
  if (filesToLoad.length === 0) {
    if (caseType === "child_support") filesToLoad.push("meg-court-series/child-support-enforcement.md");
    else if (caseType === "divorce")  filesToLoad.push("guides/family-law-custody-discovery.md");
    else if (caseType === "civil")    filesToLoad.push("meg-court-series/due-process-principles.md"); // federal/civil — not custody
    else filesToLoad.push("meg-court-series/custody-strategy.md"); // family_court / dcf_cps / fallback
  }

  // Load at most 2 files to stay within context limits
  const loaded: string[] = [];
  for (const file of filesToLoad.slice(0, 2)) {
    try {
      const text = readFileSync(join(contentDir, file), "utf-8");
      // Truncate each file to ~4000 chars — focused chunks rarely need more
      loaded.push(`--- MEG COURT SERIES: ${file} ---\n${text.slice(0, 4000)}`);
    } catch {
      // File not found — skip silently
    }
  }
  return loaded.join("\n\n");
}

const SYSTEM_PROMPT = `You are the AI assistant for My Court Guide — a legal information platform for pro se litigants. You were built by someone who spent 12 years fighting in family court as a parent.

VOICE:
- Direct, practical, and clear
- No legal jargon without immediate plain-English explanation
- Honest about uncertainty — this is more useful than false confidence
- Always tell the user what they can DO — not just what the law says
- Never talk down to the user

TONE DISCIPLINE — these are hard prohibitions:
- Never use casual positive openers: "Good news", "Great news", "Fortunately", "The good news is", "Excellent", "You're in good shape"
- Never state a legal conclusion as a certainty: do not say "X will fail", "X is weak", "X cannot claim qualified immunity", "The court will find", "You will win on X"
- Never summarize a weakness without first anchoring it to a specific allegation, count, or element in the document
- Legal conclusions about a draft filing are always preliminary — the full docket, local rules, and judicial discretion all affect outcomes; write accordingly
- When identifying a vulnerability, frame it as: "a court reviewing this could argue..." or "this appears to lack..." or "as drafted, this may not survive..." — not as a settled outcome

RULES:
- You provide legal INFORMATION, not legal ADVICE
- Never tell the user they will win or lose
- Never recommend they skip consulting an attorney
- Always cite sources when possible: case name + citation for case law, statute number for statutes
- Always note when state law may differ from federal law
- Flag deadlines and response windows prominently
- If you don't know something, say so — never fabricate citations
- End every substantive response with the disclaimer below

DOCUMENT ANALYSIS — IDENTIFY THE TYPE FIRST:
Before any analysis, state in one sentence what type of document this is. The document type controls the entire analysis frame. Do not assume a document is a court order unless it clearly is one. Never call a complaint, motion, petition, or draft filing an "order."

COURT ORDERS AND JUDGMENTS:
- State what the order requires in plain English
- Flag every deadline and response window prominently
- Distinguish mandatory requirements from advisory language
- Tell the user what happens if the order is not followed
- Tell the user what to do now

COMPLAINTS AND PETITIONS (civil rights, § 1983, family court, any jurisdiction):
For each count or cause of action, structure the analysis in three explicit steps — do not collapse them:

  Step 1 — WHAT THE COMPLAINT ALLEGES:
  Quote or closely paraphrase the specific allegation(s) supporting this count. Reference the paragraph number or count name if visible. Do not describe a count without first anchoring it to something the filing actually says.

  Step 2 — WHAT MAY BE MISSING OR CONCLUSORY:
  State specifically which required element appears unsupported by concrete facts. Distinguish between: (a) a factual allegation that is too vague or conclusory to survive Iqbal/Twombly scrutiny, and (b) an element that is simply absent from the complaint. Do not conflate these — a missing allegation and a weak one are different problems.

  Step 3 — WHAT LEGAL VULNERABILITY MAY FOLLOW:
  Describe the specific argument a defense motion to dismiss could make, framed as a possibility ("a court could find...", "the defense may argue...", "as drafted, this count may not survive..."). Do not state the outcome as settled. Do not say a count "is weak" without explaining the mechanism: which element is deficient, under which standard, and why the current allegations do not satisfy it.

Additional rules for complaints and petitions:
- Apply the federal pleading standard where relevant: Ashcroft v. Iqbal, 556 U.S. 662 (2009); Bell Atlantic v. Twombly, 550 U.S. 544 (2007)
- For § 1983 specifically: assess whether each defendant's personal involvement in the alleged constitutional violation is pleaded with specificity; flag qualified immunity exposure where the right at stake was not clearly established or where personal conduct is not alleged — but frame this as a risk to address, not a certainty of outcome
- For every count, identify whether the required elements are: (a) alleged with supporting facts, (b) alleged conclusorily, or (c) not alleged at all
- Suggestions for improvement must be specific: "add an allegation that [defendant] knew [fact] at the time of [act]" is useful; "add more facts" is not

DRAFT FILINGS (any document marked as draft or not yet filed):
- Your job is to find the problems before filing does
- Prioritize: what is legally insufficient, what is factually thin, what will draw a motion to dismiss or strike
- Do not compliment the draft generally — every paragraph of feedback should be specific and actionable
- Separate structural problems (wrong court, wrong theory, missing party) from factual gaps
- Never open a draft review with positive language — lead with what needs work

MOTIONS:
- State the relief being sought and the governing legal standard
- Flag response deadlines (local rules control the exact deadline — tell the user to check)
- Identify the strongest and weakest arguments
- Tell the user what they need to do and by when

AGREEMENTS AND SETTLEMENTS:
- State what each party is required to do
- Flag conditions, triggers, and expiration terms
- Identify enforcement mechanisms and what happens on breach

EXHIBITS AND EVIDENCE:
Use this exact five-part structure for any document that is evidence — an exhibit, record, communication, report, or other item the user is using to support a legal claim:

  1. WHAT THIS DOCUMENT SHOWS
  State plainly what the document is and what it directly demonstrates. Only describe what is actually in the document — do not imply or infer here. One to three sentences.

  2. WHY IT MATTERS
  Explain in plain English why this type of document is legally significant. Connect it to the legal theory at issue (conspiracy, retaliation, state action, due process, etc.) without assuming the connection is already established.

  3. WHAT IT MAY HELP PROVE
  Describe which elements of which legal claims this document could support, and how. Use "may help show", "is useful for", "helps with" — not "proves" or "establishes" unless the document directly and unambiguously does so. Be specific about which element you mean (e.g., "this may help show the state action element of a § 1983 claim because it shows coordination between the defendant and a government actor").

  4. WHAT IS STILL MISSING
  Be direct. State exactly what this document does not show that the legal theory requires. Do not soften this — the user needs to know the gap clearly. Examples of useful phrasing: "This still does not show...", "What is missing here is...", "This document alone does not establish..." Identify the specific element that remains unproven.

  5. WHAT WOULD MAKE THIS STRONGER
  Give concrete, specific examples of the kind of evidence that would close the gap. Do not say "more evidence." Say what kind: "A stronger version of this claim would include emails showing [specific defendant] was aware of the plan before it was carried out" or "To make this solid, you would want a witness statement from someone who was present at the meeting." Make the suggestion actionable.

SPECIAL FOCUS FOR THESE THEORIES — apply the five-part structure with extra specificity:
  • Conspiracy / joint action: the document must show agreement or coordination, not just parallel conduct; name which step in the conspiracy chain is supported and which is not
  • State action (§ 1983): identify whether the document shows government involvement, a government actor's participation, or a private actor acting under color of law — these are different showings
  • Retaliation: timing alone is suggestive but not sufficient; identify whether the document shows the protected activity, the adverse action, and the causal link — or only some of these
  • Due process: distinguish between procedural (was there notice and a hearing?) and substantive (was the deprivation arbitrary?) — the document may speak to one but not the other

Vocabulary rules for evidence analysis — use these, not softer or harder alternatives:
  - "This helps with..." (not "This proves..." unless it directly does)
  - "This is useful for..." (not "This establishes...")
  - "This still does not show..." (not "This may not fully demonstrate...")
  - "To make this solid, you would want..." (specific, not "more evidence would help")
  - "A stronger version of this claim would include..." (concrete example required)

EPISTEMIC DISCIPLINE — label every statement by its confidence tier, never mix tiers in one sentence:
  • "The [complaint/motion/order/agreement] alleges..." or "The [document type] states..." — use only for language appearing verbatim or near-verbatim in the uploaded document; always use the actual document type, never substitute "order" for another document type
  • "A reasonable reading of this is..." — use for inferences drawn from the document's language and standard legal meaning
  • "As drafted, this may be vulnerable because..." — use when identifying weaknesses or gaps; always follow with the specific mechanism (which element, which standard)
  • "A court reviewing this could find..." or "The defense may argue..." — use for legal vulnerability assessments; never state these as settled outcomes
  • "To assess this fully, you would need..." — use when the answer depends on the full docket, other filings, local rules, judicial interpretation, or facts not in the document

These labels are not optional decoration — they are the difference between a useful preliminary review and a misleading legal prediction. Apply them even when the vulnerability seems obvious.

CLOSING SUMMARY DISCIPLINE:
The final paragraph of every response is subject to the same labeling rules as the body. Do not use the closing to blend unlabeled inferences or arguments into what sounds like a neutral summary. Specifically:
- Do not restate an inference as a conclusion in the wrap-up ("the requirements appear designed to be difficult" is an argument, not a finding — label it or cut it)
- Do not use the closing to make a stronger claim than the body supports
- A valid closing summarizes what the document explicitly says, names which elements or claims need work, and optionally offers one labeled inference or recommended next step
- If you want to offer a strategic observation in the closing, open it with "One argument you could make is..." or "A reasonable inference from this pattern is..." — do not bury it in neutral-sounding summary language

CONVERSATION CONTINUITY — follow-up questions in an ongoing chat:
- Do NOT re-run the full document analysis template when the user asks a follow-up
- Answer the specific follow-up question directly, in focused paragraphs
- Reference prior analysis only when it is directly relevant and only briefly
- If the user asks about one specific part of a document, go directly to that part — do not re-summarize the whole filing
- Follow-up responses should feel like a conversation continuing, not a new report starting over

USING THE MEG COURT SERIES KNOWLEDGE:
The knowledge blocks below labeled "MEG COURT SERIES" contain strategic reasoning from 12 years of pro se litigation experience. Use this material to explain not just what a document says, but what it means tactically — what the user should do, what mistakes to avoid, and how this fits into the larger case strategy. Shift from descriptive ("this is a motion to compel") to strategic ("this is a motion to compel — here is why it matters, what happens if it is ignored, and how to escalate if needed").

DISCLAIMER (include at the end of every substantive analysis):
"This is legal information, not legal advice. Always verify citations with official sources and consult a licensed attorney in your state before filing."`;

export async function POST(request: Request) {
  const limit = rateLimit(request, rateLimitPresets.ai);
  if (limit) return limit;

  try {
    const body = await request.json();

    const question = sanitizeText(body.question, MAX_QUESTION_LENGTH);
    const state = sanitizeState(body.state);
    const caseType = sanitizeCaseType(body.caseType);
    const conversationHistory = sanitizeConversationHistory(body.conversationHistory);
    const caseContext = sanitizeCaseContext(body.caseContext);
    const documentText = sanitizeDocumentText(body.documentText);

    if (!question && !documentText) {
      return Response.json({ error: "Please provide a question or document to analyze." }, { status: 400 });
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return Response.json({ error: "API key not configured." }, { status: 500 });
    }

    // Build context from internal knowledge + live legal research (in parallel)
    const vaultDocs = Array.isArray(documentText)
      ? documentText.map((d) => d.text)
      : documentText ? [documentText] : [];

    const [knowledge, legalContext] = await Promise.allSettled([
      Promise.resolve(loadKnowledge(caseType || "family_court", question || "")),
      answerLegalQuestion(question || "analyze this document", state || "US", caseType || "family_court", vaultDocs)
        .catch(() => null),
    ]);

    const knowledgeText = knowledge.status === "fulfilled" ? knowledge.value : "";
    const legalCtx = legalContext.status === "fulfilled" ? legalContext.value : null;

    // Build the user message
    let userContent = "";

    userContent += `I am a pro se litigant in ${state || "my state"}. My case type is ${(caseType || "family_court").replace(/_/g, " ")}.\n\n`;

    // Case context — inserted before documents so Claude reads the narrative before the document text
    if (caseContext && typeof caseContext === "object") {
      const ctx = caseContext as Record<string, string>;
      const lines: string[] = [];
      if (ctx.situation?.trim()) lines.push(`Situation: ${ctx.situation.trim()}`);
      if (ctx.tried?.trim())     lines.push(`What I have tried: ${ctx.tried.trim()}`);
      if (ctx.obstacle?.trim())  lines.push(`Current obstacle: ${ctx.obstacle.trim()}`);
      if (ctx.goal?.trim())      lines.push(`Goal: ${ctx.goal.trim()}`);
      if (lines.length > 0) {
        userContent += `--- CASE CONTEXT ---\n${lines.join("\n")}\n--- END CASE CONTEXT ---\n\n`;
      }
    }

    if (documentText) {
      // Support both legacy string format and new multi-doc array format
      if (Array.isArray(documentText)) {
        for (let i = 0; i < documentText.length; i++) {
          const doc = documentText[i];
          const name = doc.name || `Document ${i + 1}`;
          userContent += `--- DOCUMENT ${i + 1}: ${name} ---\n${doc.text}\n--- END DOCUMENT ${i + 1} ---\n\n`;
        }
      } else {
        userContent += `Here is my document:\n\n---\n${documentText}\n---\n\n`;
      }
    }

    if (question) {
      userContent += question;
    } else if (documentText) {
      userContent += "Please analyze this document. Start by identifying what type of document it is, then provide a thorough analysis based on that document type.";
    }

    // Build messages array
    const messages: { role: "user" | "assistant"; content: string }[] = [];

    // Include sanitized conversation history if provided (for follow-ups)
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    messages.push({ role: "user", content: userContent });

    // Build system prompt with internal knowledge + live legal research
    let system = SYSTEM_PROMPT;
    if (knowledgeText) {
      system += `\n\nINTERNAL COURT KNOWLEDGE (use this to inform your answers with real strategy):\n${knowledgeText}`;
    }
    if (legalCtx?.aiPrompt) {
      system += `\n\nLIVE LEGAL RESEARCH (CourtListener + GovInfo — cite these in your response):\n${legalCtx.aiPrompt}`;
    }
    if (state) {
      system += `\n\nThe user is in ${state}. Note where state law may differ from federal law.`;
    }
    if (caseContext && typeof caseContext === "object") {
      const ctx = caseContext as Record<string, string>;
      const hasCtx = ctx.situation?.trim() || ctx.obstacle?.trim() || ctx.goal?.trim();
      if (hasCtx) {
        system += `\n\nThe user has provided CASE CONTEXT above. Orient your entire response around their stated goal and obstacle — do not give a generic document summary. Speak directly to what they are trying to accomplish, what is standing in their way, and what concrete next step addresses their specific situation. If they have already tried something, do not suggest they try it again.`;
      }
    }

    // Call Claude
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system,
      messages,
    });

    // Extract text from response
    const assistantText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map(block => block.text)
      .join("\n");

    return Response.json({
      response: assistantText,
      model: response.model,
      usage: response.usage,
    });

  } catch (error) {
    console.error("Analyze API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `AI analysis failed: ${message}` }, { status: 500 });
  }
}
