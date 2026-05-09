-- ============================================================
-- Migration 022 — Court Actor Row Review
--
-- Soft-review layer on individual court_actors rows. The row is
-- never deleted — the original reporter testimony stays preserved
-- in court_actors.notes. This table just records an admin decision
-- about how that row should participate in counting.
--
-- decision values:
--   duplicate         — the same family already named the same actor
--                       in another row (e.g. typed twice, "I already
--                       added this"). Excluded from family counts.
--                       Still visible in admin/audit views with a
--                       "Duplicate / not counting" badge.
--   count_separately  — admin reviewed and confirmed this row is a
--                       genuinely separate court matter for the
--                       same family (rare for court actors, but
--                       e.g. years apart). Forces the row to count
--                       as its own family-key.
--
-- Absence of a row in this table = "normal" — counts using the
-- existing email|location dedupe.
-- ============================================================

create table if not exists court_actor_row_review (
  id            uuid primary key default gen_random_uuid(),

  -- Hard FK on the original court_actors row. ON DELETE CASCADE so
  -- the review goes away if (and only if) the underlying row is
  -- ever deleted. We do not delete actor rows in normal admin work;
  -- this is just a safety net.
  row_id        uuid not null unique
                references court_actors(id) on delete cascade,

  decision      text not null
                check (decision in ('duplicate', 'count_separately')),

  note          text,

  decided_by    text,
  decided_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_court_actor_row_review_decision
  on court_actor_row_review (decision);

alter table court_actor_row_review enable row level security;
-- No public policies — service-role only, mediated through
-- /api/admin/court-actors/row-review.
