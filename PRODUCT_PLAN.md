# My Court Guide — Product Plan

**Last updated:** 2026-03-27
**Status:** Direction locked. Ready for implementation planning.

---

## What This Is

My Court Guide is a legal information platform built for people navigating the court system without an attorney — especially family court and CPS cases, but open to all legal situations including bankruptcy, housing, and civil cases.

It is not a general-purpose AI. It is grounded in real statutes, real case law, and practical courtroom strategy built from 12+ years of lived experience in the family court system.

---

## Product Name and Voice

**Product name:** My Court Guide

**Who built it:** Meg — 12+ years of personal experience fighting in family court as a parent. This story lives in a dedicated trust section on the public site, not as the product name.

**Voice:** Honest, bold, and trustworthy. Not soft. Not reckless. Not a sales pitch.

**The core message:**
> The court system wasn't designed to explain itself to you. The statutes, case law, and practical strategy that could actually help you are buried where most people never find them — and when people turn to generic AI for answers, they often get confident-sounding responses that don't hold up in court. My Court Guide is different. It's grounded in real law, built around actual courtroom strategy, and designed specifically for people who are navigating the legal system without an attorney.

**What users should feel:**
- The system does not explain itself clearly
- The information they need is hard to find and hard to use
- This tool helps them understand what is really happening in their case
- This is different from generic AI because it is grounded and practical

---

## Visual Direction

**Public site (homepage, marketing pages):**
- Navy blue and white base
- Red used only as an accent for urgency, warnings, or emphasis — never dominant
- Clean, professional, easy to read
- No all-black

**Logged-in experience (dashboard, vaults):**
- A darker, more focused style is appropriate later
- This is a separate design pass — not part of the initial build

---

## Public Navigation

First-time visitors should see a focused, simple navigation — not a full feature menu.

**Recommended public nav:**
- How It Works
- About (Meg's story)
- Sign In
- **Try It Free** (primary CTA button)

Court Coach, Vaults, Dashboard, and other features are not shown in the main nav until a user is signed in.

---

## Homepage Structure

**Section 1 — Hero**
- Headline: "The court system wasn't designed to explain itself to you."
- Subheadline: names the information gap, explains why generic AI falls short
- Single CTA button: "Analyze your first document free — no account needed"
- Small trust line beneath button: "No signup required. Real law. Plain English."

**Section 2 — How It Works**
- Brief, visual explanation of the core flow
- 3 steps: Upload a document → Get a plain-English breakdown → Know what to do next

**Section 3 — What Makes This Different**
- Real statutes and case law — not generic AI guessing
- Built on practical courtroom strategy
- Honest about what it knows and what it doesn't

**Section 4 — Court Coach preview**
- Brief mention that signed-in users get word-for-word courtroom scripts and practice mode
- Not a public feature — just surfaced here to show the depth of the platform

**Section 5 — Pricing**
- Three tiers displayed cleanly (see Pricing section below)

**Section 6 — Meg's Story (Trust Section)**
- Written in first person or close to it
- 12+ years in family court as a pro se litigant
- Built this because the information she needed was not available to her
- Short, honest, human

**Section 7 — Footer**
- Links: How It Works, About, Pricing, Privacy, Terms, Disclaimer
- Legal disclaimer that this is information, not legal advice

---

## Full User Journey

### Step 1 — Homepage
User lands. Reads the headline, understands what this is, sees the CTA.

### Step 2 — Free Document Analysis (no account needed)
User clicks "Try It Free" or "Analyze your first document."

They see a simple upload screen:
- Select their state
- Select their case type
- Upload one document (PDF or paste text)
- Click Analyze

### Step 3 — Pre-Signup Analysis (partial result)
The AI returns a focused, honest analysis. **This is not the full product experience — it is a credible preview.**

**What the pre-signup analysis shows:**
- What this document is (plain English, one sentence)
- What it likely means for the user
- Urgency flags and likely deadlines
- 2–3 smart things to consider given this document
- 1–2 relevant laws from the user's state when possible
- 1 relevant case citation if the match is strong
- What is still unknown — honest acknowledgment that one document is not the whole case

**What it does NOT show:**
- Full strategy guidance
- Follow-up questions
- A complete action plan
- Templates or drafting help
- County-specific guidance

**The tone of the result:** Grounded, impressive, honest. The goal is for the user to think: "This is different. This actually understands what I'm dealing with."

### Step 4 — Signup Wall
After the pre-signup analysis, a clear prompt appears:

> **"Add the rest of your documents and get your full action plan."**
> Create a free account to save this analysis, ask follow-up questions, and build your case.

- Direct and supportive — not manipulative
- The analysis they just saw is saved and waiting inside their account
- They do not lose their work if they sign up

### Step 5 — Signup
- Email and password (or Google login later)
- Collects: first name, email, password
- State and county are collected in the next step

### Step 6 — "Do This Now" Setup (onboarding flow)
After signup, the user is walked through a guided setup — not a generic dashboard.

**Step A — Your situation**
- Select state (if not already captured from pre-signup)
- Select county (required — court rules differ by county)
- Select case type

**Step B — Name your case**
- "What do you want to call this case?"
- Example: "My custody case in [county]" or "DCF — [county] 2026"
- This creates their first Vault automatically

**Step C — Your analysis is ready**
- Show the pre-signup analysis here — nothing is lost
- "Here's what we found from your first document"

**Step D — Your immediate next actions**
- AI generates 3 specific things to do right now based on their case type and uploaded document
- These are the "Do This Now" actions — practical, not generic

**Step E — Build your case**
- "Upload your other documents so we can give you a complete picture"
- Option to skip and come back later

### Step 7 — Dashboard
- Always shows a "Do This Now" panel with current priority actions
- Updates as the user adds documents and their situation evolves
- Access to Vaults, Court Coach, AI Assistant, and templates

---

## Core Features

### AI Document Assistant
- Users upload court documents (PDF or paste text)
- AI returns a plain-English breakdown with deadlines, obligations, and next steps
- Follow-up questions in a chat interface
- Grounded in real law: relevant statutes from user's state, case citations when matched
- Powered by Claude + internal court knowledge library (7 documents)
- CourtListener (case law) and GovInfo (federal statutes) are wired in for real citations

### "Do This Now" Panel
- Lives on the dashboard after signup
- Shows 3–5 prioritized next actions based on the user's case type, uploaded documents, and deadlines
- Updates as the user adds more to their case
- This is the core post-signup experience — not just a checklist

### Case Vaults
- Each vault represents one active case
- Has its own: case name, state, county
- A user can have multiple vaults (different cases in different places)
- Free tier: 1 vault. Active Case: 3 vaults.
- **Later (Phase 2):** each vault holds documents, case notes, status tracking, deadlines, and ongoing updates
- Documents uploaded in the current AI session will eventually be stored in the vault instead of being stateless

### Court Coach
- Word-for-word scripts for 12 courtroom situations (opening statements, objections, custody hearings, DCF hearings, cross-examination, closing, etc.)
- Available after signup only — not a public feature
- Mentioned briefly on the public homepage to show the platform's depth
- **Free tier:** read-only scripts
- **Active Case tier:** full AI practice mode (AI plays the judge, user practices their lines, gets feedback)

### Templates (Phase 2)
- Record request templates: DCF, GAL/Caseworker, KVC, Psychologist, Supervised Visitation
- AI rewrites templates for the user's specific state
- Available on Active Case tier and above

---

## Pricing

### Free
- 5 document analyses per month
- 1 vault
- 15 AI follow-up questions per month
- Court Coach: read-only scripts
- No templates
- No county-specific guidance

### Active Case — $19/month
- 20 document analyses per month
- 3 vaults
- 75 AI follow-up questions per month
- Full Court Coach including AI practice mode
- County-specific guidance
- Template access
- 1GB document storage

### Advocate — $99/month *(Coming Soon)*
- For case managers, social workers, and advocates helping multiple clients
- Higher limits on analyses, questions, and vaults
- Multi-client dashboard
- Larger storage
- Everything in Active Case
- *Shown on the pricing page as coming soon — sets the vision without overpromising*

---

## What Is Already Built

| What | Status |
|---|---|
| AI assistant — full end-to-end flow | ✅ Working |
| PDF extraction API route | ✅ Working |
| Claude-powered analyze API route | ✅ Working |
| Multi-document upload support | ✅ Working |
| 7 internal court knowledge files | ✅ In content/ folder |
| courtlistener.js — case law API client | ✅ Built, not yet wired |
| govinfo.js — federal statute API client | ✅ Built, needs API key |
| legalEngine.js — unified engine | ✅ Built, not yet wired |
| Homepage | ✅ Built (needs redesign) |
| Signup page | ✅ Built (needs county field + flow update) |
| Dashboard | ✅ Built (mock data, needs real features) |
| Court Coach | ✅ UI built (not connected to AI) |
| Vaults | ✅ UI built (stateless, needs Supabase) |
| Supabase (database, auth, storage) | ❌ Not set up |
| Stripe (payments) | ❌ Not set up |

---

## What to Build Next (Priority Order)

### Priority 1 — Homepage and Public Site Redesign
- New headline and messaging (see Homepage Structure above)
- Simplified navigation (4 items max)
- Meg's story trust section
- Pricing section with 3 tiers (Advocate as coming soon)
- Single focused CTA

### Priority 2 — Pre-Signup Document Analysis Flow
- Update the AI assistant setup screen to work without a signup gate
- Update the analyze API to return a partial result format for pre-signup users
  - Plain English summary
  - Urgency/deadline flags
  - 2–3 smart considerations
  - 1–2 relevant laws + 1 case citation if strong match
  - Honest statement of what's still unknown
- Build the signup wall UI that appears after the pre-signup result

### Priority 3 — "Do This Now" Post-Signup Onboarding
- Multi-step onboarding flow after signup
- Collect state, county, case type, case name
- Show pre-signup analysis (carry it over, nothing lost)
- Generate first "Do This Now" action list
- Prompt to upload additional documents

### Priority 4 — Supabase (Database and Auth)
- User accounts and login
- Case vaults (name, state, county per vault)
- Save documents and analyses
- Feature gating (free vs. Active Case limits)
- Session persistence

### Priority 5 — Wire CourtListener + GovInfo Into AI
- Import legalEngine.js into the analyze route
- Real case law citations in AI responses
- Real federal statute verification
- GovInfo API key required (free signup at https://api.govinfo.gov/api-signup/)

### Priority 6 — Stripe and Subscriptions
- Active Case plan at $19/month
- Usage limit enforcement tied to subscription status
- Advocate plan page (no purchase yet — coming soon)

---

## Open Questions (Decide Before Building)

1. **GovInfo API key** — needs to be obtained at https://api.govinfo.gov/api-signup/ before Priority 5 can begin
2. **Streaming responses** — currently the AI returns all at once. Streaming would feel faster but requires a code change. Decide when to prioritize this.
3. **Google login** — do you want Sign in with Google at launch or just email/password first?
4. **Annual pricing** — do you want to offer a discounted annual plan for Active Case?
5. **Mobile** — the public site should be mobile-responsive from the start. The app comes later.

---

*This document is the single source of truth for product direction. Update it as decisions are made. Do not make major product or UI changes without checking here first.*
