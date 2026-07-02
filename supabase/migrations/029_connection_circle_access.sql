-- Connection Circles supporter, hardship, and sponsored access.
--
-- Application routes use service_role for all reads/writes so the browser
-- never receives raw survey identity data. RLS remains enabled by default.

create table if not exists connection_circle_access (
  id                     uuid primary key default gen_random_uuid(),
  email                  text not null,
  access_type            text not null check (access_type in (
    'supporter_monthly',
    'supporter_annual',
    'hardship',
    'sponsored_month',
    'sponsored_year',
    'sponsor_pool'
  )),
  status                 text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  stripe_session_id      text,
  sponsor_link_id        uuid,
  granted_at             timestamptz not null default now(),
  expires_at             timestamptz,
  revoked_at             timestamptz,
  revoked_by             text,
  revoked_reason         text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_connection_circle_access_email
  on connection_circle_access (lower(email));

create index if not exists idx_connection_circle_access_status_expires
  on connection_circle_access (status, expires_at);

create unique index if not exists uniq_connection_circle_access_stripe_session
  on connection_circle_access (stripe_session_id)
  where stripe_session_id is not null;

create unique index if not exists uniq_connection_circle_active_hardship_email
  on connection_circle_access (lower(email))
  where access_type = 'hardship' and status = 'active';

create table if not exists connection_circle_sponsor_links (
  id                  uuid primary key default gen_random_uuid(),
  token               text not null unique,
  requester_email     text not null,
  requester_note      text,
  status              text not null default 'active' check (status in ('active', 'fulfilled', 'cancelled', 'expired')),
  fulfilled_access_id uuid references connection_circle_access(id) on delete set null,
  fulfilled_at        timestamptz,
  expires_at          timestamptz not null default (now() + interval '30 days'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_connection_circle_sponsor_links_requester_email
  on connection_circle_sponsor_links (lower(requester_email));

create index if not exists idx_connection_circle_sponsor_links_status_expires
  on connection_circle_sponsor_links (status, expires_at);

create table if not exists connection_circle_sponsor_contributions (
  id                    uuid primary key default gen_random_uuid(),
  contribution_type     text not null check (contribution_type in ('direct_month', 'direct_year', 'pool_month', 'pool_year', 'pool_custom')),
  sponsor_email         text,
  requester_email       text,
  sponsor_link_id       uuid references connection_circle_sponsor_links(id) on delete set null,
  access_id             uuid references connection_circle_access(id) on delete set null,
  stripe_session_id     text unique,
  amount_cents          integer not null check (amount_cents > 0),
  currency              text not null default 'usd',
  created_at            timestamptz not null default now()
);

create index if not exists idx_connection_circle_sponsor_contributions_sponsor_email
  on connection_circle_sponsor_contributions (lower(sponsor_email));

alter table connection_circle_access enable row level security;
alter table connection_circle_sponsor_links enable row level security;
alter table connection_circle_sponsor_contributions enable row level security;
