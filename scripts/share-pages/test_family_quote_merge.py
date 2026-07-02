#!/usr/bin/env python3
"""One quote per family — regression tests for the per-family comment merge.

Real-world failure these lock in: one family submitted three surveys about
the same judge with reworded notes, and a second family's long note fully
contained their shorter note. The share slide showed four quotes for what
was really two families' testimony.

Run: python3 scripts/share-pages/test_family_quote_merge.py
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    # Register before exec so dataclass field resolution can find the module
    # (required on older Pythons).
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


HERE = Path(__file__).resolve().parent
lib_rows = _load("lib_supabase_rows", HERE.parent / "pdf" / "lib_supabase_rows.py")
spotlight_build = _load("spotlight_build", HERE / "spotlight_build.py")
render_spotlight = _load("render_spotlight", HERE / "render_spotlight.py")


# Family A filed three times about the same judge: two reworded retellings
# of the same incident plus one distinct statement.
FAMILY_A_RETELLING_1 = (
    "He said a lot of nice things about me and then terminated my rights "
    "at the end of the hearing saying there was no law on it"
)
FAMILY_A_RETELLING_2 = (
    "He told me all these nice good things about me and then still "
    "terminated my right saying that there was no law for it"
)
FAMILY_A_DISTINCT = "I'm never able to speak, they deny it"

# Family B's long note fully contains their earlier short note.
FAMILY_B_SHORT = (
    "He ignores evidence, due process tries to not properly go through "
    "the icwa protocol, ignore family placements"
)
FAMILY_B_LONG = (
    "Does not put the guardians in contempt When they continuously go off "
    "of hearsay. He ignores evidence, due process tries to not properly go "
    "through the icwa protocol, ignore family placements"
)

FAMILY_C_NOTE = (
    "He allowed CFS 15 months of delays to search for evidence when they "
    "found out the original allegations were false. From there he allowed "
    "delay after delay."
)


def _comment(note: str, family_key: str, created_at: str = "", **extra) -> dict:
    return {
        "note": note,
        "court_or_county": extra.pop("court", "San Bernardino County"),
        "is_merged": extra.pop("is_merged", False),
        "family_key": family_key,
        "created_at": created_at,
        **extra,
    }


def test_near_duplicate_retellings_detected():
    assert lib_rows._is_near_duplicate_note(FAMILY_A_RETELLING_1, FAMILY_A_RETELLING_2)


def test_containment_detected():
    assert lib_rows._is_near_duplicate_note(FAMILY_B_SHORT, FAMILY_B_LONG)


def test_distinct_statements_not_near_duplicates():
    assert not lib_rows._is_near_duplicate_note(FAMILY_A_DISTINCT, FAMILY_A_RETELLING_1)
    assert not lib_rows._is_near_duplicate_note(FAMILY_A_DISTINCT, FAMILY_C_NOTE)


def test_one_quote_per_family():
    comments = [
        _comment(FAMILY_A_RETELLING_1, "a@x.com|CA", "2026-06-09"),
        _comment(FAMILY_A_RETELLING_2, "a@x.com|CA", "2026-06-09"),
        _comment(FAMILY_A_DISTINCT, "a@x.com|CA", "2026-05-20"),
        _comment(FAMILY_B_LONG, "b@x.com|CA", "2026-05-14"),
        _comment(FAMILY_B_SHORT, "b@x.com|CA", "2026-05-14"),
        _comment(FAMILY_C_NOTE, "c@x.com|CA", "2026-05-01"),
    ]
    merged = lib_rows._merge_family_comments(comments)
    assert len(merged) == 3, f"expected one merged comment per family, got {len(merged)}"


def test_family_merge_keeps_distinct_content_most_recent_first():
    comments = [
        _comment(FAMILY_A_DISTINCT, "a@x.com|CA", "2026-05-20"),
        _comment(FAMILY_A_RETELLING_1, "a@x.com|CA", "2026-06-09"),
        _comment(FAMILY_A_RETELLING_2, "a@x.com|CA", "2026-06-09"),
    ]
    merged = lib_rows._merge_family_comments(comments)
    assert len(merged) == 1
    note = merged[0]["note"]
    assert FAMILY_A_DISTINCT in note
    # Exactly one retelling survives, and the newer material leads.
    assert (FAMILY_A_RETELLING_1 in note) != (FAMILY_A_RETELLING_2 in note)
    assert note.index(FAMILY_A_DISTINCT) > 0


def test_containment_keeps_long_variant():
    comments = [
        _comment(FAMILY_B_SHORT, "b@x.com|CA", "2026-05-14"),
        _comment(FAMILY_B_LONG, "b@x.com|CA", "2026-05-14"),
    ]
    merged = lib_rows._merge_family_comments(comments)
    assert len(merged) == 1
    assert merged[0]["note"] == FAMILY_B_LONG


def test_latest_submission_preference_suppresses_family():
    comments = [
        _comment(FAMILY_A_RETELLING_1, "a@x.com|CA", "2026-06-09"),
        _comment(FAMILY_C_NOTE, "c@x.com|CA", "2026-05-01"),
    ]
    merged = lib_rows._merge_family_comments(
        comments,
        {"a@x.com|CA": False, "c@x.com|CA": True},
    )
    assert len(merged) == 1
    assert merged[0]["note"] == FAMILY_C_NOTE


def test_admin_curated_merge_wins_within_family():
    curated = "Admin curated summary of this family's experience."
    comments = [
        _comment(FAMILY_A_RETELLING_1, "a@x.com|CA", "2026-06-09"),
        _comment(curated, "a@x.com|CA", "2026-05-01", is_merged=True),
    ]
    merged = lib_rows._merge_family_comments(comments)
    assert len(merged) == 1
    assert curated in merged[0]["note"]


def test_cross_family_similar_voices_both_kept():
    # Two DIFFERENT families with overlapping-but-not-identical experiences
    # must each keep their own quote.
    comments = [
        _comment("The judge never lets me speak in court", "a@x.com|CA"),
        _comment("She never lets parents speak during hearings", "b@x.com|CA"),
    ]
    merged = lib_rows._merge_family_comments(comments)
    assert len(merged) == 2


def test_cross_family_exact_duplicate_dropped():
    comments = [
        _comment(FAMILY_C_NOTE, "a@x.com|CA"),
        _comment(FAMILY_C_NOTE, "b@x.com|CA"),
    ]
    merged = lib_rows._merge_family_comments(comments)
    assert len(merged) == 1


def test_fallback_merges_per_submission():
    items = [
        {"note": FAMILY_A_RETELLING_1, "submission_id": "s1", "created_at": "2026-06-09"},
        {"note": FAMILY_A_RETELLING_2, "submission_id": "s1", "created_at": "2026-06-09"},
        {"note": FAMILY_A_DISTINCT, "submission_id": "s1", "created_at": "2026-05-20"},
        {"note": FAMILY_C_NOTE, "submission_id": "s2", "created_at": "2026-05-01"},
    ]
    merged = spotlight_build._merge_note_items_per_submission(items)
    assert len(merged) == 2
    assert FAMILY_A_DISTINCT in merged[0]
    assert merged[1] == FAMILY_C_NOTE


def test_renderer_keeps_similar_quotes_from_distinct_families():
    # Render-time dedup must NOT collapse near-identical phrasing — family
    # attribution is gone by then, and different families can phrase the
    # same experience almost identically. Family-aware merging happens
    # upstream (covered by the tests above).
    spec = {
        "supabase": {
            "public_comments": [
                {"comment_text": f"Denied motion number {i} without a hearing."}
                for i in range(1, 6)
            ]
        }
    }
    quotes = render_spotlight.story_quotes(spec, n=None)
    assert len(quotes) == 5, f"expected all 5 distinct quotes kept, got {len(quotes)}"


def test_renderer_keeps_distinct_family_quotes():
    spec = {
        "supabase": {
            "public_comments": [
                {"comment_text": FAMILY_A_RETELLING_1},
                {"comment_text": FAMILY_B_LONG},
                {"comment_text": FAMILY_C_NOTE},
            ]
        }
    }
    quotes = render_spotlight.story_quotes(spec, n=None)
    assert len(quotes) == 3, f"expected three distinct family quotes, got {len(quotes)}: {quotes}"


def _run() -> int:
    failures = 0
    tests = [
        (name, fn) for name, fn in sorted(globals().items())
        if name.startswith("test_") and callable(fn)
    ]
    for name, fn in tests:
        try:
            fn()
            print(f"PASS {name}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL {name}: {exc}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(_run())
