-- Partner applications: people applying to become State Partners (sales reps)
-- from the public /partners page. The team reviews each one for mission fit
-- before onboarding. Server-side writes only via the service role, so RLS
-- stays locked down. Emails are sent regardless of whether this row stores;
-- this table is the durable record once the migration is applied.

create table if not exists public.partner_applications (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  email               text not null,
  phone               text not null,
  region              text not null,
  connection          text not null,
  why                 text not null,
  role_interest       text,
  businesses_in_mind  text,
  experience          text,
  socials             text,
  heard_from          text,
  status              text not null default 'new'
                      check (status in ('new','reviewing','approved','onboarding','declined')),
  created_at          timestamptz not null default now()
);

create index if not exists partner_applications_created_idx on public.partner_applications (created_at desc);

alter table public.partner_applications enable row level security;
-- No public policies: inserts happen server-side via the service role.
