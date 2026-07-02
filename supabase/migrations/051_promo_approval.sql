-- Promo code approval flow.
-- Some codes (e.g. squad-only codes) should not grant instant access.
-- Instead, they create a pending request the founder can approve or deny.

-- Allow access grants that come from promo codes.
alter table connection_circle_access
  drop constraint if exists connection_circle_access_access_type_check;

alter table connection_circle_access
  add constraint connection_circle_access_access_type_check
  check (access_type in (
    'supporter_monthly',
    'supporter_annual',
    'hardship',
    'sponsored_month',
    'sponsored_year',
    'sponsor_pool',
    'promo'
  ));

-- Track whether a promo code requires founder approval before granting access.
alter table connection_circle_promo_codes
  add column if not exists requires_approval boolean not null default false;

-- Mark the squad code as approval-required and keep it active.
update connection_circle_promo_codes
set
  requires_approval = true,
  disabled = false,
  expires_at = null
where upper(code) = 'MEGSQUAD';

-- Pending promo-code requests.
create table if not exists connection_circle_promo_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code        text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  requested_at timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  text,
  access_id   uuid references connection_circle_access(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Only one pending request per email + code at a time.
create unique index if not exists uniq_connection_circle_promo_request_pending_email_code
  on connection_circle_promo_requests (lower(email), lower(code))
  where status = 'pending';

create index if not exists idx_connection_circle_promo_requests_status
  on connection_circle_promo_requests (status, requested_at);

create index if not exists idx_connection_circle_promo_requests_email
  on connection_circle_promo_requests (lower(email));

alter table connection_circle_promo_requests enable row level security;
