-- 031_pdf_download_tracking.sql
-- Tracks downloads of the public state Family Rights Report PDFs so we can
-- report per-state download volume (e.g. for sponsorship / ad-space sales).
--
-- Privacy: we deliberately do NOT store raw IP addresses or any submitter PII.
-- `visitor_id` is a random first-party cookie (a UUID with no identity behind
-- it) used only to estimate unique downloaders. `country` is the coarse,
-- CDN-provided 2-letter code. `user_agent` is kept only so obvious bots can be
-- filtered out of the counts.
--
-- Writes happen server-side from the /api/state-reports/[state] route using the
-- Supabase service role, which bypasses RLS. RLS is enabled with no policies so
-- the anon / authenticated roles can neither read nor write this table.

create table if not exists public.pdf_downloads (
  id            bigint generated always as identity primary key,
  state         text        not null,
  visitor_id    uuid,
  is_bot        boolean     not null default false,
  user_agent    text,
  referrer      text,
  country       text,
  downloaded_at timestamptz not null default now()
);

comment on table public.pdf_downloads is
  'One row per state-report PDF download click. Service-role writes only; no PII.';

create index if not exists pdf_downloads_state_idx
  on public.pdf_downloads (state);

create index if not exists pdf_downloads_downloaded_at_idx
  on public.pdf_downloads (downloaded_at);

-- Lock the table down: RLS on, no policies -> only the service role can touch it.
alter table public.pdf_downloads enable row level security;
