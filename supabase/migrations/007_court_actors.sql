-- ============================================================
-- Migration 007 — Court Actors
--
-- Stores people named by survey submitters — judges, attorneys,
-- GALs, evaluators, CPS workers, therapists, etc.
--
-- Each row is one person named in one submission. A single
-- submission can name many actors.
--
-- Public display policy:
--   - A name becomes eligible for public display once it has been
--     named by 5+ DIFFERENT survey submissions (independent reporters).
--   - "Same name" is matched case-insensitively on name + state + role.
--   - data_only submitters still count toward the threshold but their
--     quotes never appear publicly — only the name count is used.
--
-- RLS: no public policies. All access via service-role key through
-- the /api/survey/court-actors endpoint which handles thresholding.
-- ============================================================

create table if not exists court_actors (
  id             uuid        primary key default gen_random_uuid(),
  submission_id  uuid        not null references survey_submissions(id) on delete cascade,
  created_at     timestamptz not null default now(),

  -- Who was named
  role           text        not null,     -- Judge, Attorney (Mine), Attorney (Opposing), GAL/Child Rep, Evaluator, CPS Worker, Therapist, Mediator, Other
  name           text        not null,     -- the person's name as entered
  court_or_county text,                     -- e.g. "Los Angeles County Superior Court" or just "Orange County"
  state_code     char(2),                   -- for filtering/indexing without joining submissions
  notes          text                       -- optional — what the family wants to say about them (admin-only)
);

create index if not exists idx_court_actors_submission on court_actors (submission_id);
create index if not exists idx_court_actors_state      on court_actors (state_code);
create index if not exists idx_court_actors_role       on court_actors (role);
-- Case-insensitive name match for counting — stored lowercased in an index
create index if not exists idx_court_actors_name_lower on court_actors (lower(name));

alter table court_actors enable row level security;
-- No public policies — service-role only.
