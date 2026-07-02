-- ============================================================
-- Migration 025 — Reversible superseded reporting decisions
--
-- Superseded means an older survey row was replaced by a newer submission
-- from the same family. The source row and linked court_actors rows remain
-- in the database, but public/reporting output can hide them until an admin
-- restores the row by clearing the decision.
-- ============================================================

alter table admin_review_decisions
  drop constraint if exists admin_review_decisions_decision_check;

alter table admin_review_decisions
  add constraint admin_review_decisions_decision_check
  check (decision in ('keep', 'delete', 'count_separately', 'superseded'));

create index if not exists idx_admin_review_decisions_superseded
  on admin_review_decisions (source_table, source_id)
  where decision = 'superseded';
