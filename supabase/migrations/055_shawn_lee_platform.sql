-- Shawn Lee Report: coaching leads, Q&A log, Report Kit purchases.

create table if not exists public.coaching_inquiries (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  state         text,
  interest_type text not null,
  message       text,
  source        text not null default 'shawn_lee_report',
  status        text not null default 'new'
                check (status in ('new', 'contacted', 'scheduled', 'won', 'passed')),
  created_at    timestamptz not null default now()
);

create index if not exists coaching_inquiries_created_idx
  on public.coaching_inquiries (created_at desc);

create index if not exists coaching_inquiries_status_idx
  on public.coaching_inquiries (status, created_at desc);

alter table public.coaching_inquiries enable row level security;

create table if not exists public.shawn_lee_qa_log (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  question   text not null,
  answer     text not null,
  source     text not null default 'shawn_lee_report',
  created_at timestamptz not null default now()
);

create index if not exists shawn_lee_qa_log_created_idx
  on public.shawn_lee_qa_log (created_at desc);

create index if not exists shawn_lee_qa_log_email_idx
  on public.shawn_lee_qa_log (lower(email));

alter table public.shawn_lee_qa_log enable row level security;

create table if not exists public.report_kit_access (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  status             text not null default 'active'
                     check (status in ('active', 'revoked', 'refunded')),
  stripe_customer_id text,
  stripe_session_id  text,
  granted_at         timestamptz not null default now(),
  revoked_at         timestamptz,
  created_at         timestamptz not null default now()
);

create unique index if not exists uniq_report_kit_access_stripe_session
  on public.report_kit_access (stripe_session_id)
  where stripe_session_id is not null;

create index if not exists report_kit_access_email_idx
  on public.report_kit_access (lower(email), status);

alter table public.report_kit_access enable row level security;