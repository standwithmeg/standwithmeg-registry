-- Store Gmail OAuth tokens server-side so the integration survives deploys
-- and does not require committing credentials.
create table if not exists public.gmail_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  access_token text,
  refresh_token text not null,
  expiry_date timestamptz,
  scope text,
  token_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one token row per authenticated admin email.
create unique index if not exists idx_gmail_tokens_email on public.gmail_tokens (email);

-- Server-only table; no client access.
alter table public.gmail_tokens enable row level security;
