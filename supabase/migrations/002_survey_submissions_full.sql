-- ============================================================
-- Migration 002 — Full Family Rights Registry Schema
-- REPLACES migration 001.
-- If you ran 001, this drops and recreates the table.
-- If you have not run 001, run only this file.
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Drop old objects if they exist
drop view  if exists survey_stats_by_state cascade;
drop table if exists survey_submissions      cascade;

-- ============================================================
-- Core table
-- ============================================================
create table survey_submissions (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null    default now(),
  updated_at  timestamptz not null    default now(),

  -- ── Slide 1: Location + Status ──────────────────────────
  -- Exactly one of state_of_occurrence / outside_us_country must be set
  state_of_occurrence   char(2),    -- Q1  (null when outside US)
  outside_us_country    text,       -- Q2  (null when inside US)
  case_county           text not null,  -- Q3
  case_status           text,       -- Q4
  number_of_kids        integer     check (number_of_kids    >= 0), -- Q5

  -- ── Slide 2: System + Time + Custody + Legal ────────────
  system_affected       text,       -- Q6
  time_in_system        text,       -- Q7
  custody_status        text,       -- Q8
  is_pro_se             text,       -- Q9
  legal_rep_history     text,       -- Q10

  -- ── Slide 3: Allegations ────────────────────────────────
  allegation_type         text,     -- Q11
  allegation_other_detail text,     -- Q12  (conditional: Q11 = "Other")
  allegation_root_cause   text,     -- Q13

  -- ── Slide 4: Due Process + Conflict + Funding ───────────
  due_process_checklist         text[],   -- Q14  (multi-select array)
  other_allegation_details      text,     -- Q15
  conflict_of_interest_awareness text,    -- Q16
  conflict_description          text,     -- Q17  (conditional: Q16 = "Yes")
  federal_funding_influence     text,     -- Q18

  -- ── Slide 5: Stolen Time ────────────────────────────────
  months_lost_parenting_time integer check (months_lost_parenting_time >= 0), -- Q19
  lost_milestones_description text,   -- Q20

  -- ── Slide 6: Financial Impact ───────────────────────────
  attorney_fees          numeric check (attorney_fees          >= 0), -- Q21
  gal_fees               numeric check (gal_fees               >= 0), -- Q22
  therapy_eval_fees      numeric check (therapy_eval_fees      >= 0), -- Q23
  reunification_fees     numeric check (reunification_fees     >= 0), -- Q24
  other_court_actors_fees numeric check (other_court_actors_fees >= 0), -- Q25
  lost_wages             numeric check (lost_wages             >= 0), -- Q26
  asset_liquidation_loss numeric check (asset_liquidation_loss >= 0), -- Q27

  -- Computed: Postgres keeps this in sync automatically
  total_financial_loss numeric generated always as (
    coalesce(attorney_fees,           0) +
    coalesce(gal_fees,                0) +
    coalesce(therapy_eval_fees,       0) +
    coalesce(reunification_fees,      0) +
    coalesce(other_court_actors_fees, 0) +
    coalesce(lost_wages,              0) +
    coalesce(asset_liquidation_loss,  0)
  ) stored,

  -- ── Slide 7: Story + Permission + Contact ───────────────
  impact_quote        text not null,  -- Q28
  permission_to_share text not null,  -- Q29
  first_name          text not null,  -- Q30
  last_name           text not null,  -- Q31
  email               text not null,  -- Q32

  -- ── Metadata ────────────────────────────────────────────
  user_id   uuid references auth.users(id) on delete set null,
  approved  boolean not null default false,
  ip_hash   text,

  -- Enforce: exactly one of state or country must be populated
  constraint location_xor check (
    (state_of_occurrence is not null and outside_us_country is null)
    or
    (state_of_occurrence is null     and outside_us_country is not null)
  )
);

-- ── Auto-update updated_at ───────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger survey_submissions_updated_at
  before update on survey_submissions
  for each row execute procedure set_updated_at();

-- ── Row Level Security ───────────────────────────────────────
alter table survey_submissions enable row level security;

-- Public can insert (form is public)
create policy "public_insert"
  on survey_submissions for insert
  with check (true);

-- Logged-in users can read their own submissions
create policy "owner_select"
  on survey_submissions for select
  using (auth.uid() = user_id);

-- Anyone can read approved submissions (for public stats)
create policy "approved_public_select"
  on survey_submissions for select
  using (approved = true);

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists idx_survey_state      on survey_submissions (state_of_occurrence);
create index if not exists idx_survey_country    on survey_submissions (outside_us_country);
create index if not exists idx_survey_created    on survey_submissions (created_at desc);
create index if not exists idx_survey_approved   on survey_submissions (approved);
create index if not exists idx_survey_email      on survey_submissions (email);

-- ── Admin stats view ─────────────────────────────────────────
-- Groups by state (US) and country (international) separately.
-- Used by /admin dashboard.
create or replace view survey_stats_by_state as
select
  coalesce(state_of_occurrence, outside_us_country)  as state,
  count(*)                                            as total_submissions,
  count(*) filter (where approved)                   as approved_count,
  round(avg(total_financial_loss)::numeric, 2)       as avg_financial_loss,
  round(sum(total_financial_loss)::numeric, 2)       as total_financial_loss,
  round(avg(months_lost_parenting_time)::numeric, 1) as avg_months_lost,
  count(*) filter (
    where custody_status = 'No Contact / Total Loss of Access'
  )                                                   as total_loss_count,
  count(*) filter (
    where is_pro_se = 'Yes, I am Pro Se (Representing myself)'
  )                                                   as pro_se_count,
  max(created_at)                                     as last_submission_at
from survey_submissions
group by coalesce(state_of_occurrence, outside_us_country)
order by total_submissions desc;
