-- ============================================================
-- Migration 009 — Fix movement_stats_by_state dedupe priority
--
-- Migration 006 intended survey_submissions to win when the same
-- (email, state) appears in both survey_submissions and legacy_submissions.
-- The previous ordering could choose legacy first. This also treats blank
-- emails as missing so anonymous/blank-email rows do not collapse together.
-- ============================================================

create or replace view movement_stats_by_state as
with combined as (
  select
    coalesce(state_of_occurrence, outside_us_country) as state,
    (state_of_occurrence is not null)                 as is_us,
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
    coalesce(state_of_occurrence, outside_us_country) as state,
    (state_of_occurrence is not null)                 as is_us,
    nullif(lower(trim(email)), '')                    as email_key,
    total_financial_loss::bigint                      as total_financial_loss,
    months_lost_parenting_time,
    custody_status,
    (is_pro_se ilike 'yes%')                          as is_pro_se_bool,
    false                                             as approved,
    created_at,
    1                                                 as source_priority
  from legacy_submissions
  where state_of_occurrence is not null
     or outside_us_country  is not null
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
