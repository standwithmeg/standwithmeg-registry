-- ============================================================
-- Migration 027 — Submitter-hidden court actor rows
--
-- When a submitter updates their survey and removes a court actor, keep the
-- original court_actors row and mark it as submitter_hidden. Public count/read
-- paths already skip non-counting court_actor_row_review decisions.
-- ============================================================

alter table court_actor_row_review
  drop constraint if exists court_actor_row_review_decision_check;

alter table court_actor_row_review
  add constraint court_actor_row_review_decision_check
  check (decision in ('duplicate', 'count_separately', 'merge_comments', 'submitter_hidden'));

create index if not exists idx_court_actor_row_review_submitter_hidden
  on court_actor_row_review (row_id)
  where decision = 'submitter_hidden';
