# Stand With Meg — Court Actors + Nudge Email Handoff

Last updated: April 18, 2026

This doc captures the state of the codebase after the court-actors + nudge-email work session. Read this first before picking up work in these areas. (A separate `HANDOFF.md` covers the My Court Guide app.)

---

## What this session shipped

### 1. Court Actors feature (end-to-end)

A new system for tracking the judges, attorneys, GALs, CPS workers, etc. that families name in their submissions. Supports form-entered names (trusted) and AI/regex-extracted names (admin-only until verified).

**Data model:** `court_actors` table, one row per (submission, role, name) triple.
- Migration: `supabase/migrations/007_court_actors.sql`
- Source column: `supabase/migrations/008_court_actors_source.sql`
  - `source = 'form_direct'` — family entered it on the form (counts toward public threshold)
  - `source = 'extracted_regex'` — script found it in free-text (admin-only)
  - `source = 'extracted_ai'` — Claude Haiku found it (admin-only)

**Form capture** (`app/(swm)/submit/page.tsx`):
- Step 2 has a repeatable "Court Actors" section (role, name, court, notes)
- Written server-side on submit by `app/api/survey/route.ts`

**Public API** (`app/api/survey/court-actors/route.ts`):
- `GET /api/survey/court-actors?state=XX`
- Returns only actors where **5+ distinct families** have named the same (role, name, state)
- **Hard-filters `source='form_direct'`** — extracted rows never leak publicly
- Returns `{ actors, threshold: 5 }`

**Admin API** (`app/api/admin/court-actors/route.ts`):
- `GET` — returns every row, with reporter email/name joined in, plus aggregate counts by bucket
- `PATCH { id, action }` — actions are:
  - `promote` → set source to `form_direct` (row now counts toward public threshold)
  - `demote` → revert to `extracted_regex`
  - `delete` → hard delete row

**Admin UI** (`app/(swm)/admin/page.tsx` — Court Actors panel):
- Three views: by_state (default), patterns, all
- County drilldown when you expand a state
- Action buttons on each row: ✓ Promote · ↶ Demote · ✉ Nudge · × Del
- Extracted rows show `[regex]` or `[ai]` badge

### 2. Extraction pipeline (retroactive scan of legacy free-text)

Two scripts that ran once against the historical submissions table to pull court actors out of free-text fields.

**`scripts/extract-court-actors.ts`** — regex + AI pass
- Regex pass uses `NAME_STRICT` (2+ capitalized words) combined with role keywords ("Judge", "Attorney", "CPS Worker", etc.)
- AI pass uses Claude Haiku (`claude-haiku-4-5`) with JSON output
- Stopword list (`NON_NAME_WORDS`) filters common false positives (prepositions, legalese, role descriptions)
- Writes `/tmp/court-actors-extraction-preview.csv`

**`scripts/commit-extracted-actors.ts`** — filter + insert
- Reads the preview CSV
- Applies `isValidName` (drops placeholders like "Unknown", lowercase-only phrases, description-style names)
- Deduplicates against existing rows in the DB (paginated — don't trust the 1000-row default)
- Dry-run by default; pass `--commit` to actually insert
- Result: **226 extracted actors committed, 0 public leaks** (all tagged `extracted_regex` / `extracted_ai`)

### 3. Nudge email system

The "✉ Nudge" button on extracted actors opens a modal letting the admin send a personalized email to the family who originally named that person, asking them to re-submit via the new Court Actors form section (which promotes the name to `form_direct`).

**Backend:** `app/api/admin/send-nudge/route.ts`
- Admin-only POST
- Validates to/subject/body
- Sends via Gmail SMTP (`smtp.gmail.com:587`) with nodemailer
- Accepts optional `html` for formatted email bodies

**Frontend:** nudge modal in `app/(swm)/admin/page.tsx`
- Pre-written email template signed "— Meg"
- **Bold red warning** "You don't need to redo the whole survey" sits right next to the submit link
- Gold CTA button "Re-submit Court Actors →" in the HTML version
- Four send paths:
  1. **✉ Send now from info@standwithmeg.com** — server-side SMTP send (primary)
  2. **Copy all** — copies To+Subject+Body for pasting elsewhere
  3. **Open in Gmail** — opens Gmail compose in browser
  4. **mailto:** — fallback for default desktop mail client

### 4. Form polish (earlier in session)

- Federal funding question removed
- Pro Se now mandatory
- "Are you outside the US?" reworded to "Where are you located?"
- Auto-approval logic: when a family submits a quote, it's approved automatically based on `permission_to_share` (public / anonymous / first_name) — no manual admin approval needed

---

## Environment variables (in `.env.local`)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Admin allowlist (comma-separated emails)
ADMIN_EMAILS=founder@standwithmeg.com,...

# AI extraction
ANTHROPIC_API_KEY=...

# Email sending (Gmail SMTP) — see Gotchas below
GOOGLE_SMTP_USER=founder@standwithmeg.com         # account that owns the app password
GOOGLE_SMTP_PASSWORD=xxxxxxxxxxxxxxxx             # 16-char Google app password, NO spaces
GOOGLE_SMTP_FROM=info@standwithmeg.com            # what recipients see (optional — falls back to SMTP_USER)
GOOGLE_SMTP_REPLY_TO=info@standwithmeg.com        # where replies go (optional — falls back to FROM)
```

**Gotcha:** Next.js only reads `.env.local` on dev-server startup. Any change → restart the dev server.

---

## Running things

### Dev server

The external drive + native binary problem means you must use the Node.js Foundation binary and disable Turbopack:

```bash
cd "/Volumes/2023 Big 18/standwithmeg/website"
PATH="/usr/local/bin:$PATH" npx next dev --webpack
```

The default `npm run dev` won't work — Turbopack's native bindings fail to load because of code-signing Team ID mismatches between Codex-signed node (`/Applications/Codex.app/Contents/Resources/node`) and third-party `.node` files on Apple Silicon.

### Extraction pipeline (only run if there's new legacy data)

```bash
# 1. Dry-run: generates /tmp/court-actors-extraction-preview.csv
npx tsx --env-file=.env.local scripts/extract-court-actors.ts

# 2. Preview what would be committed
npx tsx --env-file=.env.local scripts/commit-extracted-actors.ts

# 3. Commit to DB
npx tsx --env-file=.env.local scripts/commit-extracted-actors.ts --commit
```

### Full refresh (CSV → PDFs → Drive → Supabase)

```bash
"/Volumes/2023 Big 18/standwithmeg/refresh-all.command"
```

---

## Known issues / gotchas

### Gmail "From:" rewriting

When sending via `smtp.gmail.com` authenticated as founder@, Gmail may rewrite the `From:` header to match the authenticated account even if you set it to info@standwithmeg.com. This happens when info@ isn't a true Workspace alias of founder@.

**Current workaround**: `GOOGLE_SMTP_REPLY_TO=info@standwithmeg.com` ensures replies go to info@ regardless of how the From renders. Functionally fine for the use case.

**Why we can't auth as info@ directly**: info@ has its own Workspace login, but when signed in as info@ the "App passwords" page shows "The setting you are looking for is not available for your account." Either 2FA isn't fully enabled on info@, or the Workspace admin has app passwords disabled for that user.

**Proper fix options** (not yet done):
1. Verify 2-Step Verification is fully turned on for info@, then retry `https://myaccount.google.com/apppasswords` while signed in as info@
2. If still blocked: admin.google.com → Security → Authentication → enable app passwords for info@
3. Or convert info@ from its own Workspace user to an alias of founder@ (⚠️ destructive — deletes info@'s inbox)

### Turbopack

Don't use it on the external drive. Always pass `--webpack`.

### tsx `--env-file` comment parsing

`tsx --env-file=.env.local` has bugs parsing `.env.local` when there are `# Comment` lines directly above env vars. The extraction and commit scripts work around this with a manual env loader at the top of each file.

### Generated columns

`total_financial_loss` used to be a GENERATED column but was converted to a regular numeric column. The API route now computes the sum server-side before insert. If re-adding Generated, update `app/api/survey/route.ts` to not include it in the payload.

### Supabase 1000-row pagination

Default `.select()` tops out at 1000 rows. Several scripts (`commit-extracted-actors.ts` dedup, admin court-actors GET, public court-actors GET) explicitly paginate via `.range()`. Don't assume a single call returns everything.

### Rotate the exposed app password

An earlier app password (`zxep sxtu ghfl uncr`) was shared in chat screenshots during debugging. Delete it at myaccount.google.com → Security → App passwords and regenerate a fresh one.

---

## What's pending / open

1. **Deploy `/submit` to live site** — the form page exists in code but standwithmeg.com/submit currently 404s. Once deployed, the link in nudge emails will actually work.
2. **Public dashboard gate (`/impact`)** — plan exists at `~/.claude/plans/playful-brewing-sky.md`; not yet built. Includes access gate form, state-by-state table, 30-submission threshold badges, per-state Drive resource links. Migration file referenced: `supabase/migrations/005_dashboard_access_and_resources.sql`.
3. **Gmail "From: info@" not sticking** — see gotcha above. Workaround is in place; proper fix is a Workspace admin setting change.
4. **judge-y.com coordination** — Meg has a friend running a similar site. Open question whether to partner or stay distinct. No action taken this session.
5. **Monetization path** — Meta subscriptions / Substack / grants discussed but not decided. 200k+ social following provides leverage.

---

## Key files map

| Area | File |
|---|---|
| Form UI | `app/(swm)/submit/page.tsx` |
| Form submit API | `app/api/survey/route.ts` |
| Admin dashboard | `app/(swm)/admin/page.tsx` |
| Admin court-actors API | `app/api/admin/court-actors/route.ts` |
| Admin send-nudge API | `app/api/admin/send-nudge/route.ts` |
| Public court-actors API | `app/api/survey/court-actors/route.ts` |
| Extraction script | `scripts/extract-court-actors.ts` |
| Commit script | `scripts/commit-extracted-actors.ts` |
| Supabase server client | `lib/supabase.ts` |
| Supabase admin client | `lib/supabase-admin.ts` |
| Migrations | `supabase/migrations/007_court_actors.sql`, `008_court_actors_source.sql` |

---

## Database snapshot (as of handoff)

- Survey submissions: ~2,256 families across 50 states
- Court actors total: 226 rows, all `extracted_*` (admin-only)
- Court actors surfacing publicly: 0 (none have hit the 5-family threshold yet — by design; `form_direct` submissions via the new Court Actors form section will start populating this as new surveys come in, plus anyone the admin promotes via ✓ Promote)
- Reported total financial loss: ~$378M aggregate

---

## The standard debug path for the nudge button

If "Send now from info@standwithmeg.com" errors:

1. **Red "Invalid login: 535-5.7.8"** → app password wrong, has spaces, or was created on a different Google account than `GOOGLE_SMTP_USER`. Regenerate, update `.env.local`, restart server.
2. **Red "Email sending not configured"** → `GOOGLE_SMTP_USER` or `GOOGLE_SMTP_PASSWORD` missing from `.env.local`. Or the server is running with a stale env — restart.
3. **"localhost refused to connect" in browser** → dev server crashed. Check the terminal for errors. If "Turbopack not supported" — you forgot the `--webpack` flag.
4. **Email sends but shows "From: founder@" instead of info@** → expected with current setup (see Gotchas). Replies still go to info@.
