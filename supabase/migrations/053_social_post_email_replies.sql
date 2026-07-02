-- Tracks Gmail replies that have already been processed by the approval scanner.

create table if not exists social_post_email_replies (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references social_post_queue(id) on delete cascade,
  message_id text not null unique,
  thread_id text,
  action text not null check (action in ('approved','rejected','skipped','unknown')),
  raw_snippet text,
  created_at timestamptz not null default now()
);

alter table social_post_email_replies
  alter column queue_id drop not null;

create index if not exists idx_social_post_email_replies_queue
  on social_post_email_replies (queue_id, created_at desc);

-- Store the Gmail message ID of the original staging email so replies can be threaded.
alter table social_post_queue
  add column if not exists email_sent_message_id text;

alter table social_post_email_replies enable row level security;
