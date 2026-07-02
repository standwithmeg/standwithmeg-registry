-- ============================================================
-- Migration 023 — Court Actor Public Notifications
--
-- Tracks the automatic photo / source request emails sent to
-- reporters whose named court actor has crossed the public
-- reporting threshold (3 distinct families, form_direct only).
--
-- Each row represents ONE attempted send to ONE reporter for
-- ONE public court actor bucket. We never send a second time
-- for the same (reporter_email, actor_bucket_key) pair — even
-- if more families later add the same actor or the canonical
-- name changes.
--
-- actor_bucket_key:
--   actorLooseNameKey(canonical_name) + "|" + location_key
--   This is the same bucket key used by the public counting
--   logic, so admin alias merges are honored automatically.
--
-- Privacy:
--   - reporter_email and submission_id are kept here for
--     internal audit only.
--   - The email body NEVER reveals other reporters' names,
--     emails, notes, or the count.
--
-- RLS: no public policies. Service-role only, written by
-- scripts/send-public-court-actor-photo-requests.ts and
-- read by the admin preview endpoint.
-- ============================================================

create table if not exists court_actor_public_notifications (
  id                  uuid        primary key default gen_random_uuid(),

  -- Public-actor identity at the time the notification was created.
  actor_bucket_key    text        not null,    -- actorLooseNameKey(name)|location_key
  canonical_name      text        not null,    -- name as displayed publicly when sent
  location_key        text        not null,    -- US state code or country (matches survey logic)

  -- Reporter identity (private — never exposed to other reporters).
  reporter_email      text        not null,
  submission_id       uuid                    references survey_submissions(id) on delete set null,
  court_actor_row_id  uuid                    references court_actors(id)        on delete set null,

  -- Send result.
  status              text        not null
                      check (status in ('sent', 'skipped', 'failed', 'pending')),
  email_subject       text,
  email_body          text,
  error_message       text,
  sent_at             timestamptz,

  created_at          timestamptz not null default now()
);

create index if not exists idx_court_actor_public_notif_bucket
  on court_actor_public_notifications (actor_bucket_key);

create index if not exists idx_court_actor_public_notif_reporter
  on court_actor_public_notifications (lower(reporter_email));

create index if not exists idx_court_actor_public_notif_status
  on court_actor_public_notifications (status);

-- One successful send per (reporter, actor bucket) — period.
-- Failed/skipped/pending rows are allowed to accumulate so the admin
-- preview can show retry history.
create unique index if not exists ux_court_actor_public_notif_sent_once
  on court_actor_public_notifications (lower(reporter_email), actor_bucket_key)
  where status = 'sent';

alter table court_actor_public_notifications enable row level security;
-- No public policies — service-role only.
