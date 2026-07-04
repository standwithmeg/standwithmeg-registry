# Migrations — how this folder works

- Migrations are applied **manually** by pasting into the Supabase Dashboard →
  SQL Editor. Nothing applies them automatically; filenames are documentation
  of order, not an execution mechanism.
- Numbering hygiene (2026-07-02): four duplicate prefixes (020/022/023/037)
  were renumbered to 057–060 — **file renames only**, contents untouched, all
  were already applied in production long ago. Numbers 016–018 never existed;
  that gap is historical and harmless.
- `061_artifact_pipeline_schema.sql` is the Phase 2 backbone (artifact jobs,
  versions, actor/report publications). It is committed as a **draft** and is
  NOT applied anywhere yet — Meg reviews, then it gets pasted into the SQL
  Editor deliberately.
- New migrations: take the next free number (062+), one concern per file.
