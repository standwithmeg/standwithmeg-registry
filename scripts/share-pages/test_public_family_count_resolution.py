#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("spotlight_build.py")
SPEC = importlib.util.spec_from_file_location("spotlight_build", MODULE_PATH)
assert SPEC and SPEC.loader
spotlight_build = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = spotlight_build
SPEC.loader.exec_module(spotlight_build)


def test_canonical_count_wins_over_stale_lower_api_cache() -> None:
    assert spotlight_build.choose_public_family_count(4, 3) == (
        4,
        "local_resolver_over_stale_api",
    )


def test_api_count_still_wins_when_it_is_current_or_higher() -> None:
    assert spotlight_build.choose_public_family_count(3, 4) == (4, "public_api")
    assert spotlight_build.choose_public_family_count(4, 4) == (4, "public_api")


def test_local_count_remains_the_fallback_when_api_is_unavailable() -> None:
    assert spotlight_build.choose_public_family_count(4, None) == (
        4,
        "local_resolver_fallback",
    )


if __name__ == "__main__":
    tests = [value for name, value in globals().items() if name.startswith("test_") and callable(value)]
    for test in tests:
        test()
    print(f"{len(tests)} passed")
