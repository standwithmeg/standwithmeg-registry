-- ============================================================
-- Migration 014 — Count separate real cases in reporting dedupe
--
-- Default reporting still dedupes by normalized email + state. Admins can now
-- mark a reviewed row as count_separately when the same person has a separate
-- real case/court matter in the same state that should count in dashboards,
-- audit CSVs, and generated PDFs.
-- ============================================================

alter table admin_review_decisions
  drop constraint if exists admin_review_decisions_decision_check;

alter table admin_review_decisions
  add constraint admin_review_decisions_decision_check
  check (decision in ('keep', 'delete', 'count_separately'));

create index if not exists idx_admin_review_decisions_count_separately
  on admin_review_decisions (source_table, source_id)
  where decision = 'count_separately';

drop view if exists movement_stats_by_state;
create view movement_stats_by_state as
with combined as (
  select
    'survey_submissions'::text                         as source_table,
    id                                                as source_id,
    coalesce(nullif(upper(trim(state_of_occurrence)), ''),
             nullif(trim(outside_us_country), ''))    as state,
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
    'legacy_submissions'::text                        as source_table,
    id                                                as source_id,
    coalesce(nullif(upper(trim(state_of_occurrence)), ''),
             nullif(trim(outside_us_country), ''))    as state,
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
with_decisions as (
  select
    c.*,
    d.decision
  from combined c
  left join admin_review_decisions d
    on d.source_table = c.source_table
   and d.source_id = c.source_id
   and d.decision = 'count_separately'
),
keyed as (
  select
    *,
    case
      when decision = 'count_separately'
        then source_table || ':' || source_id::text
      else coalesce(email_key, source_table || ':' || source_id::text)
    end as reporting_family_key
  from with_decisions
),
deduped as (
  select distinct on (reporting_family_key, state)
    state, is_us, total_financial_loss, months_lost_parenting_time,
    custody_status, is_pro_se_bool, approved, created_at
  from keyed
  order by reporting_family_key, state, source_priority asc, created_at desc nulls last
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
