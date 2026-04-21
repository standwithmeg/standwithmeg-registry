# Launch Handoff — 2026-04-20

Stand With Meg + My Court Guide (Next.js 16.2.1)

## Where we are right now

**Goal:** ship `my.standwithmeg.com/survey` and `my.standwithmeg.com/report` today, on Cloudflare Pages, backed by Supabase, with all 34 state PDFs downloadable from the dashboard.

**Done this session:**

- State PDF generator (`../generate_state_pdf.py`) rewritten. Output: 1.23 MB avg per PDF (was 17 MB) — compressed cover images, tight layout, sanity caps, dynamic voice-card packing. All 34 PDFs regenerated into `../outputs/state_packets_pdf/`.
- Agent (`../agent.py`) cleaned up — deleted six old state-PDF functions + Google-Drive upload path. Option 16 now calls `sync_state_pdfs()` using the new MT-v2 design.
- Routes renamed: `/submit` → `/survey`, `/impact` → `/report`. Redirects in [next.config.ts](next.config.ts) so old URLs don't 404.
- GHL master xlsx → Supabase import run. **2,287 in `survey_submissions` + 94 in `legacy_submissions` = 2,381 total.** Dashboard will show real numbers day-one.
- Git repo: `/Volumes/2023 Big 18/standwithmeg/website` committed (154 files) + pushed to [github.com/standwithmeg/My-Legal-Tool](https://github.com/standwithmeg/My-Legal-Tool) (private).
- GitHub Desktop has one tiny uncommitted diff to [AGENTS.md](AGENTS.md) — ignorable, doc only.

**Still to do (in order):**

1. **Fix the state-PDF serving problem** — see "Critical gotcha" below
2. **Cloudflare Pages project** from the GitHub repo
3. **Next.js 16 build config** — `@opennextjs/cloudflare` adapter (not the older `@cloudflare/next-on-pages`, which last I checked only supported Next 15)
4. **Environment variables** copied into Cloudflare Pages UI
5. **Preview deploy** → smoke-test `/survey`, `/report`, `/admin` on `*.pages.dev`
6. **Custom domain** `my.standwithmeg.com` attached in Pages + CNAME in GoDaddy DNS
7. **Supabase sync** — run [scripts/sync-state-reports.ts](scripts/sync-state-reports.ts) so `state_resource_links.report_available = true` where the PDF exists
8. **Disconnect GHL form** — Meg removes the embed/link from the GoDaddy Builder site

---

## Critical gotcha: the state PDFs are not in the repo

`website/public/state-reports` is a **symlink** to `/Volumes/2023 Big 18/standwithmeg/outputs/state_packets_pdf/` (Meg's external drive).

When the code deploys to Cloudflare, the symlink will exist but the target won't — **download links from the dashboard will 404.**

### Recommended fix: commit the PDFs directly

42 MB total across 34 files, ~1.2 MB each. Under GitHub's 100 MB per-file limit and the 1 GB repo soft-warn. Regen is infrequent (only when Meg runs agent Option 16 on new data).

```bash
cd "/Volumes/2023 Big 18/standwithmeg/website/public"
rm state-reports                                        # remove symlink
mkdir state-reports
cp -a "/Volumes/2023 Big 18/standwithmeg/outputs/state_packets_pdf/"*.pdf state-reports/
cp "/Volumes/2023 Big 18/standwithmeg/outputs/state_packets_pdf/index.json" state-reports/
# commit in GitHub Desktop, push
```

### Alternative: Cloudflare R2

Bigger setup but cleaner long-term. Upload PDFs to R2, use R2 URLs in `state_resource_links.drive_folder_url`. Not needed for launch — commit-to-repo is fine for v1.

### Going forward

Every time Meg runs agent Option 16, the PDFs regenerate into `outputs/state_packets_pdf/`. We need to also copy them into `website/public/state-reports/` and push to GitHub. Options:

- Add a post-build step in the agent that `rsync`s into the website public folder and runs `git add` + `git commit` + `git push`
- Or Meg runs a small `refresh-reports.command` shell script after Option 16

---

## Cloudflare Pages setup (step-by-step)

### Step 1 — Create the project

1. Cloudflare dashboard → Workers & Pages → **Create application** → **Pages** tab → **Connect to Git**
2. Select the `standwithmeg/My-Legal-Tool` GitHub repo (authorize Cloudflare to access it if prompted)
3. Project name: `standwithmeg` (or anything — not linked to `uprise-remodeling` or any other project)
4. Production branch: `main`

### Step 2 — Build configuration

**Framework preset:** None (we configure manually because Cloudflare's built-in Next.js preset lags behind Next 16)

**Build command:**

```
npx @opennextjs/cloudflare@latest build
```

**Build output directory:**

```
.open-next/worker.js
```

Actually no — use this instead, `.open-next` outputs a Worker, not a static dir. The correct deploy flow for OpenNext on Cloudflare Pages:

**Build command:**
```
npm install && npx @opennextjs/cloudflare@latest build
```

**Build output directory:** `.open-next/assets` (static assets)

*If OpenNext fails,* fall back to `@cloudflare/next-on-pages`:
```
npx @cloudflare/next-on-pages@1
```
Output dir: `.vercel/output/static`. But this may break on Next.js 16 features — OpenNext is more compatible.

**Node version env var:** `NODE_VERSION=20` (set in Environment variables below)

### Step 3 — Environment variables

Cloudflare Pages → Settings → Environment variables → Production. Copy these from `website/.env.local` (which is git-ignored and sits on Meg's machine):

```
NEXT_PUBLIC_SUPABASE_URL=<from .env.local>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from .env.local>
SUPABASE_SERVICE_ROLE_KEY=<from .env.local>
ANTHROPIC_API_KEY=<from .env.local>
COURTLISTENER_API_KEY=<from .env.local>
GOVINFO_API_KEY=<from .env.local — currently placeholder>
NODE_VERSION=20
```

Set both **Production** and **Preview** scopes.

### Step 4 — First deploy

Click **Save and Deploy**. Build will take 3–6 min. You'll get a URL like `standwithmeg.pages.dev`.

### Step 5 — Smoke test on `*.pages.dev`

Test these URLs **before** attaching the custom domain:

- `/` — landing page, should load
- `/survey` — multi-step form renders, can submit a test row
- `/report?admin_preview=1` — dashboard shows 2,381 families, state table loads, PDF download links work (see gotcha above)
- `/admin` — only reachable after login

If any route 500s, open Cloudflare Pages → Deployments → the failed build → Build log and share it.

### Step 6 — Custom domain `my.standwithmeg.com`

In Cloudflare Pages → the project → **Custom domains** → **Set up a custom domain** → enter `my.standwithmeg.com`.

Cloudflare will give you a CNAME target (usually `standwithmeg.pages.dev`). Then:

**In GoDaddy DNS:**

1. Log into GoDaddy → `standwithmeg.com` → DNS
2. **Add record:**
   - Type: `CNAME`
   - Name: `my`
   - Value: `standwithmeg.pages.dev` (whatever Cloudflare shows)
   - TTL: 1 hour
3. Save. Propagation takes 5 min – 1 hour.

Verify: `https://my.standwithmeg.com/survey` loads.

---

## Update the Supabase resource table

After PDFs are live at `https://my.standwithmeg.com/state-reports/XX.pdf`, flip the availability flags:

```bash
cd "/Volumes/2023 Big 18/standwithmeg/website"
npx tsx --env-file=.env.local scripts/sync-state-reports.ts
```

This reads `outputs/state_packets_pdf/index.json` and sets `state_resource_links.report_available = true` + `drive_folder_url = /state-reports/XX.pdf` for every state with a PDF.

**Note:** the existing script writes `drive_folder_url` as a relative path (`/state-reports/XX.pdf`) which works because PDFs live on the same origin. No code change needed.

---

## Disconnect the GoDaddy Builder GHL form

This is the last step — do it ONLY after `/survey` is live on `my.standwithmeg.com`.

Meg's current `standwithmeg.com` is a GoDaddy Builder site. Somewhere on it is a button/embed/link that goes to a GHL-hosted form.

Meg needs to:
1. Log into GoDaddy Builder
2. Find every spot that links to the GHL form (Home page CTA, menu, footer, popup?)
3. Replace those links with `https://my.standwithmeg.com/survey`
4. Publish the Builder site

---

## Important files / paths

### External drive (agent + data — not in repo)
- `/Volumes/2023 Big 18/standwithmeg/agent.py` — main agent, Option 16 = build state PDFs
- `/Volumes/2023 Big 18/standwithmeg/generate_state_pdf.py` — PDF generator
- `/Volumes/2023 Big 18/standwithmeg/templates/state_report.html.j2` — PDF template
- `/Volumes/2023 Big 18/standwithmeg/outputs/SWM_MASTER_LATEST.xlsx` — merged GHL data
- `/Volumes/2023 Big 18/standwithmeg/outputs/state_packets_pdf/` — 34 state PDFs

### Website repo (this folder, on GitHub)
- [app/(swm)/survey/page.tsx](app/(swm)/survey/page.tsx) — public survey form
- [app/(swm)/report/page.tsx](app/(swm)/report/page.tsx) — public dashboard
- [app/(swm)/admin/page.tsx](app/(swm)/admin/page.tsx) — internal admin
- [app/api/survey/route.ts](app/api/survey/route.ts) — form POST endpoint
- [scripts/import-master.ts](scripts/import-master.ts) — xlsx → Supabase importer
- [scripts/sync-state-reports.ts](scripts/sync-state-reports.ts) — flips Supabase availability flags
- [supabase/migrations/](supabase/migrations/) — 8 SQL migrations (all already applied)

---

## Credentials / access summary

- **GitHub:** `standwithmeg` account, repo `My-Legal-Tool` (private)
- **Cloudflare:** `New Summit Digital` account
- **Supabase:** URL + keys in `.env.local` (Meg's machine only)
- **GoDaddy:** `standwithmeg.com` domain + Builder site + DNS
- **Anthropic / CourtListener / GovInfo:** keys in `.env.local`

---

## If something breaks

- **Cloudflare build fails on Next 16:** try `@cloudflare/next-on-pages@1` instead of OpenNext
- **500 on `/api/survey`:** env vars missing — check `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Cloudflare Pages env
- **Dashboard shows 0 families:** Supabase connection issue; run `scripts/check-counts.ts` to verify data is there
- **PDF download links 404:** see "Critical gotcha" — PDFs not in repo yet, commit them or set up R2
- **`/survey` form submits fail silently:** probably the custom domain isn't live yet, or CORS (shouldn't happen on same-origin)

---

## Next session starting point

### Progress log — 2026-04-21

**Done since original handoff:**

- ✅ State-PDF symlink replaced with real files. Commit `d40e109` "Commit state PDFs into repo for Cloudflare Pages serving" pushed to `origin/main`. 34 PDFs + `index.json` now live at `website/public/state-reports/` (42 MB in repo).
- ✅ Cloudflare Pages project **creation in progress** via dashboard (New Summit Digital account). Settings entered:
  - Project name: `standwithmeg`
  - Repo: `standwithmeg/My-Legal-Tool` (GitHub App installed on `standwithmeg` account, "All repositories")
  - Production branch: `main`
  - Root directory: `website`
  - Build command: `npm install && npx @opennextjs/cloudflare@latest build`
  - Build output: `.open-next/assets`
  - Framework preset: None

- 🔄 **Environment variables being pasted in**. 9 of 11 slots added with real values as of pause. The two skipped:
  - `GOVINFO_API_KEY` — still a placeholder in `.env.local`, skip until real key
  - `OPENAI_API_KEY` — empty in `.env.local`, skip
  - `CLOUDFLARE_*` — local-only, don't add

### Resume checklist (pick up here)

1. **Verify Meg finished the env-var paste in Cloudflare.** Expected 10 variables total: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ADMIN_EMAILS`, `NEXT_PUBLIC_APP_URL` (= `https://my.standwithmeg.com`), `COURTLISTENER_API_KEY`, `GEMINI_API_KEY`, `NODE_VERSION` (= `20`). *(11th if Stripe/Google SMTP needed for launch — currently skipped.)*
   - **Known gotcha**: on first pass Meg pasted the literal text `copy from .env.local` into several Value fields. Before Save and Deploy, eyeball each row — real values only.
2. **Click Save and Deploy.** Build runs 3–6 min via OpenNext adapter on `@opennextjs/cloudflare@latest`. URL will be `standwithmeg.pages.dev`.
3. **If build fails:** grab last ~30 lines of build log from Cloudflare Pages → Deployments → failed run. Fallback path: `npx @cloudflare/next-on-pages@1`, output dir `.vercel/output/static` — but Next 16 may not be supported there.
4. **Smoke test on `*.pages.dev`** before custom domain:
   - `/` landing loads
   - `/survey` form renders + submits (test row)
   - `/report?admin_preview=1` shows 2,381 families + state table with working PDF links (now that PDFs are in repo)
   - `/admin` requires login
5. **Custom domain**: attach `my.standwithmeg.com` in Cloudflare Pages → add CNAME in GoDaddy DNS pointing `my` → `standwithmeg.pages.dev`. GoDaddy, not Cloudflare — `standwithmeg.com` zone is NOT in Cloudflare. (Zones in CF: `aiauditengine.com`, `cookingwithmarlene.com`, `lanecpasolutions.com`, `upriseremodeling.com`.)
6. **Flip availability flags**: `cd website && npx tsx --env-file=.env.local scripts/sync-state-reports.ts`
7. **Meg disconnects GHL form** in GoDaddy Builder, swap to `https://my.standwithmeg.com/survey`.

### Useful state verification commands

```bash
# Confirm we haven't lost data
cd "/Volumes/2023 Big 18/standwithmeg/website" && npx tsx --env-file=.env.local scripts/check-counts.ts
# Should show 2,287 + 94 = 2,381

# Confirm the PDF commit is on origin
cd "/Volumes/2023 Big 18/standwithmeg/website" && git log --oneline origin/main | head -3
# Top commit should be d40e109 "Commit state PDFs into repo..."
```

### Cloudflare account reference
- Account: New Summit Digital
- Account ID: `eb33b313a206ede06b38767d7c8d64cc`
- API token + account/zone IDs live in Meg's shell env (`.env.local` CLOUDFLARE_*) — note: token may lack Pages API perms (hit 9106 error), dashboard is the reliable path for now.
