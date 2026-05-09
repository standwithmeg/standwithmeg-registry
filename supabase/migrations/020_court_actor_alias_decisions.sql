-- ============================================================
-- Migration 020 — Court Actor Alias Decisions
--
-- Stores durable admin decisions about whether close-name variants
-- in the same location ("Kyle Hancock" vs "Kyle handcock", "Cathrin
-- Conklin" vs "Cathrine Conklin") should be counted as the same
-- person or kept separate.
--
-- Decisions are surfaced through the /admin "Possible Matches" tab
-- and applied at read time when computing public family counts. We
-- never rewrite or delete the original court_actors rows — the
-- decision layer is additive so the original reporter's spelling
-- stays preserved and reviewable.
--
-- decision values:
--   same_actor    — variants in this cluster all refer to one person.
--                   Public/admin counting rolls them into the canonical
--                   name and counts distinct families across them.
--   keep_separate — admin reviewed and confirmed they are different
--                   people (or unsure). The same suggestion will not
--                   appear again until a new variant joins the cluster.
-- ============================================================

create table if not exists court_actor_alias_decisions (
  id              uuid primary key default gen_random_uuid(),

  -- Stable cluster identifier: sorted distinct normalized name keys
  -- joined with '|', plus a trailing location segment, e.g.
  -- "cathrin conklin|cathrine conklin|@UT".
  cluster_key     text not null,

  -- Location these variants share. Null only for cross-location
  -- decisions (rare; reserved for future use).
  location_key    text,

  decision        text not null
                  check (decision in ('same_actor', 'keep_separate')),

  -- When decision = 'same_actor': admin-chosen canonical display name
  -- and (optional) canonical role. Otherwise null.
  canonical_name  text,
  canonical_role  text,

  -- Normalized name keys (lib/court-actors.ts -> actorLooseNameKey)
  -- covered by this decision. Used at read time to remap rows to
  -- the canonical bucket. Stored as text[] for fast filtering.
  name_keys       text[] not null default '{}',

  -- Snapshot of the variant inputs at decision time (for audit/UI):
  --   [{ name, role, location_key, court_or_county, family_count }, ...]
  variants        jsonb not null default '[]'::jsonb,

  -- Why the admin made this call (free text).
  note            text,

  decided_by      text,
  decided_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One decision per cluster_key. Re-deciding upserts.
  unique (cluster_key)
);

create index if not exists idx_court_actor_alias_decisions_decision
  on court_actor_alias_decisions (decision);

create index if not exists idx_court_actor_alias_decisions_location
  on court_actor_alias_decisions (location_key);

-- name_keys is queried with array-contains/overlap for runtime
-- alias resolution. A GIN index makes that O(log n) instead of
-- a full scan as the decision table grows.
create index if not exists idx_court_actor_alias_decisions_name_keys
  on court_actor_alias_decisions using gin (name_keys);

alter table court_actor_alias_decisions enable row level security;
-- No public policies — service-role only, mediated through
-- /api/admin/court-actors/possible-matches.
