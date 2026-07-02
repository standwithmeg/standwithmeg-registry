-- Sponsor inquiries: leads submitted from the public "Become a Sponsor" page.
-- Meg reviews these and follows up before any sponsor goes live (advocacy site
-- = manual vetting). Server-side writes only, so RLS stays locked down.

create table if not exists public.sponsor_inquiries (
  id             uuid primary key default gen_random_uuid(),
  business_name  text not null,
  contact_name   text,
  email          text not null,
  phone          text,
  state          text,
  tier           text,
  message        text,
  status         text not null default 'new'
                 check (status in ('new','contacted','won','passed')),
  created_at     timestamptz not null default now()
);

create index if not exists sponsor_inquiries_created_idx on public.sponsor_inquiries (created_at desc);

alter table public.sponsor_inquiries enable row level security;
-- No public policies: inserts happen server-side via the service role.
