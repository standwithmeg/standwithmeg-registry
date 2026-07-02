-- Tracks photo-intake attachments/files that have already been processed by the admin.
-- This keeps Gmail replies and desktop drops from reappearing in the missing-photo/review queue
-- after a court actor has been sent live.

create table if not exists public.photo_intake_processed (
  id text primary key,
  source text not null check (source in ('desktop', 'gmail')),
  filename text,
  actor_bucket_key text,
  actor_name text,
  state_abbr text,
  processed_at timestamptz not null default now(),
  note text
);

create index if not exists idx_photo_intake_processed_actor
  on public.photo_intake_processed (actor_bucket_key);

create index if not exists idx_photo_intake_processed_processed_at
  on public.photo_intake_processed (processed_at desc);

alter table public.photo_intake_processed enable row level security;
