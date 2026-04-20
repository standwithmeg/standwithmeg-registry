-- ============================================================
-- Migration 006 — Dedup movement_stats_by_state across legacy+survey
--
-- Prior behavior: UNION ALL counted the same family twice if they
-- appeared in both legacy_submissions (old GHL snapshot) AND
-- survey_submissions (current sheet). After the import policy
-- became "dedup by (email, state)" the view needs to match.
--
-- New policy: a (normalized email, state) pair is counted at most once.
-- Survey rows win over legacy rows for the same pair — they have newer
-- data and can be approved/updated.
-- ============================================================

create or replace view movement_stats_by_state as
with combined as (
  -- Survey rows — authoritative, admin-editable
  select
    coalesce(state_of_occurrence, outside_us_country) as state,
    (state_of_occurrence is not null)                 as is_us,
    lower(trim(email))                                as email_key,
    total_financial_loss::bigint                       as total_financial_loss,
    months_lost_parenting_time,
    custody_status,
    is_pro_se                                         as is_pro_se_bool,
    approved,
    created_at,
    'survey'::text                                    as source
  from survey_submissions

  union all

  -- Legacy rows — historical imports
  select
    coalesce(state_of_occurrence, outside_us_country) as state,
    (state_of_occurrence is not null)                 as is_us,
    lower(trim(email))                                as email_key,
    total_financial_loss::bigint                       as total_financial_loss,
    months_lost_parenting_time,
    custody_status,
    (is_pro_se ilike 'yes%')                          as is_pro_se_bool,
    false                                             as approved,
    created_at,
    'legacy'::text                                    as source
  from legacy_submissions
  where state_of_occurrence is not null
     or outside_us_country  is not null
),
-- Collapse to one row per (email_key, state). When a family exists in both
-- tables for the same state, prefer the survey row (source sorts before
-- legacy alphabetically). Rows with no email each count as their own family
-- (can't dedup anonymous-email rows).
deduped as (
  select distinct on (coalesce(email_key, id::text || '-' || state), state)
    state, is_us, total_financial_loss, months_lost_parenting_time,
    custody_status, is_pro_se_bool, approved, created_at
  from (
    select *, row_number() over () as id from combined
  ) sub
  order by coalesce(email_key, id::text || '-' || state), state, source asc
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
