-- Connection Circle member invite links.
-- Verified Circle members can generate a small number of private invite links
-- to bring other families directly into Connection Circles. Each link has a
-- use limit and expiry; redeeming it creates a sponsored-month access grant
-- for the logged-in survey submitter.

create table if not exists public.connection_circle_invite_links (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,
  inviter_email   text not null,
  remaining_uses  int not null default 1 check (remaining_uses >= 0),
  used_count      int not null default 0 check (used_count >= 0),
  status          text not null default 'active'
                    check (status in ('active', 'revoked', 'expired')),
  expires_at      timestamptz not null default (now() + interval '30 days'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_connection_circle_invite_links_token
  on public.connection_circle_invite_links (token);

create index if not exists idx_connection_circle_invite_links_inviter
  on public.connection_circle_invite_links (lower(inviter_email), status, expires_at);

alter table public.connection_circle_invite_links enable row level security;
-- No public policies: reads/writes go through the Next.js API using service_role.
