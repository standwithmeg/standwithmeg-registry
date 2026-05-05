-- ============================================================
-- Migration 020 — Financial-fingerprint dedup in movement_stats_by_state
--
-- The PDF generator (scripts/pdf/lib_supabase_rows.py) does TWO passes
-- of dedup before computing per-state totals:
--
--   1. (email_key, state) — already mirrored in migration 014's view,
--      with admin_review_decisions.count_separately overrides.
--
--   2. (state, county, expense_vector + months_lost) — catches "twin
--      pair" rows that share byte-identical financial sections without
--      an email match (one or both anonymous, so they survive pass 1
--      under distinct synthetic anon keys). These are exactly the
--      cases the burden-floor-and-dedup audit found in OK ($1.13M),
--      PA ($356K), and KS (multiple pairs).
--
-- Without pass 2 in the SQL view, dashboard family counts stay higher
-- than the PDF family counts that ship to readers, surfacing as
-- persistent count_mismatch flags in the admin reporting audit even
-- after fresh PDF regeneration. This migration adds pass 2 so the two
-- counts stay in sync.
--
-- Mirrors _financial_fingerprint() in lib_supabase_rows.py:
--   - state: state_of_occurrence only (international rows: empty
--     string, matching Python behaviour)
--   - county: case_county lower+trim
--   - financial vector: 7 expense fields rounded to 2dp + months_lost,
--     all coalesced to '' for null
--   - signal gate: skip dedup entirely if every numeric field is 0
--     (an empty-financial row can't be confidently matched to another
--     empty-financial row from a different family)
--   - admin_review_decisions.count_separately rows always bypass pass
--     2, same as Python.
-- ============================================================

drop view if exists movement_stats_by_state;
create view movement_stats_by_state as
with combined as (
  select
    'survey_submissions'::text                         as source_table,
    id                                                as source_id,
    nullif(upper(trim(state_of_occurrence)), '')      as state_us,
    coalesce(nullif(upper(trim(state_of_occurrence)), ''),
             nullif(trim(outside_us_country), ''))    as state,
    (nullif(upper(trim(state_of_occurrence)), '') is not null) as is_us,
    nullif(lower(trim(email)), '')                    as email_key,
    nullif(lower(trim(case_county)), '')              as case_county_norm,
    total_financial_loss::bigint                      as total_financial_loss,
    months_lost_parenting_time,
    custody_status,
    is_pro_se                                         as is_pro_se_bool,
    approved,
    created_at,
    0                                                 as source_priority,
    attorney_fees,
    gal_fees,
    therapy_eval_fees,
    reunification_fees,
    other_court_actors_fees,
    lost_wages,
    asset_liquidation_loss
  from survey_submissions

  union all

  select
    'legacy_submissions'::text                        as source_table,
    id                                                as source_id,
    nullif(upper(trim(state_of_occurrence)), '')      as state_us,
    coalesce(nullif(upper(trim(state_of_occurrence)), ''),
             nullif(trim(outside_us_country), ''))    as state,
    (nullif(upper(trim(state_of_occurrence)), '') is not null) as is_us,
    nullif(lower(trim(email)), '')                    as email_key,
    nullif(lower(trim(case_county)), '')              as case_county_norm,
    total_financial_loss::bigint                      as total_financial_loss,
    months_lost_parenting_time,
    custody_status,
    (is_pro_se ilike 'yes%')                          as is_pro_se_bool,
    false                                             as approved,
    created_at,
    1                                                 as source_priority,
    attorney_fees,
    gal_fees,
    therapy_eval_fees,
    reunification_fees,
    other_court_actors_fees,
    lost_wages,
    asset_liquidation_loss
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
pass1_deduped as (
  -- Pass 1: (email_key, state) dedup — same as migration 014.
  select distinct on (reporting_family_key, state)
    state, state_us, is_us,
    case_county_norm, source_table, source_id, decision,
    total_financial_loss, months_lost_parenting_time,
    custody_status, is_pro_se_bool, approved, created_at,
    source_priority,
    attorney_fees, gal_fees, therapy_eval_fees, reunification_fees,
    other_court_actors_fees, lost_wages, asset_liquidation_loss
  from keyed
  order by reporting_family_key, state, source_priority asc, created_at desc nulls last
),
fingerprinted as (
  select
    *,
    case
      when (
        coalesce(attorney_fees, 0)            > 0
        or coalesce(gal_fees, 0)              > 0
        or coalesce(therapy_eval_fees, 0)     > 0
        or coalesce(reunification_fees, 0)    > 0
        or coalesce(other_court_actors_fees, 0) > 0
        or coalesce(lost_wages, 0)            > 0
        or coalesce(asset_liquidation_loss, 0) > 0
        or coalesce(months_lost_parenting_time, 0) > 0
      )
      then concat_ws(
        '|',
        coalesce(state_us, ''),
        coalesce(case_county_norm, ''),
        coalesce(round(attorney_fees::numeric, 2)::text, ''),
        coalesce(round(gal_fees::numeric, 2)::text, ''),
        coalesce(round(therapy_eval_fees::numeric, 2)::text, ''),
        coalesce(round(reunification_fees::numeric, 2)::text, ''),
        coalesce(round(other_court_actors_fees::numeric, 2)::text, ''),
        coalesce(round(lost_wages::numeric, 2)::text, ''),
        coalesce(round(asset_liquidation_loss::numeric, 2)::text, ''),
        coalesce(months_lost_parenting_time::text, '')
      )
      else null
    end as financial_fingerprint
  from pass1_deduped
),
pass2_ranked as (
  -- Pass 2: financial-fingerprint dedup. Survey rows beat legacy on
  -- ties; newer beats older within the same priority.
  --
  -- count_separately rows and rows with no fingerprint must (a) always
  -- survive and (b) not consume a slot in another row's fingerprint
  -- group. Mirrors lib_supabase_rows.py:_dedup pass 2, where the
  -- count_separately branch appends to `out` without touching
  -- `seen_fp`. Achieved here by giving each bypass row its own unique
  -- partition key so row_number() always returns 1 for it, and so it
  -- never partitions alongside a competing non-bypass row sharing the
  -- same fingerprint.
  select
    *,
    row_number() over (
      partition by case
        when financial_fingerprint is null
          or decision = 'count_separately'
          then 'BYPASS:' || source_table || ':' || source_id::text
        else financial_fingerprint
      end
      order by source_priority asc, created_at desc nulls last
    ) as fp_rank
  from fingerprinted
),
deduped as (
  select state, is_us, total_financial_loss, months_lost_parenting_time,
         custody_status, is_pro_se_bool, approved, created_at
  from pass2_ranked
  where fp_rank = 1
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
