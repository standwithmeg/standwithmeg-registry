-- Migration 015 — Track court actor follow-up nudges
--
-- Admins send short follow-up emails when a court actor row is missing a
-- name, role, county, or factual note. These columns let the admin dashboard
-- show which families have already been nudged so we do not email them again
-- by accident.

alter table court_actors
  add column if not exists nudge_sent_at timestamptz,
  add column if not exists nudge_sent_by text,
  add column if not exists nudge_sent_to text,
  add column if not exists nudge_last_subject text;

create index if not exists idx_court_actors_nudge_sent_at
  on court_actors (nudge_sent_at);
