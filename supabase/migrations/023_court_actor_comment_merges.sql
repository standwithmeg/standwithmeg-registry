-- ============================================================
-- Migration 023 — Court Actor Comment Merges
--
-- Companion to migration 022. Records cases where the same reporter
-- submitted multiple rows naming the same actor (e.g. typed it twice
-- with extra context the second time) and the admin has merged the
-- comments rather than discard either testimony.
--
-- Why a separate table from court_actor_row_review:
--   row_review is row-keyed and stores a single decision per row.
--   A merge is a 1-primary + N-merged relationship that needs its own
--   shape (the merged_comment text + merged_row_ids[] array).
--
-- How it interacts with row_review:
--   When the admin saves a merge, we ALSO insert a row_review entry
--   for each MERGED row (not the primary) with decision='merge_comments'.
--   That makes lib/court-actors.ts resolveFamilyKey skip the merged
--   row from family counts (same behavior as 'duplicate' for counting),
--   while the primary row continues to count normally and its public
--   note is overridden with merged_comment by the read paths.
--
-- Hard rule: original court_actors rows are NEVER touched. Their
-- name/notes/submission_id/email/timestamps stay preserved exactly
-- as the reporter submitted them. The merge layer is purely additive.
-- ============================================================

create table if not exists court_actor_comment_merges (
  -- The "winning" row whose display text becomes the merged_comment.
  -- ON DELETE CASCADE so the merge is dropped if (and only if) the
  -- underlying primary row is ever deleted. We do not delete actor
  -- rows in normal admin work; this is just a safety net.
  primary_row_id   uuid primary key
                   references court_actors(id) on delete cascade,

  -- The OTHER rows folded into this merge. Each id here also gets a
  -- court_actor_row_review entry with decision='merge_comments'.
  -- Stored as an array (not a join table) because typical merges are
  -- 1-2 rows and the array is read whole at request time anyway.
  merged_row_ids   uuid[] not null
                   check (array_length(merged_row_ids, 1) >= 1),

  -- The public-facing combined comment. This is what shows in
  -- /api/survey/court-actors/notes and in the state PDFs in place of
  -- the primary row's original notes. Admin reviews + edits this text
  -- before saving so reporter PII (emails, names) does not leak into
  -- public output.
  merged_comment   text not null check (length(trim(merged_comment)) > 0),

  decided_by       text,
  decided_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_court_actor_comment_merges_decided_at
  on court_actor_comment_merges (decided_at desc);

-- Widen court_actor_row_review.decision to allow 'merge_comments'.
-- The constraint name in 022 was the implicit one; we drop by name
-- and re-add. Wrapped so the migration is rerunnable: if the
-- constraint already includes the new value, nothing happens.
do $$
declare
  current_def text;
begin
  select pg_get_constraintdef(oid) into current_def
  from pg_constraint
  where conrelid = 'court_actor_row_review'::regclass
    and contype = 'c'
    and conname = 'court_actor_row_review_decision_check';

  if current_def is null or current_def not like '%merge_comments%' then
    if current_def is not null then
      alter table court_actor_row_review
        drop constraint court_actor_row_review_decision_check;
    end if;
    alter table court_actor_row_review
      add constraint court_actor_row_review_decision_check
      check (decision in ('duplicate', 'count_separately', 'merge_comments'));
  end if;
end$$;

alter table court_actor_comment_merges enable row level security;
-- No public policies — service-role only, mediated through
-- /api/admin/court-actors/comment-merge.
