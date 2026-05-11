-- Safety view: strips notes from data_only and unapproved submissions at the
-- database level. Application routes can query this view instead of
-- court_actors directly to guarantee that data_only notes never leak even if
-- the application layer has a bug.
--
-- Actor names and roles are always visible so they can still be counted
-- toward the public threshold (data_only reporters consented to counting).
-- Notes are NULLed unless the linked submission is approved AND the reporter
-- chose public, anonymous, or first_name sharing.

CREATE OR REPLACE VIEW court_actors_public_safe AS
SELECT
  ca.id,
  ca.role,
  ca.name,
  ca.court_or_county,
  ca.state_code,
  ca.location_key,
  ca.source,
  ca.created_at,
  ca.submission_id,
  CASE
    WHEN s.approved IS NOT TRUE THEN NULL
    WHEN s.permission_to_share NOT IN ('public', 'anonymous', 'first_name') THEN NULL
    ELSE ca.notes
  END AS notes,
  s.email,
  s.permission_to_share,
  s.approved
FROM court_actors ca
LEFT JOIN survey_submissions s ON s.id = ca.submission_id;
