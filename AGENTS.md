<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Codex Adapter: Stand With Meg Registry

This file is the Codex-facing adapter for this project. Claude Code reads `CLAUDE.md`, and `CLAUDE.md` delegates here with `@AGENTS.md`, so keep durable project rules in this file instead of duplicating long sections across tools.

Use this adapter to work safely in Codex while preserving the Claude-built project knowledge, scripts, and generated court-actor pipeline.

## Default Workflow

- Inspect the relevant route, component, API, script, and data files before editing.
- Keep changes scoped to the requested behavior.
- Preserve user edits, Claude-generated work, and unrelated local changes.
- Prefer existing components, styles, Supabase helpers, and share-page pipeline helpers.
- Run focused verification before reporting done.
- Before Git operations, check `git status --short --branch`; this repo often has generated assets and GitHub Actions commits moving at the same time.
- Do not let Claude Code and Codex both commit or push in the same repo at the same time.

## Commands

```bash
npm run dev
npm run build
npm run lint
npx tsc --noEmit
```

For local dev, Claude's launch config uses:

```bash
npm run dev -- --port 3001
```

## Stack

- Next.js `16.2.4`
- React `19.2.4`
- Tailwind CSS `4`
- Supabase SSR/client packages
- TypeScript
- Python share-page and PDF generation scripts

## Project Map

- `app/` - Next.js routes, pages, layouts, and API routes.
- `app/(swm)/` - Stand With Meg public app surfaces.
- `app/api/` - Server/API routes, including survey and court-actor endpoints.
- `lib/` - Shared TypeScript helpers and server/client utilities.
- `content/` - Content collections and reference material.
- `public/court-actors/` - Generated actor share pages, specs, frames, photos, and caches. Treat as generated output unless the task is explicitly about deployed actor assets.
- `public/state-reports/` - Generated public PDF reports.
- `scripts/share-pages/` - Court-actor spotlight/share-page build, render, prerender, manifest, and consistency tooling.
- `scripts/pdf/` - State PDF generation and public report sync tooling.
- `.github/workflows/` - CI, state PDF/share regeneration, and public actor photo-request workflows.
- `.claude/` - Claude Code local launch/settings. Keep local settings private.
- `.agents/skills/` - Project-local skills shared with Codex-style workflows. Do not put project skills in `.codex/skills/`.
- `.codex/agents/` - Project-local Codex agent TOML files, if Claude agents are later converted.
- `codex/config.toml` - Minimal project Codex config template. Do not put secrets here.
- `private-docs/` - Session handoffs, product plan, and continuity notes. Gitignored on purpose: this repo is public and these docs must never be committed (older versions contained submitter identities).
- `SUPABASE_*.md` - Local Supabase schema and operations documentation.

## Supabase Work

Before changing database, auth, survey, court-actor, dashboard, or server data flows, read the relevant local docs:

- `SUPABASE_ARCHITECTURE.md`
- `SUPABASE_NEXT_INTEGRATION.md`
- `SUPABASE_QUICK_REFERENCE.md`
- `SUPABASE_TROUBLESHOOTING.md`

Do not invent schema details. Verify table names, columns, policies, and environment variable names from local files or docs.

Important constraints from the Pokeé archive and existing project handoffs:

- Court Actors public output must threshold-gate names and only count trusted `form_direct` entries.
- Extracted `regex` or `ai` actor rows are admin-only until promoted.
- Large Supabase reads need explicit pagination instead of assuming one `.select()` returns everything.
- Restart the dev server after `.env.local` changes.
- If a live API lookup fails during share-page generation, prefer a recoverable warning/fallback over failing the entire generated batch.

## Gmail Integration

Gmail credentials can be provided either via `.env.local` or by placing the downloaded OAuth JSON file at `.gmail/credentials.json`:

```bash
# Option A: env vars in .env.local (never commit)
GMAIL_CLIENT_ID=812651817579-s1nq33b5ehoa3j60teeg7dr4t14egdqv.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=YOUR_CLIENT_SECRET_FROM_GOOGLE_CLOUD_CONSOLE
GMAIL_REDIRECT_URI=https://my.standwithmeg.com/api/gmail/callback
```

```bash
# Option B: copy the downloaded JSON credentials file
mkdir -p .gmail
cp ~/Downloads/client_secret_*.apps.googleusercontent.com.json .gmail/credentials.json
```

The credentials JSON is gitignored by `.gmail/.gitignore` and must never be committed.

To authenticate the first time, visit `/api/gmail/auth` while signed in as a founder/admin. After OAuth approval, the refresh token is stored in the `gmail_tokens` table and reused automatically.

## Share-Page And Generated Asset Work

- Search `scripts/share-pages/` first before changing frame counts, frame IDs, manifests, actor rendering, or quote selection.
- Treat `public/court-actors/**/spec.json`, `share.html`, `frame-*.jpg`, and `.regen-cache.json` as generated outputs unless the task is to patch deployed assets directly.
- When resolving Git conflicts in generated actor files after a rebase, inspect whether the conflict is generated-only before choosing either side.
- Do not manually delete generated actor folders without confirming the manifest and regeneration scripts.
- Live court-actor posting must write the resolved public bucket display name into `public/court-actors/manifest.json`; do not trust a typed admin display name if the bucket resolved a different canonical name.
- Do not treat a generated share page as ready if `spec.json["unresolved"]` says `court_actors: no rows match` and there are no `public_comments` or `family_reports`; fix the manifest/bucket/name first, then force regeneration.
- Quote slides must preserve all publishable, non-duplicative parent comments. If more comments fit than one slide can hold, the renderer should create another `WHAT FAMILIES SAY` slide instead of dropping quotes.
- ONE quote per family. `_merge_family_comments` in `scripts/pdf/lib_supabase_rows.py` collapses each family's notes (keyed by reporter email|location) into a single merged comment: near-duplicate retellings drop (longest variant wins), distinct notes join most-recent-first, and the family's LATEST submission's `permission_to_share` decides whether any of their text appears. The raw-notes fallback in `spotlight_build.py` merges per submission the same way. Do NOT add token-similarity dedup to `render_spotlight.story_quotes` — at render time family attribution is gone and two distinct families can phrase near-identical experiences (the pagination tests in `test_quote_selection.py` lock this in).
- Both share slides and the state PDF consume `load_public_court_actors_from_supabase`, so per-family comment rules belong there — never patch one surface only. Regression tests: `scripts/share-pages/test_family_quote_merge.py`.
- If `manifest.json` advertises `photo_url`, the regenerated `spec.json` must have `photo.exists=true` and `share.html` must not contain `{{ACTOR.IMAGE_URL}}`; otherwise the public card has a portrait but the social template will still show the placeholder.
- `/api/survey/court-actors` must fall back to `loadStaticPublicActors()` when Supabase reads timeout or fail. Do not return `{ actors: [] }` for transient live-data failures, because the public report hides the live actor panel when it sees an empty actor list.
- Admin "Regen PDF + slides" and "Fix PDF + slides" actions must force share-page regeneration (`force: "true"`) so a stale `.regen-cache.json` cannot skip quote-slide or photo/template repairs.
- One public card per person. Re-deploying an actor under a corrected display name must replace the prior `manifest.json` entry, not add a second one — `addActorToManifest` dedupes by `actor_bucket_key`. `verify_share_consistency.py` fails if two entries share a bucket key or a state + normalized person identity (honorific/spelling-tolerant). When you find an existing duplicate pair, keep the entry whose family count resolves against the live API (its `spec.unresolved` is empty); the orphan's bucket key does not match Supabase.

## UI Work

- Build usable application screens, not placeholder landing sections.
- Keep hierarchy clear, mobile layouts clean, and calls to action obvious.
- Use restrained design choices that fit advocacy, trust, evidence, and direct action.
- Check that text does not overlap or overflow on mobile.
- Use image/video assets where they materially help the story or conversion path.

## Content Voice

For Meg-facing public copy:

- Direct, grounded, emotionally real.
- Pattern-focused and evidence-aware.
- No fluffy empowerment language.
- No therapy-coach tone.
- Connect personal experience to system-level issues when relevant.

For named accusations, registry excerpts, or court-actor content, keep language legally careful:

- Label allegations as allegations unless a source supports stronger wording.
- Do not expose registry submitter identities.
- Avoid unsupported claims of criminal conduct, corruption, abuse, fraud, perjury, diagnosis, or intent.
- Prefer sourced phrasing such as "records reflect," "the filing alleges," "the order states," or "Meg alleges" when accurate.

## Claude And Codex Working Together

- Claude Code is best for long batch generation, repetitive actor/content work, and existing Claude workflows.
- Codex is best for repo hygiene, Git conflicts, CI/build failures, code review, adapter setup, and narrow fixes.
- Before switching tools, run `git status --short --branch`.
- If Claude changed files, tell Codex to inspect status first and not overwrite Claude's work.
- If Codex changes or pushes a commit, tell Claude to pull latest before continuing.

## Done Criteria

Before saying work is complete:

- Run `npm run lint` or explain why it was not relevant or could not run.
- Run `npm run build` for production-impacting code changes when practical.
- For Python-only script fixes, run `python3 -m py_compile` with `PYTHONPYCACHEPREFIX=/tmp/codex-pycache` if macOS cache permissions block normal bytecode writes.
- Start `npm run dev` and provide the local URL for interactive UI work when useful.
- Summarize changed files and verification results.
