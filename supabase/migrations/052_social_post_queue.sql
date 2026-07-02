-- Queue for auto-staged court-actor social-media posts.
-- Tracks pending review, approved-to-post, posted, and rejected packages.

do $$
begin
  create type social_post_status as enum (
    'pending_review',
    'approved_to_post',
    'posted',
    'rejected',
    'needs_review'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists social_post_queue (
  id uuid primary key default gen_random_uuid(),
  actor_bucket_key text not null,
  actor_slug text not null,
  state_abbr text not null,
  actor_name text not null,
  role text not null,
  county text,
  status social_post_status not null default 'pending_review',
  package_json jsonb not null default '{}'::jsonb,
  email_thread_id text,
  email_message_id text,
  approved_at timestamptz,
  approved_by text,
  posted_at timestamptz,
  posted_by text,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One queue row per public actor bucket; prevents duplicate staging.
create unique index if not exists idx_social_post_queue_actor_bucket
  on social_post_queue (actor_bucket_key);

create index if not exists idx_social_post_queue_status_created
  on social_post_queue (status, created_at desc);

create index if not exists idx_social_post_queue_updated
  on social_post_queue (updated_at desc);

-- Audit trail for every staging/approval/post action.
create table if not exists social_post_approval_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references social_post_queue(id) on delete cascade,
  action text not null check (action in ('staged','approved','rejected','posted','skipped')),
  source text not null,
  actor_name text not null,
  actor_bucket_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_social_post_logs_queue
  on social_post_approval_logs (queue_id, created_at desc);

-- Row-level security disabled: this is server-only data.
alter table social_post_queue enable row level security;
alter table social_post_approval_logs enable row level security;
