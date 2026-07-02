-- ============================================================
-- Migration 026 — Reversible survey update history
--
-- Submitters can update an existing survey row instead of creating a second
-- family count. Before each update, the API snapshots the previous survey row
-- and linked court_actors rows here so old content is preserved and auditable.
-- ============================================================

create table if not exists survey_submission_revisions (
  id               uuid primary key default gen_random_uuid(),
  submission_id    uuid not null references survey_submissions(id) on delete cascade,
  revision_reason  text not null default 'submitter_update',
  previous_submission jsonb not null,
  previous_court_actors jsonb not null default '[]'::jsonb,
  updated_by_email text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_survey_submission_revisions_submission
  on survey_submission_revisions (submission_id, created_at desc);

alter table survey_submission_revisions enable row level security;
-- No public policies — service-role only, mediated through /api/survey/update.
