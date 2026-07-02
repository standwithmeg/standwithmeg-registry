-- Admin notes for Connection Circles members.
-- One note per email; updated by founders from /admin/circles user detail panel.

create table if not exists public.connection_circle_user_notes (
  email       text primary key,
  note        text not null default '',
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create index if not exists idx_connection_circle_user_notes_updated
  on public.connection_circle_user_notes (updated_at desc);

alter table public.connection_circle_user_notes enable row level security;
-- No public policies: reads/writes go through the founder-gated Next.js API.
