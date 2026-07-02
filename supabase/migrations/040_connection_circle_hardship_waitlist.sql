-- Connection Circles hardship/sponsored-access waitlist.
--
-- Parents who cannot pay should not receive automatic access from the public
-- button. They enter a private queue; admins can grant sponsored hardship
-- access when sponsor funds are available. All reads/writes flow through
-- service-role API routes so RLS stays deny-all for browser clients.

create table if not exists connection_circle_hardship_requests (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null,
  request_note          text,
  status                text not null default 'pending' check (status in ('pending', 'fulfilled', 'declined', 'cancelled')),
  requested_at          timestamptz not null default now(),
  decided_at            timestamptz,
  decided_by            text,
  fulfilled_access_id   uuid references connection_circle_access(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_connection_circle_hardship_requests_email
  on connection_circle_hardship_requests (lower(email), requested_at desc);

create index if not exists idx_connection_circle_hardship_requests_status
  on connection_circle_hardship_requests (status, requested_at asc);

create unique index if not exists uniq_connection_circle_hardship_pending_email
  on connection_circle_hardship_requests (lower(email))
  where status = 'pending';

alter table connection_circle_hardship_requests enable row level security;
