-- ============================================================
-- Migration 010 — Fix legacy rows with mis-imported locations
--
-- Background: scripts/import_survey_history.py blindly trusted the
-- "OUTSITE OF THE STATES?" CSV column as an ISO country code, but that
-- column in the master CSV was dirty (county names, timezones, URLs,
-- even a duplicate header row). Result: 6 legacy rows landed with
-- garbage country codes (CA, AS, GG) and a 7th was the literal CSV
-- header row imported as data.
--
-- This migration fixes them surgically by email + first_name so we do
-- not disturb genuine international submissions.
-- ============================================================

-- 1. Delete the imported-header ghost row
delete from legacy_submissions
where first_name = 'First Name'
   or email = 'Email';

-- 2. Jackie Hlushak — Edmonton, Alberta (this is Canada, not Alabama)
update legacy_submissions
set state_of_occurrence = null,
    outside_us_country  = 'Canada'
where lower(email) = 'jackiehlushak@outlook.com'
  and outside_us_country in ('CA', 'ca');

-- 3. Katharina Froese — county literally says "Canada"
update legacy_submissions
set state_of_occurrence = null,
    outside_us_country  = 'Canada'
where lower(email) = 'kathyfroese3@gmail.com'
  and case_county = 'Canada';

-- 4. Rhianna Harman — Ohio (Guernsey county). outside="GG" is garbage.
update legacy_submissions
set outside_us_country = null
where lower(email) = 'immabeach65@gmail.com'
  and state_of_occurrence = 'OH'
  and outside_us_country in ('GG', 'gg');

-- 5. Lea Rosen — Maryland. outside="CA" is garbage.
update legacy_submissions
set outside_us_country = null
where lower(email) = 'mumof3first@gmail.com'
  and state_of_occurrence = 'MD'
  and outside_us_country in ('CA', 'ca');

-- 6. Sarah Kirkpatrick — Oregon, Benton county. outside="AS" is garbage.
update legacy_submissions
set outside_us_country = null
where lower(email) = 'sarskaggs@yahoo.com'
  and state_of_occurrence = 'OR'
  and outside_us_country in ('AS', 'as');

-- 7. Defensive view update — normalize state and country by upper(trim())
--    so future rows with "al ", "Al", "ca " do not split into separate
--    rows on the dashboard.
--    DROP + CREATE (not CREATE OR REPLACE) because the column type for
--    "state" changes from bpchar (char(2)) to text, which CREATE OR
--    REPLACE disallows.
drop view if exists movement_stats_by_state;
create view movement_stats_by_state as
with combined as (
  select
    coalesce(nullif(upper(trim(state_of_occurrence)), ''),
             nullif(trim(outside_us_country), ''))     as state,
    (nullif(upper(trim(state_of_occurrence)), '') is not null) as is_us,
    nullif(lower(trim(email)), '')                    as email_key,
    total_financial_loss::bigint                      as total_financial_loss,
    months_lost_parenting_time,
    custody_status,
    is_pro_se                                         as is_pro_se_bool,
    approved,
    created_at,
    0                                                 as source_priority
  from survey_submissions

  union all

  select
    coalesce(nullif(upper(trim(state_of_occurrence)), ''),
             nullif(trim(outside_us_country), ''))     as state,
    (nullif(upper(trim(state_of_occurrence)), '') is not null) as is_us,
    nullif(lower(trim(email)), '')                    as email_key,
    total_financial_loss::bigint                      as total_financial_loss,
    months_lost_parenting_time,
    custody_status,
    (is_pro_se ilike 'yes%')                          as is_pro_se_bool,
    false                                             as approved,
    created_at,
    1                                                 as source_priority
  from legacy_submissions
  where (nullif(upper(trim(state_of_occurrence)), '') is not null)
     or (nullif(trim(outside_us_country), '') is not null)
),
deduped as (
  select distinct on (coalesce(email_key, row_id::text || '-' || state), state)
    state, is_us, total_financial_loss, months_lost_parenting_time,
    custody_status, is_pro_se_bool, approved, created_at
  from (
    select *, row_number() over () as row_id from combined
  ) sub
  order by coalesce(email_key, row_id::text || '-' || state), state, source_priority asc, created_at desc nulls last
)
select
  state,
  is_us,
  count(*)                                          as total_submissions,
  count(*) filter (where approved)                  as approved_count,

  round(avg(
    case when total_financial_loss <= 5000000
         then total_financial_loss else null end
  )::numeric, 2)                                    as avg_financial_loss,

  round(sum(
    case when total_financial_loss <= 5000000
         then total_financial_loss else null end
  )::numeric, 2)                                    as total_financial_loss,

  round(avg(
    case when months_lost_parenting_time <= 360
         then months_lost_parenting_time else null end
  )::numeric, 1)                                    as avg_months_lost,

  count(*) filter (
    where custody_status = 'No Contact / Total Loss of Access'
  )                                                 as total_loss_count,
  count(*) filter (where is_pro_se_bool)            as pro_se_count,
  max(created_at)                                   as last_submission_at
from deduped
where state is not null
group by state, is_us
order by total_submissions desc;
