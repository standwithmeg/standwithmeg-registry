-- ============================================================
-- Migration 003 — Fix survey_stats_by_state view
--
-- Fixes:
--   1. pro_se_count: column is boolean in the live table.
--      Use `is_pro_se = true` (no quotes) for correct,
--      type-safe comparison. The old string literal 'true'
--      happened to work via Postgres implicit casting but
--      was fragile and misleading.
--   2. Adds is_us boolean column so the admin dashboard can
--      distinguish US-state rows from international-country rows
--      without a second query.
--
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

create or replace view survey_stats_by_state as
select
  coalesce(state_of_occurrence, outside_us_country)  as state,
  (state_of_occurrence is not null)                  as is_us,
  count(*)                                            as total_submissions,
  count(*) filter (where approved)                   as approved_count,
  round(avg(total_financial_loss)::numeric, 2)       as avg_financial_loss,
  round(sum(total_financial_loss)::numeric, 2)       as total_financial_loss,
  round(avg(months_lost_parenting_time)::numeric, 1) as avg_months_lost,
  count(*) filter (
    where custody_status = 'No Contact / Total Loss of Access'
  )                                                   as total_loss_count,
  count(*) filter (
    where is_pro_se = true
  )                                                   as pro_se_count,
  max(created_at)                                     as last_submission_at
from survey_submissions
group by coalesce(state_of_occurrence, outside_us_country),
         (state_of_occurrence is not null)
order by total_submissions desc;
