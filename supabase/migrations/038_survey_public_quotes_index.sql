-- ============================================================
-- Migration 038 — partial index for the public quotes query
--
-- GET /api/survey/quotes filters approved + public-shareable + non-null
-- impact_quote, ordered by created_at desc. The existing single-column
-- indexes don't cover this well (approved is a low-selectivity boolean), so
-- the planner still scans + sorts. This partial index pre-filters to exactly
-- the public-quote set, already ordered by created_at desc.
--
-- Built non-CONCURRENTLY: survey_submissions is small, so the brief lock is
-- harmless and this runs cleanly in the SQL Editor.
--
-- Idempotent: safe to re-run. Already applied to production on 2026-06-04.
-- ============================================================

drop index if exists idx_survey_public_quotes;
create index if not exists idx_survey_public_quotes
  on survey_submissions (created_at desc)
  where approved = true
    and impact_quote is not null
    and permission_to_share in ('public', 'anonymous', 'first_name');
