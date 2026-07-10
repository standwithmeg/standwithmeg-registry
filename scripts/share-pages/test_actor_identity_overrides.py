#!/usr/bin/env python3
"""Regression tests for explicit actor identity overrides (Michele Bell).

Root cause: the generator's unconfirmed one-edit spelling heuristic treats
Michele Bell and Michelle Bell as the same person. When the admin rebuilds
Michele via an explicit public bucket key, that expansion must be disabled
so her five-family record is not merged with Michelle's one-family record.

Also locks cover count preference for public_family_count over report counts.
"""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


spotlight_build = _load("spotlight_build_identity", HERE / "spotlight_build.py")
render_spotlight = _load("render_spotlight_identity", HERE / "render_spotlight.py")
regenerate = _load("regenerate_deployed_actors_identity", HERE / "regenerate_deployed_actors.py")


def test_michele_michelle_are_one_edit_spelling_variants() -> None:
    # Documents the hazard: without an explicit bucket gate these merge.
    assert spotlight_build._likely_same_actor_name("Michele Bell", "Michelle Bell") is True
    assert spotlight_build._likely_same_actor_name("Michelle Bell", "Michele Bell") is True


def test_explicit_bucket_key_disables_unconfirmed_spelling_expansion() -> None:
    assert spotlight_build.allow_unconfirmed_spelling_expansion(None) is True
    assert spotlight_build.allow_unconfirmed_spelling_expansion("") is True
    assert spotlight_build.allow_unconfirmed_spelling_expansion("   ") is True
    # Explicit Michele bucket must NOT expand to Michelle.
    assert spotlight_build.allow_unconfirmed_spelling_expansion("michele bell|CA") is False
    assert spotlight_build.allow_unconfirmed_spelling_expansion("michelle bell|CA") is False


def test_cover_count_prefers_public_family_count_over_report_counts() -> None:
    # Regression: cover showed 7 (report/mention) while public API said 5.
    spec = {
        "actor": {
            "first_name": "Michele",
            "last_name": "Bell",
            "display_name": "Michele Bell",
            "role": "Judge",
            "state": "California",
            "state_abbr": "CA",
            "public_family_count": 5,
            "family_count": 5,
            "actor_report_count": 7,
            "mention_count": 7,
        },
        "supabase": {
            "public_family_count": 5,
            "actor_report_count": 7,
            "report_count": 7,
            "family_count": 5,
            "public_comments": [
                {"comment_text": "Ignored evidence that supported my case."},
            ],
        },
        "state_stats": {"state_family_count": 100},
        "movement_total": 1000,
    }

    html = render_spotlight.render(spec, web_mode=True)
    assert re.search(r"<b>5</b>", html), "cover must show public_family_count=5"
    assert not re.search(r"<b>7</b>", html), "cover must not prefer report count 7"
    assert "families named this person on the public record" in html
    assert "survey submissions named this person" not in html

    assert regenerate.submission_count_from_spec(spec) == "5"


def test_cover_count_falls_back_to_report_count_when_family_missing() -> None:
    spec = {
        "actor": {
            "first_name": "Legacy",
            "last_name": "Actor",
            "display_name": "Legacy Actor",
            "role": "Judge",
            "state": "Texas",
            "state_abbr": "TX",
            "actor_report_count": 3,
        },
        "supabase": {},
        "state_stats": {"state_family_count": 10},
        "movement_total": 100,
    }
    html = render_spotlight.render(spec, web_mode=True)
    assert re.search(r"<b>3</b>", html)
    assert regenerate.submission_count_from_spec(spec) == "3"


def test_actor_cli_overrides_pin_michele_bucket_and_display_name() -> None:
    # Manifest still has the stale Michelle spelling; admin sends Michele + key.
    entries = [
        {
            "slug": "michele_bell",
            "state_abbr": "CA",
            "display_name": "Michelle Bell",
            "canonical_name": "Michelle Bell",
            "actor_bucket_key": "michelle bell|CA",
            "actor_row_id": "stale-michelle-row",
        }
    ]
    out = regenerate.apply_actor_cli_overrides(
        entries,
        display_name="Michele Bell",
        actor_bucket_key="michele bell|CA",
    )
    assert len(out) == 1
    assert out[0]["display_name"] == "Michele Bell"
    assert out[0]["canonical_name"] == "Michele Bell"
    assert out[0]["actor_bucket_key"] == "michele bell|CA"
    # Stale row id is left on the entry; main() skips --actor-row-id when
    # --actor-bucket-key is supplied.
    assert out[0]["actor_row_id"] == "stale-michelle-row"


def test_actor_cli_overrides_require_exactly_one_entry() -> None:
    try:
        regenerate.apply_actor_cli_overrides(
            [
                {"slug": "a", "display_name": "A"},
                {"slug": "b", "display_name": "B"},
            ],
            display_name="Michele Bell",
        )
    except ValueError as exc:
        assert "exactly one matched --actor" in str(exc)
    else:
        raise AssertionError("expected ValueError for multi-entry override")


def test_actor_cli_overrides_noop_without_flags() -> None:
    entries = [{"slug": "michele_bell", "display_name": "Michele Bell"}]
    out = regenerate.apply_actor_cli_overrides(entries)
    assert out == entries


def test_explicit_display_name_wins_over_resolved_spelling_variant() -> None:
    """write_spec should prefer admin Michele over resolved Michelle when bucket key is set."""
    import argparse

    args = argparse.Namespace(
        actor="michele_bell",
        display_name="Michele Bell",
        actor_bucket_key="michele bell|CA",
        actor_row_id=None,
        photo=None,
        role="Judge",
        court=None,
        county=None,
        state="California",
        state_abbr="CA",
    )
    # Simulate resolved first_name still saying Michelle (stale row spelling).
    resolved_first = "Michelle"
    resolved_last = "Bell"
    display_title, display_first, display_last = spotlight_build.split_name(args.display_name)
    first_name = resolved_first
    last_name = resolved_last
    title = ""
    if display_first and display_last == last_name:
        display_first_key = spotlight_build._actor_name_key(display_first)
        first_name_key = spotlight_build._actor_name_key(first_name)
        explicit_identity = bool(str(args.actor_bucket_key or "").strip())
        spelling_differs = bool(
            first_name_key and display_first_key and first_name_key != display_first_key
        )
        if not first_name or (explicit_identity and spelling_differs):
            title = title or display_title
            first_name = display_first
            last_name = display_last
    assert first_name == "Michele"
    assert last_name == "Bell"
    computed = " ".join(p for p in [title, first_name, last_name] if p).strip()
    assert computed == "Michele Bell"


if __name__ == "__main__":
    import traceback

    tests = sorted(
        (name, obj)
        for name, obj in list(globals().items())
        if name.startswith("test_") and callable(obj)
    )
    passed = 0
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS  {name}")
            passed += 1
        except Exception:  # noqa: BLE001
            print(f"FAIL  {name}")
            traceback.print_exc()
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
