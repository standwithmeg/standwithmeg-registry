-- Promo code system for Connection Circles.
create table if not exists public.connection_circle_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  access_type text not null default 'promo',
  access_days int not null default 30,
  expires_at timestamptz,
  disabled boolean not null default false,
  max_uses int,
  created_at timestamptz not null default now()
);

-- Track which access grants came from a promo code.
alter table public.connection_circle_access
  add column if not exists promo_code text;

create index if not exists idx_connection_circle_access_promo_code
  on public.connection_circle_access (promo_code);

-- Only service-role/admin clients should read or manage promo codes directly.
alter table public.connection_circle_promo_codes enable row level security;

-- Seed the launch code. Expires 48 hours after migration runs.
insert into public.connection_circle_promo_codes (code, access_type, access_days, expires_at)
values ('MEGSQUAD', 'promo', 30, now() + interval '48 hours')
on conflict (code) do update set
  expires_at = excluded.expires_at,
  disabled = false;
