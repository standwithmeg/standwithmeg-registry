-- ============================================================
-- Migration 037 — quote_counts_by_state view
--
-- Backs GET /api/survey/quote-counts. That route previously paginated
-- through EVERY approved, public-shareable row into Node on each origin
-- fetch (once per ~60s per region behind the CDN) and counted in JS. This
-- view pushes the count down to Postgres so the route runs one cheap
-- grouped query instead. Country normalization still happens in the route
-- on the small grouped result, preserving behavior.
--
-- Idempotent: safe to re-run. Already applied to production on 2026-06-04.
-- ============================================================

create or replace view quote_counts_by_state as
select
  state_of_occurrence,
  outside_us_country,
  count(*) as n
from survey_submissions
where approved = true
  and impact_quote is not null
  and permission_to_share in ('public', 'anonymous', 'first_name')
group by state_of_occurrence, outside_us_country;
