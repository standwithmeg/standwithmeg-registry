-- Connection Circle room preferences.
--
-- Leaving a room should hide that court-actor circle for that parent without
-- deleting their survey, messages, or audit trail. Routes use service_role and
-- enforce membership before writes; RLS stays deny-all for browser clients.

create table if not exists connection_circle_room_preferences (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  actor_key   text not null,
  status      text not null default 'left' check (status in ('left')),
  left_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists uniq_connection_circle_room_preferences_email_actor
  on connection_circle_room_preferences (email, actor_key);

create index if not exists idx_connection_circle_room_preferences_email_status
  on connection_circle_room_preferences (lower(email), status);

alter table connection_circle_room_preferences enable row level security;
