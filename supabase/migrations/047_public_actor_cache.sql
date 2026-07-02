-- Persistent pre-computed cache for the expensive public court-actor list.
-- Survives serverless cold starts so /report can serve warm data immediately.
create table if not exists public_actor_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_public_actor_cache_expires
  on public_actor_cache (expires_at);

-- Row-level security disabled: this is server-only data.
alter table public_actor_cache enable row level security;
