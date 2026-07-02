#!/usr/bin/env python3
"""Unit tests for the manifest duplicate-actor guardrail in
verify_share_consistency.py.

Root cause this guards against: re-deploying a court actor under a corrected
display name produced a new slug, and the old manifest entry was never
removed — so the same person showed up as two public cards (the Gage
Stermensky / Jennifer-judge class of bug). The detector must catch both a
shared resolved bucket key and a shared state+person identity (honorific- and
spelling-tolerant)."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("verify_share_consistency.py")
SPEC = importlib.util.spec_from_file_location("verify_share_consistency", MODULE_PATH)
assert SPEC and SPEC.loader
verify = importlib.util.module_from_spec(SPEC)
# Register before exec so @dataclass annotation resolution (Python 3.9) can
# find the module in sys.modules while it executes.
sys.modules[SPEC.name] = verify
SPEC.loader.exec_module(verify)


def _slugs(mismatches: list) -> set[str]:
    found: set[str] = set()
    for m in mismatches:
        rendered = getattr(m, "rendered", "")
        if "duplicate slugs:" in rendered:
            found.update(s.strip() for s in rendered.split(":", 1)[1].split(","))
    return found


def test_no_duplicates_passes() -> None:
    entries = [
        {"slug": "andrew_hairston", "state_abbr": "AL",
         "display_name": "Andrew Hairston", "canonical_name": "Andrew Hairston",
         "actor_bucket_key": "andrew hairston|AL"},
        {"slug": "jane_doe", "state_abbr": "CA",
         "display_name": "Jane Doe", "canonical_name": "Jane Doe",
         "actor_bucket_key": "jane doe|CA"},
    ]
    assert verify.check_duplicate_manifest_entries(entries) == []


def test_shared_bucket_key_is_flagged() -> None:
    entries = [
        {"slug": "pat_gallagher", "state_abbr": "NY",
         "display_name": "Pat Gallagher", "canonical_name": "Pat Gallagher",
         "actor_bucket_key": "pat galagher|NY"},
        {"slug": "gallagher", "state_abbr": "NY",
         "display_name": "Different Person", "canonical_name": "Different Person",
         "actor_bucket_key": "pat galagher|NY"},
    ]
    result = verify.check_duplicate_manifest_entries(entries)
    assert result, "expected a duplicate mismatch for the shared bucket key"
    assert _slugs(result) == {"pat_gallagher", "gallagher"}


def test_honorific_and_title_collapse_to_one_identity() -> None:
    # The exact Gage regression: "Gage Stermensky" vs "Dr. Gage Stermensky".
    entries = [
        {"slug": "dr_gage_stermenski", "state_abbr": "NE",
         "display_name": "Dr. Gage Stermensky", "canonical_name": "Dr. Gage Stermensky",
         "actor_bucket_key": "gage stermenski|NE"},
        {"slug": "gage_stermensky", "state_abbr": "NE",
         "display_name": "Gage Stermensky", "canonical_name": "Gage Stermensky",
         "actor_bucket_key": None},
    ]
    result = verify.check_duplicate_manifest_entries(entries)
    assert _slugs(result) == {"dr_gage_stermenski", "gage_stermensky"}


def test_same_name_different_state_is_not_a_duplicate() -> None:
    entries = [
        {"slug": "john_smith", "state_abbr": "CA",
         "display_name": "John Smith", "canonical_name": "John Smith",
         "actor_bucket_key": "john smith|CA"},
        {"slug": "john_smith_2", "state_abbr": "TX",
         "display_name": "John Smith", "canonical_name": "John Smith",
         "actor_bucket_key": "john smith|TX"},
    ]
    assert verify.check_duplicate_manifest_entries(entries) == []


def test_each_duplicate_group_reported_once() -> None:
    entries = [
        {"slug": "cara", "state_abbr": "CA", "display_name": "Cara D. Hutson",
         "canonical_name": "Cara D. Hutson", "actor_bucket_key": "cara|CA"},
        {"slug": "cara_d_hutson", "state_abbr": "CA", "display_name": "Cara D. Hutson",
         "canonical_name": "Cara D. Hutson", "actor_bucket_key": "cara hutson|CA"},
    ]
    # Shared identity AND fuller names — must not double-report the same pair.
    result = verify.check_duplicate_manifest_entries(entries)
    assert len(result) == 1
    assert _slugs(result) == {"cara", "cara_d_hutson"}


def _run() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
        except AssertionError as e:
            failed += 1
            print(f"FAIL  {t.__name__}: {e}")
        else:
            passed += 1
            print(f"PASS  {t.__name__}")
    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run())
