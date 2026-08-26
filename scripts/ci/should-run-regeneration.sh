#!/usr/bin/env bash
set -euo pipefail

# Decide whether a regeneration run (scheduled OR manually dispatched) should
# spin up the heavy Playwright/Python job.
#
# The generated slides and state PDFs must always reflect the latest public
# survey data. They are rebuilt from Supabase and cached per-actor/per-state by
# an input_hash (see regenerate_deployed_actors.py / generate_state_pdf.py), so
# running when nothing changed is cheap — every actor/state simply skips. The
# only job of this gate is to avoid spinning up the (Playwright-heavy) job when
# there is genuinely nothing new.
#
# IMPORTANT: a public-facing change is NOT only a brand-new submission. An admin
# approving a quote, editing/revising a submission, or a family re-submitting
# all flip a comment from private to public WITHOUT inserting a new
# survey_submissions row — they bump survey_submissions.updated_at instead
# (001_survey_submissions.sql sets updated_at via trigger on every UPDATE, and
# `approved` is an admin-toggled column). Naming a new court actor inserts a
# court_actors row (created_at). The previous version of this gate only looked
# at survey_submissions.created_at AND additionally required the affected state
# to be at/above the 30-family threshold or for 2+ states to change, so
# approvals and single-actor updates never triggered a regen and the slides/PDF
# went stale even though the live registry showed the new info. We now run
# whenever ANYTHING relevant changed since the last generated commit.

# Manual runs (workflow_dispatch from admin or the Actions UI) go through the
# same activity gate as scheduled runs unless the "force" input is true.
# This is the main GitHub bill fix: every manual dispatch used to bypass the
# gate and pay for a full Playwright/Chromium environment even when nothing
# changed. Forced runs must still bypass it: the admin repair/deploy flows
# force precisely because they fix renderer/template/photo problems that this
# gate cannot see in Supabase row activity.

force_normalized=$(printf '%s' "${FORCE:-false}" | tr '[:upper:]' '[:lower:]')

if [ "$force_normalized" = "true" ]; then
  echo "Forced run (force=true): bypassing the activity gate."
  echo "should_run=true" >> "$GITHUB_OUTPUT"
  exit 0
fi

if [ "${GITHUB_EVENT_NAME:-}" != "schedule" ]; then
  echo "Manual dispatch without force: applying the activity gate to protect GitHub minutes."
fi

if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Supabase secrets are not available; allowing regeneration so the scheduled job fails visibly if secrets are broken."
  echo "should_run=true" >> "$GITHUB_OUTPUT"
  exit 0
fi

case "${REGENERATION_SCOPE:-all}" in
  pdf)
    generated_paths=(public/state-reports)
    ;;
  actor)
    generated_paths=(public/court-actors scripts/share-pages/actor_overrides.json)
    ;;
  all)
    generated_paths=(public/state-reports public/court-actors scripts/share-pages/actor_overrides.json)
    ;;
  *)
    echo "Invalid REGENERATION_SCOPE: ${REGENERATION_SCOPE}" >&2
    exit 1
    ;;
esac

# PDF and actor-share schedules publish independently. Each gate must compare
# source activity with its own most recent generated commit; otherwise an 08:00
# PDF commit can hide source changes from the 10:30 actor-share run.
last_generated_at=$(
  git log -1 --format=%cI -- "${generated_paths[@]}" 2>/dev/null || true
)

if [ -z "$last_generated_at" ]; then
  echo "No prior generated-file commit found in checkout history; allowing regeneration."
  echo "should_run=true" >> "$GITHUB_OUTPUT"
  exit 0
fi

base="${NEXT_PUBLIC_SUPABASE_URL%/}/rest/v1"
auth_apikey="apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
auth_bearer="Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"

# Ask PostgREST for an exact row count without transferring rows. The count is
# returned in the Content-Range response header (e.g. "0-24/25" or "*/0").
supabase_count() {
  local table="$1"
  local filter="$2" # e.g. "updated_at=gt.${last_generated_at}"
  local range
  # GET with count=exact: PostgREST returns the total in the Content-Range
  # response header (e.g. "0-0/25", or "*/0" when empty). Dump headers to
  # stdout (-D -) and discard the body (-o /dev/null).
  range=$(
    curl --fail --silent --show-error --get "${base}/${table}" \
      --header "$auth_apikey" \
      --header "$auth_bearer" \
      --header "Prefer: count=exact" \
      --header "Range-Unit: items" \
      --header "Range: 0-0" \
      --data-urlencode "select=created_at" \
      --data-urlencode "$filter" \
      -o /dev/null -D - \
      2>/dev/null \
      | tr -d '\r' \
      | awk -F'/' 'tolower($0) ~ /^content-range:/ {print $NF}'
  )
  if [[ "$range" =~ ^[0-9]+$ ]]; then
    echo "$range"
  else
    # Fall back to fetching ids and counting if the header is unavailable.
    curl --fail --silent --show-error --get "${base}/${table}" \
      --header "$auth_apikey" \
      --header "$auth_bearer" \
      --data-urlencode "select=created_at" \
      --data-urlencode "$filter" \
      | jq 'length'
  fi
}

# survey_submissions.updated_at catches new submissions (updated_at == created_at
# on insert) AND later admin approvals / edits / revisions that make a comment
# public without inserting a row.
submission_changes=$(supabase_count "survey_submissions" "updated_at=gt.${last_generated_at}")

# court_actors.created_at catches newly named actors (no updated_at column on
# this table, so promotions are covered indirectly: the promote action toggles
# the linked submission's approval, which moves updated_at above).
court_actor_changes=$(supabase_count "court_actors" "created_at=gt.${last_generated_at}")

echo "Last generated commit timestamp: ${last_generated_at}"
echo "Submissions created/updated since then: ${submission_changes}"
echo "Court-actor rows added since then: ${court_actor_changes}"

if [ "${submission_changes:-0}" -gt 0 ] || [ "${court_actor_changes:-0}" -gt 0 ]; then
  echo "Allowing scheduled regeneration: public survey data changed since the last generation."
  echo "should_run=true" >> "$GITHUB_OUTPUT"
  exit 0
fi

echo "Skipping scheduled regeneration: no submission or court-actor changes since the last generation."
echo "should_run=false" >> "$GITHUB_OUTPUT"
