-- Sponsors: local businesses that pay to appear on state report pages, the
-- national report page, and/or inside the state PDFs. Managed from the admin.
-- Public read happens server-side via the service role (see /api/sponsors),
-- so RLS stays locked down with no public policies.

create table if not exists public.sponsors (
  id              uuid primary key default gen_random_uuid(),

  -- Display fields (what shows on the sponsor card)
  business_name   text not null,
  website_url     text,
  phone           text,
  services        text,            -- "Gutters · Guards · Cleaning · Repairs"
  tagline         text,            -- "Protecting your home, one gutter at a time"
  location_label  text,            -- "Pasco, WA — serving the Tri-Cities"
  brand_color     text,            -- hex (#ff0099) — drives the button color
  logo_url        text,            -- external URL or Supabase Storage URL

  -- Targeting + placement
  state           text,            -- 2-letter target state; null = national/main page only
  tier            text not null default 'state'
                  check (tier in ('community','state','premium')),
  show_on_state_page boolean not null default true,
  show_on_main_page  boolean not null default false,
  show_in_pdf        boolean not null default false,

  -- Billing / admin bookkeeping (Meg's records, never shown publicly)
  billing_period  text check (billing_period in ('monthly','annual')),
  price_cents     integer,
  status          text not null default 'active'
                  check (status in ('active','paused','expired')),
  starts_on       date,
  ends_on         date,
  sort_order      integer not null default 0,
  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists sponsors_state_status_idx on public.sponsors (state, status);
create index if not exists sponsors_status_idx on public.sponsors (status);

alter table public.sponsors enable row level security;
-- No public policies: all reads/writes go through the server using the
-- service-role key, which bypasses RLS. This keeps billing fields private.
