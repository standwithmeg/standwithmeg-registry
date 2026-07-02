-- ============================================================
-- Stand With Meg — Survey Submissions Table
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

create table if not exists survey_submissions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Identity & permission
  first_name    text,
  permission    text not null default 'anonymous'
                  check (permission in ('public', 'first_name', 'anonymous')),
  quote         text,

  -- Location
  state         char(2) not null,
  county        text,

  -- Case details (maps to agent.py COLS)
  case_status   text,          -- e.g. "Ongoing", "Resolved", "Appealing"
  system        text,          -- "family_court" | "cps_dcf" | "both"
  duration      numeric,       -- years in the system
  months_lost   integer,       -- months without contact
  custody       text,          -- "50/50 Joint" | "No Contact / Total Loss of Access" | other
  pro_se        boolean,       -- represented themselves?
  legal_rep     text,          -- type of legal representation if any
  allegation    text,          -- primary allegation type

  -- Financial losses (all USD; null = not provided)
  atty_fees     numeric,
  gal_fees      numeric,
  therapy_fees  numeric,
  reunif_fees   numeric,
  other_fees    numeric,
  lost_wages    numeric,
  asset_loss    numeric,

  -- Computed: Postgres adds these up automatically, always in sync
  total_financial_loss numeric generated always as (
    coalesce(atty_fees,    0) +
    coalesce(gal_fees,     0) +
    coalesce(therapy_fees, 0) +
    coalesce(reunif_fees,  0) +
    coalesce(other_fees,   0) +
    coalesce(lost_wages,   0) +
    coalesce(asset_loss,   0)
  ) stored,

  -- Metadata
  user_id       uuid references auth.users(id) on delete set null,
  approved      boolean not null default false,  -- admin approval for public display
  ip_hash       text    -- sha256 of submitter IP, stored for spam prevention only
);

-- Keep updated_at current automatically
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger survey_submissions_updated_at
  before update on survey_submissions
  for each row execute procedure set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table survey_submissions enable row level security;

-- Anyone can insert (the submission form is public)
create policy "public_insert"
  on survey_submissions for insert
  with check (true);

-- Users can read their own submissions (if they were logged in when submitting)
create policy "owner_select"
  on survey_submissions for select
  using (auth.uid() = user_id);

-- Public can read approved submissions (for the public stats page)
create policy "approved_public_select"
  on survey_submissions for select
  using (approved = true);

-- ============================================================
-- Indexes for dashboard queries
-- ============================================================
create index if not exists survey_submissions_state_idx      on survey_submissions (state);
create index if not exists survey_submissions_created_at_idx on survey_submissions (created_at desc);
create index if not exists survey_submissions_approved_idx   on survey_submissions (approved);

-- ============================================================
-- Admin stats view (used by /admin dashboard)
-- This view is safe to expose via the anon key because it
-- only surfaces aggregated, non-identifying data.
-- ============================================================
create or replace view survey_stats_by_state as
select
  state,
  count(*)                                        as total_submissions,
  count(*) filter (where approved)               as approved_count,
  round(avg(total_financial_loss)::numeric, 2)   as avg_financial_loss,
  round(sum(total_financial_loss)::numeric, 2)   as total_financial_loss,
  round(avg(months_lost)::numeric, 1)            as avg_months_lost,
  count(*) filter (where custody = 'No Contact / Total Loss of Access') as total_loss_count,
  count(*) filter (where pro_se = true)          as pro_se_count,
  max(created_at)                                as last_submission_at
from survey_submissions
group by state
order by total_submissions desc;
