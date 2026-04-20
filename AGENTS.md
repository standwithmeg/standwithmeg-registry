<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Stand With Meg Website Instructions

Use this file for Codex-style work inside the website app.

## Default Workflow

- Inspect the relevant route, component, API, and data files before editing.
- Keep changes scoped to the requested behavior.
- Preserve user edits and unrelated local work.
- Prefer existing components, styles, and Supabase helpers.
- Run focused verification before the final response.

## Commands

```bash
npm run dev
npm run build
npm run lint
```

## Stack

- Next.js `16.2.1`
- React `19.2.4`
- Tailwind CSS `4`
- Supabase SSR/client packages
- TypeScript

## Supabase Work

Before changing database, auth, survey, or server data flows, read the relevant local docs:

- `SUPABASE_ARCHITECTURE.md`
- `SUPABASE_NEXT_INTEGRATION.md`
- `SUPABASE_QUICK_REFERENCE.md`
- `SUPABASE_TROUBLESHOOTING.md`

Do not invent schema details. Verify table names, columns, policies, and environment variable names from local files or docs.

For Court Actors, dashboard access, state resources, survey quote visibility, or My Court Guide AI assistant work, also read:

- `../POKEE_CLAW_WORKSPACE_INDEX.md`
- `../pokee_claw_workspace_20260420/HANDOFF-COURT-ACTORS.md`
- `../pokee_claw_workspace_20260420/AI_ASSISTANT_SPEC.md`

Important constraints from the Pokeé archive:

- Court Actors public output must threshold-gate names and only count trusted `form_direct` entries.
- Extracted `regex` or `ai` actor rows are admin-only until promoted.
- Large Supabase reads need explicit pagination instead of assuming one `.select()` returns everything.
- Restart the dev server after `.env.local` changes.
- If Turbopack native bindings fail on the external drive, use `PATH="/usr/local/bin:$PATH" npx next dev --webpack`.

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

For longer investigative/video/story work, use the local skills:

- `.agents/skills/meg-voice-exposure-engine/`
- `.agents/skills/source-to-video-story/`

## Done Criteria

Before saying the work is complete:

- Run `npm run lint` or explain why it could not run.
- Run `npm run build` for production-impacting changes when practical.
- Start `npm run dev` and provide the local URL for interactive UI work when useful.
- Summarize changed files and verification results.
