-- ============================================================
-- Migration 013 — Persist admin reporting-review decisions
--
-- The admin reporting review screen can now save "keep" decisions so
-- reviewed duplicate rows stay visibly reviewed after refresh/deploy.
-- Delete actions still remove the source row, but this table keeps an
-- audit trail that the deletion was intentionally triggered from review.
-- ============================================================

create table if not exists admin_review_decisions (
  id           uuid primary key default gen_random_uuid(),
  source_table text not null check (source_table in ('survey_submissions', 'legacy_submissions')),
  source_id    uuid not null,
  state        text,
  decision     text not null check (decision in ('keep', 'delete')),
  decided_by   text,
  decided_at   timestamptz not null default now(),
  note         text,
  unique (source_table, source_id)
);

create index if not exists idx_admin_review_decisions_source
  on admin_review_decisions (source_table, source_id);

create index if not exists idx_admin_review_decisions_state
  on admin_review_decisions (state);

alter table admin_review_decisions enable row level security;
