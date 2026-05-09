-- ============================================================
-- Migration 021 — Court Actor Cluster Research Notes
--
-- Lets the admin attach durable research notes (web search results,
-- DOPL license findings, judicial directory checks, etc.) to a
-- pending Possible Matches cluster *before* deciding same_actor or
-- keep_separate.
--
-- Multiple notes per cluster are allowed — each row is one
-- timestamped, attributed observation, surfaced chronologically in
-- the Possible Matches admin UI. Notes do not affect public family
-- counts. Decisions in court_actor_alias_decisions remain the
-- single source of truth for counting; this is the editorial
-- working surface.
--
-- A research note is keyed by cluster_key (sorted name_keys plus
-- "@<location_key>"). When a new spelling variant joins a cluster
-- the cluster_key changes; the old note rows are still queryable
-- via name_keys overlap, but the UI keys exact-match for now.
-- ============================================================

create table if not exists court_actor_cluster_research (
  id            uuid primary key default gen_random_uuid(),

  cluster_key   text not null,
  location_key  text,

  -- Snapshot of the variant name keys this note was written about,
  -- so notes survive cluster_key drift if a new variant later joins.
  name_keys     text[] not null default '{}',

  note          text not null,
  source_url    text,

  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_court_actor_cluster_research_cluster
  on court_actor_cluster_research (cluster_key);

create index if not exists idx_court_actor_cluster_research_location
  on court_actor_cluster_research (location_key);

create index if not exists idx_court_actor_cluster_research_name_keys
  on court_actor_cluster_research using gin (name_keys);

alter table court_actor_cluster_research enable row level security;
-- No public policies — service-role only, mediated through
-- /api/admin/court-actors/cluster-research.
