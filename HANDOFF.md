# Handoff — My Court Guide

**Last updated:** 2026-03-27

---

## What works now

### /ai-assistant — full end-to-end flow
1. User selects state + case type on the setup screen
2. User uploads one or **multiple** court documents (PDF or text), or pastes text
3. PDFs are extracted server-side via `/api/extract-pdf` (pdf-parse@1.1.1)
4. All documents are sent together to `/api/analyze`, which calls Claude (claude-sonnet-4)
5. AI returns a plain-English analysis with deadlines, obligations, and next steps
6. User can ask follow-up questions in a chat interface
7. Conversation history (last 6 messages) is included for context on follow-ups

### Multi-document support
- File input accepts `multiple` files at once
- Users can also click "Add another document" to upload more in batches
- Paste text works too via "Add pasted text" button — adds to the same array
- Each doc appears in a green-bordered list with a remove (✕) button
- The submit button shows dynamic count: "Analyze 3 Documents"
- On the API side, documents arrive as `{name, text}[]` — each labeled separately in the prompt

### Contrast bug fix
- **Root cause:** `app/globals.css` had a `@media (prefers-color-scheme: dark)` block that set `--foreground: #ededed` (near-white). Since the app has a light UI, form inputs inherited invisible text on macOS dark mode.
- **Fix:** Removed the dark-mode CSS block. Also added explicit `text-gray-900 bg-white` to all form inputs as a backup.

### API routes
| Route | Status | What it does |
|---|---|---|
| `/api/extract-pdf` | Working | Accepts PDF via multipart form, returns `{text, pages}`. Uses `pdf-parse/lib/pdf-parse.js` direct import to avoid a test-file bug in the main entry point. |
| `/api/analyze` | Working | Accepts `{documentText, question, state, caseType, conversationHistory}`. Loads internal court knowledge by keyword matching. Calls Claude. Returns analysis. `documentText` can be a string or `{name, text}[]` array. |

### Internal knowledge (RAG-lite)
- 7 files in `content/` folder loaded into Claude's context by keyword matching on the user's question + case type
- At most 2 files loaded per request, each truncated to 8K chars
- See `AI_ASSISTANT_SPEC.md` section 5 for the full mapping

---

## Architecture note: Case Vault compatibility

The current document structure — `{name: string, text: string}[]` — is intentionally designed to later feed from a Case Vault. When Supabase is added:

- A "case" will hold many documents (e.g., "My Family Court Case" has a custody order, a motion, a GAL report)
- The vault provides the same `{name, text}[]` array from stored documents instead of fresh uploads
- The API route already accepts this format — no backend change needed
- The UI will switch from "upload files" to "select from vault + optionally upload new ones"

**Do not build the Case Vault yet.** Just know the current shape was chosen to make that transition seamless.

---

## What is still unfinished

### Not yet wired
- [ ] `lib/legalEngine.js` — unified engine that combines CourtListener + GovInfo + landmark cases. Currently the analyze route builds prompts directly instead of calling `answerLegalQuestion()`. This is the biggest integration gap.
- [ ] CourtListener integration — `lib/courtlistener.js` is fully built and the API key is active, but the analyze route doesn't call it yet. No live case law citations.
- [ ] GovInfo integration — `lib/govinfo.js` is fully built, but the API key in `.env.local` is still a placeholder (`your_govinfo_key_here`). Needs free signup at https://api.govinfo.gov/api-signup/

### Not yet built
- [ ] Streaming responses — Claude response is returned all at once, not streamed. For long analyses this means a blank wait.
- [ ] Case Vault (Supabase) — no database, no auth, no document storage. Everything is stateless.
- [ ] Court Coach AI — `/court-coach` has a full UI with hardcoded scripts but is not connected to the AI.
- [ ] Download/export — no "Download as PDF" or "Copy all" for the full analysis.
- [ ] Rate limiting — no protection against API abuse since there's no auth.
- [ ] `.docx` upload support — file input accepts it but there's no extraction handler.

### Known quirks
- `getApiKey()` in the analyze route reads `.env.local` directly as a fallback because Next.js 16 Turbopack sometimes fails to load env vars into server runtime.
- `pdf-parse` is imported via `pdf-parse/lib/pdf-parse.js` (not the main entry) to avoid a bug where the main `index.js` tries to read a test fixture file on import. There's a `@ts-expect-error` comment for this.

---

## Exact next step

**Wire `legalEngine.js` into the analyze route** so that when a user uploads a document or asks a question, the AI response includes real case law citations from CourtListener and (once the key is set) federal statute references from GovInfo.

The path:
1. Import `answerLegalQuestion()` from `lib/legalEngine.js` in the analyze route
2. Call it with the user's question, state, case type, and document text as vault context
3. Include the returned citations and legal context in the system prompt alongside the existing internal knowledge
4. Test with a real question like "What are my rights if the other parent violates the custody order?"

This is the single biggest upgrade: it turns the AI from "smart reader" into "legal research assistant."

---

## File inventory

| File | Role |
|---|---|
| `app/ai-assistant/page.tsx` | Main AI UI — setup screen + chat |
| `app/api/analyze/route.ts` | AI analysis endpoint — calls Claude |
| `app/api/extract-pdf/route.ts` | PDF text extraction endpoint |
| `app/globals.css` | Global styles — dark mode removed |
| `lib/legalEngine.js` | Unified legal research engine (not yet wired) |
| `lib/courtlistener.js` | CourtListener API client (ready) |
| `lib/govinfo.js` | GovInfo API client (ready, needs API key) |
| `content/` | 7 internal court knowledge files |
| `AI_ASSISTANT_SPEC.md` | Full product spec for the AI assistant |
| `.env.local` | API keys (Anthropic + CourtListener active) |
