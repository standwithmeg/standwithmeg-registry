-- ============================================================
-- Migration 008 — court_actors.source column
--
-- Distinguishes how a court-actor row got into the database:
--   form_direct    — named via the submit form's Court Actors section
--   extracted_regex — pulled from free-text by the one-time regex scan
--   extracted_ai    — pulled from free-text by the one-time AI scan
--
-- The public 5-family threshold only counts form_direct rows. Extracted
-- rows are visible to admins but never surface a name publicly on their
-- own — they're there to help the admin see patterns and prompt the
-- named families to re-confirm.
-- ============================================================

alter table court_actors
  add column if not exists source text not null default 'form_direct';

create index if not exists idx_court_actors_source on court_actors (source);

-- Ensure all pre-existing rows are labeled correctly
update court_actors set source = 'form_direct' where source is null;
