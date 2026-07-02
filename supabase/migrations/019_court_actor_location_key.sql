-- ============================================================
-- Migration 019 — Court Actor Location Key
--
-- Adds location_key to court_actors to support international
-- submissions. Previously only state_code (US states) were
-- supported, but survey submissions can include outside_us_country.
-- 
-- location_key provides a consistent dashboard grouping for both
-- US states (e.g. "CA", "TX") and international countries 
-- (e.g. "Canada", "United Kingdom").
--
-- This enables the public 3-family threshold to work correctly
-- for international court actor reports.
-- ============================================================

-- Add location_key column
alter table court_actors 
add column if not exists location_key text;

-- Index for dashboard/API filtering
create index if not exists idx_court_actors_location_key 
on court_actors (location_key);

-- Backfill existing actor rows from linked survey submissions
update court_actors 
set location_key = nullif(
  coalesce(
    nullif(upper(trim(court_actors.state_code::text)), ''),
    (
      select coalesce(
        nullif(upper(trim(ss.state_of_occurrence::text)), ''),
        nullif(trim(ss.outside_us_country::text), '')
      )
      from survey_submissions ss
      where ss.id = court_actors.submission_id
    )
  ),
  ''
)
where location_key is null;