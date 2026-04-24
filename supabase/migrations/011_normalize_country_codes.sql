-- ============================================================
-- Migration 011 — Normalize ISO 2-letter country codes to full names
--
-- The Next.js survey offers a dropdown of full country names
-- ("United Kingdom", "Canada", "Botswana" ...). But the DB contains
-- historical rows — from earlier imports or direct inserts — where
-- outside_us_country is a raw 2-letter ISO code ("GB", "BW", "GG"...).
-- Those codes show up on the /report dashboard looking like garbage.
--
-- This migration rewrites the known codes to match the survey's
-- full-name convention, in BOTH survey_submissions and
-- legacy_submissions, so the dashboard renders one consistent label
-- per country.
-- ============================================================

-- Helper expression used in both tables
--   upper(trim(outside_us_country)) in (...)  → case/whitespace-safe

-- 1. survey_submissions
update survey_submissions
set outside_us_country = case upper(trim(outside_us_country))
    when 'GB' then 'United Kingdom'
    when 'UK' then 'United Kingdom'
    when 'CA' then 'Canada'
    when 'AU' then 'Australia'
    when 'NZ' then 'New Zealand'
    when 'IE' then 'Ireland'
    when 'DE' then 'Germany'
    when 'FR' then 'France'
    when 'IT' then 'Italy'
    when 'ES' then 'Spain'
    when 'NL' then 'Netherlands'
    when 'BE' then 'Belgium'
    when 'SE' then 'Sweden'
    when 'NO' then 'Norway'
    when 'DK' then 'Denmark'
    when 'FI' then 'Finland'
    when 'CH' then 'Switzerland'
    when 'AT' then 'Austria'
    when 'PT' then 'Portugal'
    when 'GR' then 'Greece'
    when 'PL' then 'Poland'
    when 'MX' then 'Mexico'
    when 'BR' then 'Brazil'
    when 'AR' then 'Argentina'
    when 'CL' then 'Chile'
    when 'ZA' then 'South Africa'
    when 'BW' then 'Botswana'
    when 'IN' then 'India'
    when 'JP' then 'Japan'
    when 'KR' then 'South Korea'
    when 'CN' then 'China'
    when 'PH' then 'Philippines'
    when 'TH' then 'Thailand'
    when 'VN' then 'Vietnam'
    when 'SG' then 'Singapore'
    when 'MY' then 'Malaysia'
    when 'ID' then 'Indonesia'
    when 'AE' then 'United Arab Emirates'
    when 'IL' then 'Israel'
    when 'TR' then 'Turkey'
    when 'GG' then 'Guernsey'
    when 'JE' then 'Jersey'
    when 'IM' then 'Isle of Man'
    else outside_us_country
  end
where outside_us_country is not null
  and length(trim(outside_us_country)) = 2;

-- 2. legacy_submissions — same mapping
update legacy_submissions
set outside_us_country = case upper(trim(outside_us_country))
    when 'GB' then 'United Kingdom'
    when 'UK' then 'United Kingdom'
    when 'CA' then 'Canada'
    when 'AU' then 'Australia'
    when 'NZ' then 'New Zealand'
    when 'IE' then 'Ireland'
    when 'DE' then 'Germany'
    when 'FR' then 'France'
    when 'IT' then 'Italy'
    when 'ES' then 'Spain'
    when 'NL' then 'Netherlands'
    when 'BE' then 'Belgium'
    when 'SE' then 'Sweden'
    when 'NO' then 'Norway'
    when 'DK' then 'Denmark'
    when 'FI' then 'Finland'
    when 'CH' then 'Switzerland'
    when 'AT' then 'Austria'
    when 'PT' then 'Portugal'
    when 'GR' then 'Greece'
    when 'PL' then 'Poland'
    when 'MX' then 'Mexico'
    when 'BR' then 'Brazil'
    when 'AR' then 'Argentina'
    when 'CL' then 'Chile'
    when 'ZA' then 'South Africa'
    when 'BW' then 'Botswana'
    when 'IN' then 'India'
    when 'JP' then 'Japan'
    when 'KR' then 'South Korea'
    when 'CN' then 'China'
    when 'PH' then 'Philippines'
    when 'TH' then 'Thailand'
    when 'VN' then 'Vietnam'
    when 'SG' then 'Singapore'
    when 'MY' then 'Malaysia'
    when 'ID' then 'Indonesia'
    when 'AE' then 'United Arab Emirates'
    when 'IL' then 'Israel'
    when 'TR' then 'Turkey'
    when 'GG' then 'Guernsey'
    when 'JE' then 'Jersey'
    when 'IM' then 'Isle of Man'
    else outside_us_country
  end
where outside_us_country is not null
  and length(trim(outside_us_country)) = 2;

-- 3. Special cases: AS and UM are US territories, NOT foreign countries.
--    Move them out of outside_us_country (they should really be treated
--    as US for the dashboard's purposes, but keeping them labeled).
update survey_submissions
set outside_us_country = 'American Samoa (US)'
where upper(trim(outside_us_country)) = 'AS';

update legacy_submissions
set outside_us_country = 'American Samoa (US)'
where upper(trim(outside_us_country)) = 'AS';

update survey_submissions
set outside_us_country = 'US Minor Outlying Islands'
where upper(trim(outside_us_country)) = 'UM';

update legacy_submissions
set outside_us_country = 'US Minor Outlying Islands'
where upper(trim(outside_us_country)) = 'UM';
