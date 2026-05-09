# Handoff — Court Actor Review Pre-Deploy State

**Date:** 2026-05-09
**Status:** Local code complete · Supabase migrations applied · NOT deployed
**Prepared by:** Claude session under meg@standwithmeg.com

This document is the snapshot you need to read before pushing the court-actor review work to production tomorrow.

---

## 1. Migrations already applied to Supabase

All three are confirmed applied. Do **not** re-run unless verification shows otherwise.

| Migration | Purpose | Verification |
|---|---|---|
| `020_court_actor_alias_decisions.sql` | Same-actor / keep-separate decisions; canonical name + role per cluster | `select count(*) from court_actor_alias_decisions` returns rows |
| `021_court_actor_cluster_research.sql` | Durable research notes attached to a Possible Matches cluster | `select count(*) from court_actor_cluster_research` returns rows |
| `022_court_actor_row_review.sql` | Soft-review of individual `court_actors` rows (`duplicate` / `count_separately`) — never deletes | `select count(*) from court_actor_row_review` returns rows |

Verification queries:

```sql
select column_name from information_schema.columns where table_name = 'court_actor_alias_decisions';
select column_name from information_schema.columns where table_name = 'court_actor_cluster_research';
select column_name from information_schema.columns where table_name = 'court_actor_row_review';
```

---

## 2. Current decision state (snapshot at 2026-05-09 ~19:08 UTC)

| Table | Count | Notes |
|---|---|---|
| `court_actor_alias_decisions` (`same_actor`) | **42** | All by `meg@standwithmeg.com` |
| `court_actor_alias_decisions` (`keep_separate`) | **0** | None recorded |
| `court_actor_row_review` | **12** | 11 `duplicate`, 1 `count_separately` |
| `court_actor_cluster_research` | **1** | Kyle Hancock @ UT (Utah DOPL license note) |
| `court_actors` (form_direct) | **3,564** | Underlying truth — never deleted |
| `court_actors` (all sources) | **3,599** | Includes extracted_regex / extracted_ai (admin only) |
| Canonical actor buckets after merges | **3,065** | Down from 3,104 distinct (name × location) before merges |
| Public-eligible actors (≥ 3 families) | **22** | See section 3 |

Verify with:

```bash
cd website
npx tsx scripts/audit-court-actors.ts
```

Expect totals to match the table above (within reason — new submissions can add rows).

---

## 3. The 22 public-eligible actors

Each entry shows what `/report` and `/api/survey/court-actors` will surface after deploy.
"Public name source" = `alias_canonical` if a same_actor decision controls the display, otherwise `original_spelling` (the most-frequent reporter casing).

### Family count 5+

1. **Cynthia Hucks @ IA** — 10 families · 10 rows
   - Public role display: `Attorney (Opposing) + 1 role`
   - All reported roles: Attorney (Opposing) ×7, Attorney (Mine) ×3
   - Counties: Wapello ×7, Unknown ×1, Jefferson ×1
   - Public name source: original_spelling (no alias decision)
   - Concern: role split (Mine vs Opposing) — could be the same attorney representing different sides in different cases, or two different people. Worth a sanity check.

2. **Andy Bolton @ KS** — 7 families · 8 rows
   - Public role display: `GAL / Child Representative + 1 role`
   - All reported roles: GAL / Child Representative ×7, GAL/Childre Representative ×1 (typo)
   - Counties: Miami ×3, Johnson ×2, Franklin ×2, Miami county ×1
   - Public name source: original_spelling
   - Concern: minor typo on one role string; cosmetic only

3. **Jesse I. Santana @ CA** — 5 families · 5 rows
   - Public role display: `Judge`
   - Counties: Sutter County ×5
   - Public name source: original_spelling. Clean.

4. **Karl Hays @ TX** — 5 families · 5 rows
   - Public role display: `Judge`
   - Counties: Hays ×3, "Hays County Court," ×1
   - Public name source: original_spelling. Clean.

5. **Kristin Kanner @ FL** — 5 families · 5 rows
   - Public role display: `Judge`
   - Counties: Broward ×5
   - Public name source: original_spelling. Clean.
   - Note: Two reporter emails are `dresslerpatricia7@gmail.com` and `patricia.k.dressler@gmail.com` — looks like the same person (Patricia Dressler) using two emails. **Possible double-count.** Worth marking one email's row as duplicate via the row-review tool, OR confirming they really are different people.

6. **Naomi Catadeulla @ KS** — 5 families · 6 rows · **alias decision**
   - Canonical: `Naomi Catadeulla` (alias_canonical)
   - Canonical role: `Reunification Therapist`
   - Public role display: `Reunification Therapist (canonical) + 3 other reported roles`
   - All reported roles: Reunification Therapist ×3, Supervised Visitation Supervisor ×1, Therapist ×1, Therapist / Counselor ×1
   - Counties: Johnson ×4, Johnson County KS (Leawood) ×1, Miami ×1
   - Includes `meghann.r.miller@gmail.com` (your own submission). You are aware.
   - Cluster_key: `naomi catadeula|naomi cataudela|naomi cautadela|@KS`

### Family count 4

7. **Keven O'Grady @ KS** — 4 families · 4 rows
   - Public role display: `Judge + 1 role`
   - All reported roles: Judge ×3, "Judge " ×1 (trailing space)
   - Reporter emails include `founder@standwithmeg.com` (your own work email)
   - Concern: trailing-space role typo; cosmetic. Your submission is in the count.

8. **Nicole Warren @ OK** — 4 families · 5 rows
   - Public role display: `CPS Worker`
   - Counties: Canadian ×4, Oklahoma County ×1
   - Public name source: original_spelling. Clean.

9. **Randy McCalla @ KS** — 4 families · 4 rows
   - Public role display: `GAL / Child Representative + 1 role`
   - All reported roles: GAL / Child Representative ×3, Other ×1
   - Counties: Johnson ×3, Johnson county ×1
   - Reporter emails include `founder@standwithmeg.com` — your own submission.

### Family count 3

10. **Bud Dale @ KS** — 3 families · 5 rows
    - Public role display: `Custody Evaluator + 2 roles`
    - All reported roles: Custody Evaluator ×3, Attorney (Mine) ×1, GAL / Child Representative ×1
    - Counties: Shawnee ×4
    - Concern: 3-way role mix. Either Bud has worn multiple hats or some reporters miscategorized. Worth confirming before publishing.

11. **Cathrin Conklin @ UT** — 3 families · 4 rows · **alias decision**
    - Canonical: `Cathrin Conklin` (alias_canonical)
    - Canonical role: `Judge`
    - Public role display: `Judge`
    - **⚠ See Section 4-B — you said you wanted "Catherine" not "Cathrin". Currently saved canonical_name is `Cathrin Conklin`.**

12. **Cynthia Pickering @ OK** — 3 families · 3 rows
    - Public role display: `Judge`
    - Counties: Okmulgee county ×1, Okmulgee county family court ×1, Okmulgee ×1
    - Public name source: original_spelling. Clean.

13. **Darik Anderson @ MN** — 3 families · 3 rows
    - Public role display: `GAL / Child Representative`
    - Counties: Winona ×2, Winona County MN ×1
    - One reporter email has a typo (`justbelieve70@outlook.comas`). Cosmetic — does not affect counting.

14. **Jamie Vogt @ OK** — 3 families · 3 rows
    - Public role display: `Psychological Evaluator + 1 role`
    - All reported roles: Psychological Evaluator ×2, Therapist / Counselor ×1
    - Counties: Tulsa County ×2, Wagoner county ×1
    - Different counties may indicate same evaluator working multiple courts, or two different people. Worth a sanity check.

15. **Joan Anthony @ FL** — 3 families · 3 rows
    - Public role display: `Judge`
    - Counties: Seventh Circuit Court ×2, Volusia ×1
    - Public name source: original_spelling. Clean.

16. **Katie McClaflin @ KS** — 3 families · 4 rows
    - Public role display: `Attorney (Opposing)`
    - Counties: Johnson ×3
    - Reporter emails include `founder@standwithmeg.com` — your own submission.

17. **Kristen K Johnson @ OH** — 3 families · 3 rows · **alias decision**
    - Canonical: `Kristen K Johnson` (alias_canonical)
    - Canonical role: `Judge`
    - Cluster_key: `kristen johnson|kristin johnson|@OH`. Clean.

18. **Leah Case @ FL** — 3 families · 3 rows · **alias decision**
    - Canonical: `Leah Case` (alias_canonical)
    - Canonical role: `Judge`
    - Cluster_key: `lea case|leah case|@FL`. Clean.

19. **Maggie kuhl @ WV** — 3 families · 3 rows
    - **⚠ See Section 4-C — display canonical lower-cases the K. Most-frequent casing is actually `Maggie Kuhl` (capital K, 2 of 3 rows), so the public route's `mostFrequent(casingCounts)` will likely render `Maggie Kuhl` — but the bucket key picks up the lowercase variant. Consider locking with an alias decision.**
    - Public role display: `Attorney / GAL / Child Representative`
    - Counties: Putnam ×1, Putnam County ×1 (third row has no county listed)

20. **Monica Rawlins @ TX** — 3 families · 3 rows
    - Public role display: `Judge`
    - Counties (all unmerged spelling variants): "328th fort bend county Texas court" ×1, "Fort Bend" ×1, "Fort bend" ×1
    - Cosmetic noise in county text; counting is fine.

21. **Tammy Smith @ NC** — 3 families · 3 rows
    - Public role display: `Attorney (Opposing)`
    - Counties: Harnett County ×2, Harnett ×1. Clean.
    - Note: "Tammy Smith" is a common name. Confirm via NC Bar that this is one person, not three different attorneys with the same name in Harnett County.

22. **William F. Ebert III @ KS** — 3 families · 4 rows
    - Public role display: `Other + 1 role`
    - All reported roles: Other ×2, Attorney (Opposing) ×2
    - Counties: Shawnee County ×4
    - Concern: 50/50 split between "Other" and "Attorney (Opposing)". A canonical_role pick (probably `Attorney (Opposing)`) would clean this up. No alias decision yet.

---

## 4. Targeted issue findings

### A. Kyle Hancock @ UT — flagged, below threshold

- **Status:** Currently 2 distinct families. **Below the 3-family public threshold — not in the 22-actor list.**
- **Decision row:**
  - `cluster_key`: `kyle hancock|kyle handcock|@UT`
  - `decision`: `same_actor`
  - `canonical_name`: `Kyle Hancock`
  - `canonical_role`: `Psychological Evaluator`
  - `name_keys`: `[kyle hancock, kyle handcock]`
  - **`note`:** *(now populated as of 2026-05-09 19:07 UTC)*
    > BELOW THRESHOLD — NOT FOR PUBLIC THRESHOLD WITHOUT CONFIRMATION. Utah DOPL active psychologist license confirmed for Kyle Max Hancock, Wellsville (license 7453714-2501). However the two reports are not yet reconciled: Debbie Tidwell (Cache, Psychological Evaluator) vs Tristin Jensen (Weber, Custody Evaluator). Currently 2 distinct families. If a 3rd family names this actor in either spelling the bucket will auto-publish — REOPEN AND ADD CONFIRMATION BEFORE THAT HAPPENS. See linked research note for DOPL source.
  - `decided_by`: `meg@standwithmeg.com`
- **Linked research note** (`court_actor_cluster_research`):
  - "Meg found Utah DOPL active psychologist license for Kyle Max Hancock, Wellsville, license 7453714-2501. Needs reporter confirmation before merge because reports list Cache/Psychological Evaluator and Weber/Custody Evaluator."
  - source_url: https://secure.utah.gov/llv/search/index.html
- **Two source rows:**
  - `d4fc8644-ed46-4bd1-82db-3961de1ff774` — "Kyle Hancock" — Psychological Evaluator — Cache — Debbie Tidwell `debc62_9@hotmail.com` — submission `9575b979-…`
  - `b061ee09-014d-41d2-9a49-a91b09fc22bc` — "Kyle handcock" — Custody Evaluator — Weber — Tristin Jensen `simanktr@gmail.com` — submission `07f4c795-…`
- **Action before deploy:** none required. The decision note will travel with the row.
- **Action if a 3rd family ever names him:** reopen the cluster, nudge Debbie and Tristin to confirm the evaluator's name and licensing scope, then either re-mark same_actor with a confirmation note, or split into keep_separate.

### B. Conklin display — `Cathrin Conklin`, not `Catherine`

- **Currently saved canonical:** `Cathrin Conklin` (role: `Judge`)
- **You said earlier in this session that you wanted `Catherine` or `Hon. Catherine`. The current value will be the public display.**
- The public counting code uses `canonical_name` from the alias decision when present (verified by reading `/api/survey/court-actors` and `/api/actors/all`), so whatever you save here is what publishes.
- **To fix before deploy** (only if the legal name actually is "Catherine" — verify via Utah courts directory):
  ```sql
  update court_actor_alias_decisions
  set canonical_name = 'Catherine Conklin',
      updated_at = now()
  where cluster_key = 'cathrin conklin|cathrine conklin|@UT';
  ```
- **Or in the UI:** Possible Matches → Show decided → find the cluster → Reopen → edit the canonical name → Mark same actor again.

### C. Maggie kuhl @ WV — casing issue

- **Three source rows:**
  - "Maggie Kuhl" (capital K) — Putnam County — Brandon Brothers `brandonbrothers28@gmail.com`
  - "Maggie Kuhl" (capital K) — no county — Cristy Anderson `candwpluskids@gmail.com`
  - "Maggie kuhl" (lowercase k) — Putnam — Ashlie Byers `ashliebyers@yahoo.com`
- **No alias decision exists.** The bucket clusters them via the existing loose-name normalization (which is case-insensitive), so all 3 count toward the same family count of 3 ✓.
- **Public display name** comes from `mostFrequent(b.casingCounts)`. Two rows say `Maggie Kuhl`, one says `Maggie kuhl`. The public route should pick `Maggie Kuhl` (capital). My audit script accidentally surfaced `Maggie kuhl` because it walked rows in created_at order; the actual `/api/survey/court-actors` response will use the most-frequent casing.
- **Optional cleanup** (purely cosmetic): add an alias decision to lock the canonical:
  ```sql
  insert into court_actor_alias_decisions
    (cluster_key, location_key, decision, canonical_name, canonical_role, name_keys, variants, decided_by)
  values (
    'magie kuhl|@WV',
    'WV',
    'same_actor',
    'Maggie Kuhl',
    'GAL / Child Representative',
    array['magie kuhl'],
    '[]'::jsonb,
    'meg@standwithmeg.com'
  );
  ```
  Or do it from the admin UI by reviewing the cluster (it won't appear in Possible Matches because there's no spelling variation to flag — you'd need a manual decision via SQL).
- **Original `court_actors.name` rows are NOT touched.** Reporter spellings preserved.

### D. Hope Fruchtman role history — preserved in DB; partial in display

- **Decision row:**
  - canonical_name: `Hope Fruchtman`
  - canonical_role: `Judge`
  - variants snapshot stores BOTH `Attorney (Mine) ×1` (Phoenix) and `Judge ×1` (Maricopa county) — role history is durable in the alias_decisions row.
- **Currently 2 families (below the 3-family public threshold) — not in the 22-actor list.**
- **Known limitation:** the public route's `roleSummary()` builds its display string from reporter-level role counts (`b.roleCounts`), not from `canonical_role`. So even with a same_actor decision and canonical_role set, the display rolls up reporter roles. For Hope this would surface as `Attorney (Mine) + 1 role` (alphabetical tiebreak when both roles are at count 1), not `Judge + 1 reported role`.
  - Why this didn't bite anyone in the 22 publishers: every actor with `canonical_role` set also happens to have that role as the most-frequent reported role (Catadeulla = Reunification Therapist ×3, Conklin = Judge ×4, Johnson = Judge ×3, Case = Judge ×3, Hancock not yet public).
  - Recommendation: leave the limitation as-is for now; revisit if Hope reaches 3 families.
- **To fully honor canonical_role in display** would require a code change to `roleSummary()` in the three public routes — small, low-risk, but I'd rather you sleep on it before tomorrow's deploy than rush it tonight.

### E. Row-review safety — all 12 rows still present in court_actors

- 12 rows in `court_actor_row_review` (11 duplicate, 1 count_separately).
- All 12 referenced `court_actors.id` values are **still present** in `court_actors`. Zero deletions. Zero rewrites of `court_actors.name` or `court_actors.notes`. **Original reporter testimony is preserved exactly as submitted.**
- Verified by:
  ```sql
  select c.id, c.name, c.notes, r.decision
  from court_actor_row_review r
  join court_actors c on c.id = r.row_id;
  ```
  Returns 12 rows with original `name` and `notes` intact.
- The 12 rows continue to render in the admin Possible Matches panel (with a `duplicate` or `count_separately` badge) and would render in the admin All Reports tab the same way.

---

## 5. Remaining risks before deploy

1. **Conklin canonical may not be the spelling you want.** If "Catherine" was your intent, fix the canonical_name (4-B above) before deploy.
2. **Kristin Kanner @ FL** has two reporter emails that look like the same person (`dresslerpatricia7@gmail.com`, `patricia.k.dressler@gmail.com`). If they're the same family, the public count is overstated by 1. Worth verifying in the admin All Reports view tomorrow before shipping.
3. **Tammy Smith @ NC** is a common name — confirm via NC Bar that all 3 reports name the same attorney.
4. **Cynthia Hucks** has Attorney (Mine) ×3 and Attorney (Opposing) ×7 — possibly the same attorney representing different sides; possibly two different lawyers with the same name. Worth a sanity check.
5. **Bud Dale** has 3-way role mix (Custody Evaluator ×3 / Attorney (Mine) ×1 / GAL ×1). One actor wearing multiple hats, or a data entry mismatch — sanity-check.
6. **Kyle Hancock** is below threshold but the merge means a 3rd report would auto-publish. Decision note now flags this. If you want a hard block, reopen and convert to `keep_separate`.
7. **Hope Fruchtman role display** will say "Attorney (Mine) + 1 role" rather than "Judge" if she ever reaches threshold (limitation 4-D). Not blocking; below threshold today.

None of these are show-stoppers. They are pre-publish quality-of-truth concerns worth a fresh-eyes review tomorrow.

---

## 6. Code changes pending deploy (uncommitted)

These files are modified or new in the working tree. Nothing has been committed, pushed, or deployed.

**New files:**
- `website/supabase/migrations/020_court_actor_alias_decisions.sql`
- `website/supabase/migrations/021_court_actor_cluster_research.sql`
- `website/supabase/migrations/022_court_actor_row_review.sql`
- `website/lib/court-actor-similarity.ts`
- `website/app/api/admin/court-actors/possible-matches/route.ts`
- `website/app/api/admin/court-actors/cluster-research/route.ts`
- `website/app/api/admin/court-actors/row-review/route.ts`
- `website/app/(swm)/admin/_components/PossibleMatchesPanel.tsx`
- `website/scripts/audit-court-actors.ts`
- `website/HANDOFF-COURT-ACTOR-REVIEW-2026-05-09.md` (this file)

**Modified files:**
- `website/lib/court-actors.ts` — added `resolveFamilyKey`, `CourtActorRowReviewDecision`, `CourtActorAliasResolver`; `buildPublicCourtActors` now accepts an optional resolver
- `website/app/api/survey/court-actors/route.ts` — applies alias decisions and row reviews
- `website/app/api/actors/all/route.ts` — same
- `website/app/api/admin/court-actors/route.ts` — same; flat-list response now includes `review_decision` and `counts_publicly` per row
- `website/app/(swm)/admin/page.tsx` — added "Possible Matches" tab to the Court Actors panel selector

Migrations 020/021/022 are already applied in production Supabase. The route changes that read from these tables are local-only.

---

## 7. Commands that have passed in this session

```bash
cd website
npm run lint    # 0 errors, 6 pre-existing warnings (unchanged)
npm run build   # ✓ Compiled successfully; new routes registered:
                #   /api/admin/court-actors/possible-matches
                #   /api/admin/court-actors/cluster-research
                #   /api/admin/court-actors/row-review
npx tsx scripts/audit-court-actors.ts   # 3,599 rows · 0 inflated counts ·
                                         # 22 public-eligible · 0 regressions
```

Targeted regression test (handoff doc from 2026-05-01):

```bash
npx tsx -e "
import { buildPublicCourtActors } from './lib/court-actors';
const actors = buildPublicCourtActors([
  {role:'Judge',name:'Judge Jane Smith',court_or_county:'Ontario',state_code:null,location_key:'Canada',submission_id:'s1'},
  {role:'Judge',name:'Jane Smith',court_or_county:'Ontario',state_code:null,location_key:'Canada',submission_id:'s2'},
  {role:'Judge',name:'Hon. Jane Smith',court_or_county:'Ontario',state_code:null,location_key:'Canada',submission_id:'s3'},
  {role:'Judge',name:'Jane Smith',court_or_county:'Ontario',state_code:null,location_key:'United Kingdom',submission_id:'s4'},
  {role:'Judge',name:'Jane Smith',court_or_county:'Ontario',state_code:null,location_key:null,submission_id:'s5'},
]);
if (actors.length !== 1 || actors[0].location_key !== 'Canada' || actors[0].count !== 3) { process.exit(1) }
console.log('PASS')
"
```

---

## 8. Exact next steps before deploy (tomorrow)

In this order:

1. **Read this file fresh.**
2. **Fix Conklin canonical if you want "Catherine"** — section 4-B.
3. **Sanity-check the two Kristin Kanner Patricia emails** — section 5 item 2. If they're the same family, mark one row as duplicate via the row-review tool.
4. **Re-run the audit:**
   ```bash
   cd website
   npx tsx scripts/audit-court-actors.ts | head -30
   ```
   Confirm the public-eligible count is still in the expected ballpark (around 22, give or take any new submissions overnight).
5. **Verify the build is still clean:**
   ```bash
   npm run lint
   npm run build
   ```
6. **Spot-check the local dev server's public output:**
   ```bash
   npm run dev
   # then in browser:
   #   http://localhost:3000/api/survey/court-actors  (no filter, should list 22 actors)
   #   http://localhost:3000/api/survey/court-actors?location=UT
   #   http://localhost:3000/report  (signed in as a survey-gated user)
   ```
7. **Stage and commit** (pause for your approval):
   ```bash
   cd website
   git status   # review the file list
   git diff lib/court-actors.ts                            # look at the API surface
   git diff app/api/survey/court-actors/route.ts            # public counting changes
   ```
8. **Commit.** Suggested message body (single commit):
   ```
   feat(court-actors): admin alias + row-review system for spelling variants

   - Migrations 020/021/022 (already applied in production Supabase)
   - Possible Matches admin tab with same-actor / keep-separate decisions
   - Per-row soft-review (duplicate / count_separately) — never deletes rows
   - Cluster research notes (DOPL / judicial-directory findings)
   - Public counting routes apply alias canonical names + row reviews
   - Audit script: scripts/audit-court-actors.ts
   - 22 actors at the public 3-family threshold after merges
   ```
9. **Push to a feature branch** (do NOT push directly to main):
   ```bash
   git checkout -b court-actor-review
   git push -u origin court-actor-review
   ```
10. **Open a PR.** Vercel will create a preview deployment.
11. **Smoke-test the preview:**
    - Sign in to the preview's `/admin` and load the Court Actors panel.
    - Confirm the Possible Matches tab loads (`33 already decided` or higher).
    - Confirm `/report` shows the 22 actors.
    - Compare counts to the audit script output.
12. **Merge to main when satisfied.** Vercel auto-deploys to production.
13. **Production smoke-test** (against `my.standwithmeg.com`):
    ```bash
    curl -s "https://my.standwithmeg.com/api/survey/court-actors" | jq '.actors | length'
    # expect ~22
    ```
    Spot-check `/report` in your browser as a survey-gated user.

---

## 9. Hard rules

- **Do not delete rows from `court_actors`.** All cleanup is via `court_actor_row_review` (soft).
- **Do not weaken existing automatic merges** in `lib/court-actors.ts`. Casing, common titles, middle initials, and tail-doubled letters in long tokens stay merged automatically.
- **Public actor names must remain threshold-gated at 3 families** (`COURT_ACTOR_PUBLIC_THRESHOLD`). Do not lower this.
- **Only `source = 'form_direct'` rows count publicly.** Extracted regex/AI rows stay admin-only until promoted.
- **Reporter identity, submission_id, notes never appear in the public actor API.** Only role, name, court_or_county, state_code/location_key, and count.

---

## 10. If anything goes wrong on deploy

Roll back routes (revert the merge commit). The migrations are additive and safe to leave in place — public routes have fallbacks that ignore the new tables when they're queried but the responses don't depend on them being populated.

Hard reset of all admin decisions (last-resort, only if you decide to start fresh):
```sql
-- DESTRUCTIVE — only run if you intend to discard all decisions
truncate court_actor_alias_decisions;
truncate court_actor_cluster_research;
truncate court_actor_row_review;
```

This deletes the 42/1/12 admin-decision rows but does **not** touch any reporter testimony in `court_actors`. The site reverts to pre-merge counting.

---

## 11. Where to come back to this work

- This handoff: `website/HANDOFF-COURT-ACTOR-REVIEW-2026-05-09.md`
- Earlier handoff (location_key work): `HANDOFF-COURT-ACTORS-2026-05-01.md` (project root)
- Audit script: `website/scripts/audit-court-actors.ts`
- Admin entry point: `/admin` → Court Actors panel → Possible Matches tab

— end of handoff —
