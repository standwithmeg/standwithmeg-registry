-- Materialized copy of court_actors_public_safe.
-- The underlying view joins court_actors with survey_submissions and computes
-- a CASE for notes on every read. For the ~9k+ form_direct rows this adds up.
-- Pre-computing it here makes the /report paginated scans fast.
create materialized view if not exists mv_court_actors_public_safe as
select * from court_actors_public_safe;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
create unique index if not exists idx_mv_court_actors_public_safe_id
  on mv_court_actors_public_safe (id);

-- Mirrors the indexes on the underlying court_actors table.
create index if not exists idx_mv_court_actors_public_safe_source_id
  on mv_court_actors_public_safe (source, id);

create index if not exists idx_mv_court_actors_public_safe_source_state_id
  on mv_court_actors_public_safe (source, state_code, id);

create index if not exists idx_mv_court_actors_public_safe_source_location_id
  on mv_court_actors_public_safe (source, location_key, id);

create index if not exists idx_mv_court_actors_public_safe_name_lower_role_state
  on mv_court_actors_public_safe (lower(name), role, state_code);

-- Simple refresh log so the application can decide when to refresh.
create table if not exists mv_refresh_log (
  view_name text primary key,
  refreshed_at timestamptz not null default now()
);

-- Seed the log so the application sees the view as fresh immediately.
insert into mv_refresh_log (view_name, refreshed_at)
values ('mv_court_actors_public_safe', now())
on conflict (view_name) do update set refreshed_at = now();

-- Refresh helper; CONCURRENTLY avoids blocking reads.
create or replace function refresh_mv_court_actors_public_safe()
returns void
language plpgsql
as $$
begin
  refresh materialized view concurrently mv_court_actors_public_safe;
  insert into mv_refresh_log (view_name, refreshed_at)
  values ('mv_court_actors_public_safe', now())
  on conflict (view_name) do update set refreshed_at = now();
end;
$$;
