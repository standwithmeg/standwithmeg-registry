# AI Document Assistant — Product Specification

**Project:** My Court Guide
**Status:** Pre-build spec — single source of truth for AI features
**Last updated:** 2026-03-27

---

## 1. Product Purpose and Scope

My Court Guide's AI assistant helps pro se litigants understand their court documents, identify what they need to do next, and prepare their response — using their own documents as the starting point.

**Core promise:** Upload a court document. Understand it immediately. Know what to do next.

**This is not:**
- A chatbot for general legal trivia
- A replacement for an attorney
- A document storage platform (that comes with Supabase later)

**This is:**
- A document analysis engine that reads what the user brings and explains it
- A strategy advisor grounded in real court knowledge and live legal sources
- A drafting assistant that helps users write motions, responses, and discovery

---

## 2. User Inputs

### Primary input: uploaded court documents

| Document type | What the AI does with it |
|---|---|
| Court orders (custody, support, visitation) | Explains obligations, flags deadlines, identifies what can be enforced or violated |
| Opposing motions / pleadings | Identifies what the other side is asking for, flags weaknesses, suggests responses |
| DCF / CPS reports | Identifies allegations, flags due process issues, identifies what to challenge |
| GAL reports | Identifies recommendations, flags bias or incomplete investigation |
| Discovery requests | Explains what is being asked, flags objectionable requests, helps draft responses |
| Financial records / affidavits | Identifies inconsistencies, supports or contradicts claims |

### Secondary inputs: user context

| Input | How it's gathered |
|---|---|
| State | Dropdown selector — required before any analysis |
| Case type | Dropdown: family court, custody, DCF/CPS, divorce, civil, bankruptcy, housing |
| Specific question | Free-text: "What does paragraph 5 mean?" or "Can I fight this?" |
| Situation description | Optional: user describes what happened in their own words |

### Supported file formats (MVP)

- **PDF** — most common for court documents
- **Plain text / pasted text** — for users who copy from a portal
- **Images of documents** — stretch goal (requires OCR)
- `.docx` — if the user has Word versions

---

## 3. AI Outputs

The AI produces five categories of output, in order of priority:

### A. Plain-language document summary
**Trigger:** User uploads any court document
**Output:** Section-by-section summary in plain English. No legal jargon unless it's defined inline.
**Format:**
```
WHAT THIS DOCUMENT IS: [one sentence]

KEY POINTS:
1. [obligation or finding — what it means for you]
2. [obligation or finding — what it means for you]
3. ...

DEADLINES:
- [date]: [what must happen by then]

WHAT THIS MEANS FOR YOU:
[2-3 sentences of practical interpretation]
```

### B. Risk and deadline identification
**Trigger:** Automatic, as part of document analysis
**Output:** Flagged deadlines, response windows, potential sanctions for non-compliance, and anything the user might miss.

### C. Strategy guidance
**Trigger:** User asks "What should I do?" or "How do I respond?"
**Output:** Step-by-step recommended actions grounded in:
1. Internal court knowledge files (the 7-part content library)
2. The user's specific document and situation
3. Relevant case law from CourtListener
4. Relevant statutes from GovInfo

### D. Draft documents
**Trigger:** User requests "Help me write a motion" / "Draft my response" / "Write a discovery request"
**Output:** A complete first draft formatted for the user's court, with:
- Correct caption format
- Numbered factual grounds drawn from the user's uploaded documents
- Legal authority from CourtListener and GovInfo
- WHEREFORE clause with specific relief
- Certificate of service template
- "Copy to clipboard" and "Download as PDF" options

### E. Courtroom preparation
**Trigger:** User asks "What do I say at the hearing?" or uses Court Coach
**Output:** Word-for-word scripts adapted to the user's specific facts (already partially built in `/court-coach`)

---

## 4. Document Workflow

### Pre-Supabase flow (stateless — MVP)

```
┌──────────────────────────────────────────────────────┐
│ User visits /court-coach or /ai-assistant             │
│                                                      │
│  Step 1: Select state + case type                    │
│  Step 2: Upload document OR paste text               │
│  Step 3: Document sent to server-side API route      │
│          ↓                                           │
│  Step 4: API route constructs prompt:                │
│          • System prompt (voice, guardrails)          │
│          • Internal knowledge (relevant content/ file)│
│          • User's document text                      │
│          • User's question                           │
│          ↓                                           │
│  Step 5: Call Anthropic Claude API                   │
│          ↓                                           │
│  Step 6: Optionally call CourtListener / GovInfo     │
│          for citations                               │
│          ↓                                           │
│  Step 7: Return structured response to client        │
│  Step 8: User reads analysis, asks follow-ups,       │
│          requests a draft, or copies output          │
│                                                      │
│  Nothing is saved. Session ends when tab closes.     │
└──────────────────────────────────────────────────────┘
```

**Technical requirements for MVP:**
- Anthropic API key in `.env.local`
- One API route: `app/api/analyze/route.ts`
- Client-side file upload → text extraction (PDF.js or server-side extraction)
- Streaming response display
- No database, no auth, no file storage

### Post-Supabase flow (persistent — Phase 2)

Everything above, plus:

| Feature | What Supabase enables |
|---|---|
| Save uploaded documents | Supabase Storage → user's case vault |
| Conversation history | Supabase table → chat sessions per user |
| Return to previous analysis | Load prior document + AI conversation |
| Personalized context | AI knows user's state, case type, prior documents |
| Multi-document analysis | AI can cross-reference all uploaded documents |
| Alerts | Track deadlines from analyzed documents → notify user |
| Billing | Gate usage behind subscription tiers |

---

## 5. Knowledge Architecture — When to Use What

### Internal court knowledge (content/ folder)

These files are loaded into the AI's context based on the user's question topic. They provide Meg's strategic voice and real courtroom guidance that no API can offer.

| Content file | Load when... |
|---|---|
| `reference/defenses-and-causes-of-action.md` | User asks about defenses, counterclaims, or causes of action |
| `court-coach/lawyers-judges-judgments.md` | User asks about managing a judge, controlling their lawyer, or judgment issues |
| `guides/family-law-custody-discovery.md` | User's case type is family court, custody, or divorce |
| `court-coach/why-winning-is-easy.md` | User asks a broad strategy question or seems overwhelmed |
| `court-coach/motions-hearings-legal-writing.md` | User needs to write a motion, prepare for a hearing, or draft anything |
| `court-coach/evidence-filters-hearsay.md` | User asks about evidence, objections, or admissibility |
| `court-coach/circumstantial-evidence.md` | User asks about inference, circumstantial proof, or evidence weight |

**Selection method (MVP):** Keyword matching on the user's question + case type. Load 1-2 relevant files as context.

**Selection method (Phase 2):** Chunk the files into topic-tagged sections. Use semantic similarity to pull only the most relevant 2-3 sections. Keeps context window efficient.

### CourtListener — when to call

| Call CourtListener when... | What to fetch |
|---|---|
| User asks "Is there case law on X?" | `searchOpinions()` with user's state filter |
| AI is drafting a motion | `getCaseLawForQuestion()` for supporting authority |
| User uploads a document citing a case | `findCaseByCitation()` to verify and provide full text |
| User's question touches parental rights, custody, DCF | `getLandmarkCases()` — always include Troxel, Santosky, Stanley |
| User asks about a specific court ruling | `getOpinion()` / `getCluster()` |

**Existing code:** `lib/courtlistener.js` — fully built. All functions above are implemented and ready. CourtListener API key is in `.env.local`.

### GovInfo — when to call

| Call GovInfo when... | What to fetch |
|---|---|
| AI is citing a federal statute | `lookupUSCode()` to verify it exists and is current |
| User asks about HIPAA, foster care regs, CFR | `lookupCFR()` for the specific regulation |
| AI is drafting a records request or motion | `getDocumentWritingContext()` for grounding |
| User asks a legal question | `getLegalQAContext()` for federal law context |
| User uploads a document — AI needs to identify relevant law | `getDocumentAnalysisContext()` |

**Existing code:** `lib/govinfo.js` — fully built. All functions above are implemented. **GovInfo API key is NOT yet set** — needs to be obtained from https://api.govinfo.gov/api-signup/

### Unified engine

`lib/legalEngine.js` already combines both sources into a single call:
- `answerLegalQuestion()` — parallel-fetches GovInfo + CourtListener + landmark cases + optional vault documents, returns structured prompt context
- `getDocumentDraftingContext()` — fetches sources needed to write a specific document type
- `adaptTemplateForState()` — adapts templates to the user's state

**This is the primary integration layer. The API route should call `legalEngine.js`, not the individual source files.**

---

## 6. Prompt Architecture

### System prompt (loaded for every interaction)

```
You are the AI assistant for My Court Guide — a legal information platform
for pro se litigants. You were built by someone who spent 12 years fighting
in family court as a parent.

VOICE:
- Direct, practical, and clear
- No legal jargon without immediate plain-English explanation
- Confident but honest about limitations
- Always tell the user what they can DO — not just what the law says
- Never talk down to the user

RULES:
- You provide legal INFORMATION, not legal ADVICE
- Never tell the user they will win or lose
- Never recommend they skip consulting an attorney
- Always cite your sources: case name + citation for case law, statute number for statutes
- Always note when state law may differ from federal law
- Flag deadlines and response windows prominently
- If you don't know something, say so — never fabricate citations
- End every substantive response with the disclaimer

DISCLAIMER (include at the end of every analysis):
"This is legal information, not legal advice. Always verify citations with
official sources and consult a licensed attorney in your state before filing."
```

### Prompt structure per request

```
[SYSTEM PROMPT — voice, rules, guardrails]

[INTERNAL KNOWLEDGE — relevant content/ file sections]

[LEGAL SOURCES — from legalEngine.js]
  Federal statutes: [from GovInfo]
  Case law: [from CourtListener]
  Landmark cases: [always-include list]

[USER'S DOCUMENT — full text of uploaded document]

[USER'S QUESTION — what they asked]

[OUTPUT FORMAT INSTRUCTIONS — based on request type]
```

---

## 7. Guardrails — What the AI Must Never Do

| Rule | Reason |
|---|---|
| Never say "you should" or "I advise you to" | Crosses into legal advice territory |
| Never fabricate case citations | Pro se users will file these — wrong citations destroy credibility |
| Never guarantee outcomes | No one can predict what a judge will do |
| Never tell a user to ignore a court order | Contempt has real consequences including jail |
| Never provide tax advice | Out of scope — different professional licensing |
| Never diagnose mental health conditions | Out of scope and harmful |
| Never tell a user they don't need a lawyer | Always note when an attorney would be valuable |
| Never store or transmit documents without consent | Privacy — especially with sensitive family/child documents |
| Never use uploaded documents for training | User trust is non-negotiable |
| Always include the disclaimer | Every substantive response, every time |

### When to refuse

The AI should decline to answer and suggest professional help when:
- The user describes an emergency involving a child's immediate safety
- The user asks about criminal charges they are facing (refer to criminal defense attorney)
- The question involves active child abuse (refer to appropriate authorities)
- The user is asking about harming another person or obstructing justice

---

## 8. Existing Code Inventory

| File | Status | What it does |
|---|---|---|
| `lib/courtlistener.js` | ✅ Built | Opinion search, docket search, citation lookup, landmark cases, state court codes |
| `lib/govinfo.js` | ✅ Built | U.S. Code lookup, CFR lookup, Federal Register alerts, document analysis context |
| `lib/legalEngine.js` | ✅ Built | Unified engine combining both sources + AI prompt construction |
| `lib/courtroomCoach.js` | ❓ Check | May exist — verify contents |
| `app/court-coach/page.tsx` | ✅ Built | Full UI with situation picker, state selector, scripts, practice mode — uses hardcoded scripts, not yet connected to AI |
| `app/ai-assistant/page.tsx` | ✅ Built | Exists — verify current state |
| `app/api/analyze/route.ts` | ❌ Missing | The API route that calls Anthropic — this is the key missing piece |
| `content/` folder | ✅ Built | 7 court knowledge files organized by topic |
| `.env.local` | ⚠️ Partial | CourtListener key set. GovInfo key empty. Anthropic key missing. |

---

## 9. MVP Build — Smallest Working Prototype

### What to build

**One API route + one updated page = working document analysis.**

#### Step 1: Get API keys
- [ ] Anthropic API key → add as `ANTHROPIC_API_KEY` in `.env.local`
- [ ] GovInfo API key → add as `GOVINFO_API_KEY` in `.env.local`

#### Step 2: Create the API route
File: `app/api/analyze/route.ts`

Accepts:
- `documentText` (string) — extracted text from uploaded document
- `question` (string) — what the user wants to know
- `state` (string) — user's state
- `caseType` (string) — family_court, custody, etc.

Does:
1. Calls `answerLegalQuestion()` from `legalEngine.js` with the user's question + document text as vault context
2. Adds relevant `content/` file sections to the prompt
3. Calls Anthropic Claude API with the assembled prompt
4. Streams the response back to the client

Returns:
- AI response (streamed)
- Citations used
- Disclaimer

#### Step 3: Update the UI
Modify `app/court-coach/page.tsx` OR `app/ai-assistant/page.tsx` to add:
- File upload input (PDF or paste text)
- State + case type selectors (already exist in court-coach)
- Question input
- Streaming response display
- "Copy" and "Download" buttons on the output

#### Step 4: Wire it together
- Upload → extract text client-side (PDF.js) or server-side
- Text + question + state + caseType → POST to `/api/analyze`
- Stream response back to UI
- Display with formatting, citations, and disclaimer

### What NOT to build in MVP
- User accounts or login
- Document storage
- Conversation history
- Billing or paywalls
- Multi-document analysis
- Template generation (Phase 2)

### Success criteria
A user can:
1. Visit the page without logging in
2. Upload a PDF court order
3. Get a plain-English summary within 30 seconds
4. Ask a follow-up question about the document
5. Request a draft motion in response to the document
6. Copy or download the output

That is the product working.

---

## 10. Phase 2 Features (After Supabase)

| Feature | Requires |
|---|---|
| Save documents to vault | Supabase Storage + auth |
| Return to prior analyses | Supabase table for chat history |
| Cross-reference multiple documents | Vault access + smarter context assembly |
| Template generation with user facts | User profile + case vault data |
| Deadline tracking and alerts | Supabase + cron or edge function |
| Usage metering and billing | Stripe + Supabase user table |
| State-specific template adaptation | `state_data.json` + `adaptTemplateForState()` from legalEngine.js |

---

## 11. Open Questions

1. **Anthropic API key** — do you have one? This blocks all AI work.
2. **GovInfo API key** — free signup at https://api.govinfo.gov/api-signup/ — do you want to get this now?
3. **PDF text extraction** — client-side (PDF.js, lighter) or server-side (more reliable for scanned docs)?
4. **Which page becomes the AI entry point** — `/court-coach` (already has good UI) or `/ai-assistant` (cleaner slate)?
5. **Rate limiting** — without auth, anyone can hit the API. Add basic rate limiting from the start?

---

*This spec is the single source of truth for the AI assistant. All implementation should reference this file. Update it as decisions are made.*
