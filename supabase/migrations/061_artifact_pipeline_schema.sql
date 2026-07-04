-- ============================================================
-- Migration 061 — Phase 2 backbone: the artifact pipeline schema
--
-- ⚠️  DRAFT — NOT YET APPLIED TO ANY ENVIRONMENT.
-- Apply via Supabase SQL Editor only after Meg reviews. Nothing in the
-- app reads these tables yet; applying is safe but should be deliberate.
--
-- WHY THIS EXISTS (the bug class this kills):
-- Today "does this actor have a photo/slides" lives in three places —
-- manifest.json, spec.json, and whatever the report page happens to read —
-- and they drift (e.g. slides generate successfully while the report card
-- still shows an initials placeholder). After Phase 2, these tables are the
-- ONLY source of truth. The report page, actor cards, share pages, and the
-- admin slide-check all read the same row. Generation runs as observable
-- jobs (Trigger.dev) writing to object storage (Cloudflare R2), never to Git.
-- ============================================================

-- ------------------------------------------------------------
-- 1. artifact_jobs — every generation run, observable and retryable.
--    Replaces "dispatch a GitHub Action and hope".
-- ------------------------------------------------------------
create table if not exists artifact_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in (
    'state_pdf',        -- one location's PDF
    'actor_share',      -- one actor's share page + frames + images
    'social_package',   -- stage/refresh one actor's social post package
    'photo_request',    -- send ask-for-photo emails for one actor
    'backfill'          -- bulk import of existing assets into storage
  )),
  target_key text not null,       -- state abbr / country name, or actor_bucket_key
  trigger_reason text not null,   -- 'photo_assigned' | 'survey_approved' | 'name_edit'
                                  -- | 'quote_changed' | 'manual' | 'schedule' | 'backfill'
  triggered_by text,              -- admin email, or 'system'
  status text not null default 'queued' check (status in (
    'queued', 'running', 'needs_review', 'succeeded', 'failed', 'canceled', 'superseded'
  )),
  attempt integer not null default 0,
  max_attempts integer not null default 3,
  input_snapshot jsonb,           -- ids/counts the run used — provenance for "why did it build this"
  error text,
  external_run_id text,           -- Trigger.dev run id, for deep-linking from admin
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artifact_jobs_status_idx
  on artifact_jobs (status, created_at desc);
create index if not exists artifact_jobs_target_idx
  on artifact_jobs (target_key, job_type, created_at desc);

-- ------------------------------------------------------------
-- 2. artifact_versions — every generated output, immutable, in R2.
--    "Which PDF is live right now?" is a lookup, not a guess.
-- ------------------------------------------------------------
create table if not exists artifact_versions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references artifact_jobs(id) on delete set null,
  artifact_type text not null check (artifact_type in (
    'state_pdf', 'share_html', 'frame_set', 'social_image', 'spec_json', 'share_zip'
  )),
  target_key text not null,
  version integer not null,
  storage_bucket text not null default 'swm-artifacts',
  storage_paths jsonb not null,   -- e.g. {"pdf":"state-reports/KS/v12/KS.pdf"} or {"frames":[...]}
  checksum text,
  is_current boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (artifact_type, target_key, version)
);

-- exactly ONE current version per artifact per target — the invariant that
-- makes "the report page and the share page disagree" impossible
create unique index if not exists artifact_versions_one_current_idx
  on artifact_versions (artifact_type, target_key)
  where is_current;

-- ------------------------------------------------------------
-- 3. actor_publications — ONE row per public actor. THE source of truth
--    for report visibility, photo state, slide state, and social state.
-- ------------------------------------------------------------
create table if not exists actor_publications (
  actor_bucket_key text primary key,
  display_name text not null,
  state_code text,
  location_key text,

  -- report visibility: threshold/review only. Photo NOT required (Meg's rule).
  report_visible boolean not null default false,
  report_visible_at timestamptz,
  family_count integer not null default 0,

  -- photo lifecycle: none → requested → received → approved (Meg's manual add)
  photo_status text not null default 'none' check (photo_status in (
    'none', 'requested', 'received', 'approved'
  )),
  photo_storage_path text,
  photo_approved_by text,
  photo_approved_at timestamptz,

  -- slides/share: which version is live, and is it stale vs the survey data
  share_version_id uuid references artifact_versions(id),
  slides_stale boolean not null default false,  -- true = new quote/edit since last build
  source_data_hash text,                        -- hash of inputs; mismatch ⇒ stale

  -- social: auto-publish fires ONLY on photo approval for a report-visible
  -- actor (Meg's rule); posted history handles location + legislator tagging
  social_status text not null default 'not_posted' check (social_status in (
    'not_posted', 'queued', 'auto_published', 'manually_posted', 'rejected'
  )),
  social_posted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists actor_publications_visible_idx
  on actor_publications (report_visible, state_code);

-- ------------------------------------------------------------
-- 4. report_publications — one row per location's live PDF.
--    Replaces public/state-reports/index.json as the source of truth.
-- ------------------------------------------------------------
create table if not exists report_publications (
  location_key text primary key,  -- 'KS', 'Canada', ...
  pdf_version_id uuid references artifact_versions(id),
  families_count integer,
  reported_losses numeric,
  last_generated_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- updated_at maintenance
-- ------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists artifact_jobs_touch on artifact_jobs;
create trigger artifact_jobs_touch before update on artifact_jobs
  for each row execute function touch_updated_at();

drop trigger if exists actor_publications_touch on actor_publications;
create trigger actor_publications_touch before update on actor_publications
  for each row execute function touch_updated_at();

drop trigger if exists report_publications_touch on report_publications;
create trigger report_publications_touch before update on report_publications
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------
-- RLS: service-role only. These are pipeline/admin tables — the public
-- reads them through our API routes (service client), never directly.
-- ------------------------------------------------------------
alter table artifact_jobs enable row level security;
alter table artifact_versions enable row level security;
alter table actor_publications enable row level security;
alter table report_publications enable row level security;
-- no anon/authenticated policies on purpose: only the service role passes.
