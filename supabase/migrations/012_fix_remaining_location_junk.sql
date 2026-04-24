-- ============================================================
-- Migration 012 — Fix remaining location-column junk
--
-- After migrations 010 + 011 there were still two classes of bad rows:
--   1. Erin Avila (eavila52022@gmail.com) — a live survey submission
--      where state_of_occurrence was left blank and "AL" ended up in
--      outside_us_country. The current CSV (2026-04-24 export) shows
--      her real location: Utah, Weber County, America/Denver timezone.
--   2. Seven legacy rows from the original "Add Me" intake where the
--      only state value selected was the literal dropdown option
--      "Other / Outside U.S." — no country, no county, no timezone
--      was ever captured. They import as outside_us_country='Other'.
--
-- This migration corrects Erin's location and relabels the 7 orphan
-- rows to an honest "International (location unspecified)" label so
-- the public dashboard stops showing a mysterious "Other" bucket.
-- ============================================================

-- 1. Erin Avila — move AL out of the country field and set real state
update survey_submissions
set state_of_occurrence = 'UT',
    outside_us_country  = null
where lower(email) = 'eavila52022@gmail.com'
  and upper(trim(outside_us_country)) = 'AL';

-- 2. Relabel the 7 "Other" orphan rows to something informative
update legacy_submissions
set outside_us_country = 'International (location unspecified)'
where outside_us_country = 'Other'
  and state_of_occurrence is null;
