-- ============================================================
-- Migration 004 — Legacy Submissions + Movement Stats View
--
-- Creates:
--   1. legacy_submissions  — historical records from the early
--      SWM survey form that are missing fields required by
--      survey_submissions (impact_quote, permission_to_share).
--      All columns nullable. survey_submissions schema unchanged.
--
--   2. movement_stats_by_state — unified reporting view that
--      combines survey_submissions + legacy_submissions so the
--      admin dashboard shows the full movement/master dataset.
--      survey_stats_by_state is preserved for any existing queries.
--
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ── 1. legacy_submissions ────────────────────────────────────

create table if not exists legacy_submissions (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz,            -- null = submission date unknown
  imported_at timestamptz not null default now(),

  -- ── Location ─────────────────────────────────────────────
  state_of_occurrence  char(2),
  outside_us_country   text,

  -- ── Case details ─────────────────────────────────────────
  case_county           text,
  case_status           text,
  number_of_kids        integer,
  system_affected       text,
  time_in_system        text,
  custody_status        text,
  is_pro_se             text,         -- stored as raw text ("Yes"/"No"/full answer)
  legal_rep_history     text,

  -- ── Allegations ──────────────────────────────────────────
  allegation_type           text,
  allegation_other_detail   text,
  allegation_root_cause     text,
  due_process_checklist     text[],
  other_allegation_details  text,

  -- ── Conflict + funding ───────────────────────────────────
  conflict_of_interest_awareness text,
  conflict_description           text,
  federal_funding_influence      text,

  -- ── Stolen time ──────────────────────────────────────────
  months_lost_parenting_time integer,
  lost_milestones_description text,

  -- ── Financial impact ─────────────────────────────────────
  attorney_fees           integer,
  gal_fees                integer,
  therapy_eval_fees       integer,
  reunification_fees      integer,
  other_court_actors_fees integer,
  lost_wages              integer,
  asset_liquidation_loss  integer,

  -- Computed — kept in sync automatically
  total_financial_loss integer generated always as (
    coalesce(attorney_fees,           0) +
    coalesce(gal_fees,                0) +
    coalesce(therapy_eval_fees,       0) +
    coalesce(reunification_fees,      0) +
    coalesce(other_court_actors_fees, 0) +
    coalesce(lost_wages,              0) +
    coalesce(asset_liquidation_loss,  0)
  ) stored,

  -- ── Story fields (nullable — these were not captured) ────
  impact_quote        text,
  permission_to_share text,

  -- ── Identity (nullable — email may be missing/corrupted) ─
  first_name  text,
  last_name   text,
  email       text,

  -- ── Import metadata ──────────────────────────────────────
  -- 'legacy_v1'                — early form, missing quote/permission/date
  -- 'legacy_v1_email_corrupted' — newer form, email column shifted/garbled
  data_source text not null default 'legacy_v1'
);

-- Indexes for dashboard join performance
create index if not exists idx_legacy_state   on legacy_submissions (state_of_occurrence);
create index if not exists idx_legacy_country on legacy_submissions (outside_us_country);
create index if not exists idx_legacy_source  on legacy_submissions (data_source);


-- ── 2. movement_stats_by_state ───────────────────────────────
--
-- Unified view: survey_submissions (live + historical import)
-- UNION legacy_submissions (early-form records), grouped by state.
--
-- approved_count always reflects survey_submissions approvals only.
-- Legacy rows never appear in the approval workflow.
-- is_pro_se is cast: survey_submissions has boolean, legacy has text.
-- ─────────────────────────────────────────────────────────────

create or replace view movement_stats_by_state as
with combined as (

  -- Live + imported records from the full-schema table
  -- Cast to bigint before aggregation: sum(numeric) across thousands of rows
  -- with six-figure values exceeds integer range (2,147,483,647).
  select
    coalesce(state_of_occurrence, outside_us_country) as state,
    (state_of_occurrence is not null)                 as is_us,
    total_financial_loss::bigint,
    months_lost_parenting_time,
    custody_status,
    is_pro_se                                         as is_pro_se_bool,
    approved,
    created_at
  from survey_submissions

  union all

  -- Early-form and email-corrupted historical records
  select
    coalesce(state_of_occurrence, outside_us_country) as state,
    (state_of_occurrence is not null)                 as is_us,
    total_financial_loss::bigint,
    months_lost_parenting_time,
    custody_status,
    (is_pro_se ilike 'yes%')                          as is_pro_se_bool,
    false                                             as approved,   -- legacy rows never approved
    created_at
  from legacy_submissions
  where state_of_occurrence is not null
     or outside_us_country  is not null

)
-- Outlier thresholds applied here — raw data in the tables is never modified.
-- Rows above these thresholds still count toward total_submissions and all
-- other metrics; their financial/time values are simply excluded from aggregates.
--
--   total_financial_loss > $5,000,000  → clearly bogus (cap artifacts, test entries)
--   months_lost_parenting_time > 360   → physically impossible (> 30 years)
select
  state,
  is_us,
  count(*)                                               as total_submissions,
  count(*) filter (where approved)                       as approved_count,

  round(avg(
    case when total_financial_loss <= 5000000
         then total_financial_loss else null end
  )::numeric, 2)                                         as avg_financial_loss,

  round(sum(
    case when total_financial_loss <= 5000000
         then total_financial_loss else null end
  )::numeric, 2)                                         as total_financial_loss,

  round(avg(
    case when months_lost_parenting_time <= 360
         then months_lost_parenting_time else null end
  )::numeric, 1)                                         as avg_months_lost,

  count(*) filter (
    where custody_status = 'No Contact / Total Loss of Access'
  )                                                      as total_loss_count,
  count(*) filter (where is_pro_se_bool)                 as pro_se_count,
  max(created_at)                                        as last_submission_at
from combined
where state is not null
group by state, is_us
order by total_submissions desc;


-- ── RLS on legacy_submissions ─────────────────────────────────
-- Admin reads via service-role key (bypasses RLS).
-- No public insert policy — legacy data is loaded by script only.

alter table legacy_submissions enable row level security;
