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


def test_visibility_map_keeps_unembedded_public_actor_row() -> None:
    row = {
        "id": "actor-row-1",
        "submission_id": "survey-1",
        "name": "Andrew Ellis",
        # Deliberately no embedded survey_submissions object. This is the
        # shape returned by the generator's normal `select('*')` query.
    }

    kept = spotlight_build._countable_actor_rows(
        [row],
        "submission_id",
        set(),
        {"survey-1": {"approved": True, "permission_to_share": "public"}},
    )

    assert kept == [row]


def test_visibility_map_rejects_private_and_hidden_rows() -> None:
    public_row = {"id": "public", "submission_id": "survey-public"}
    private_row = {"id": "private", "submission_id": "survey-private"}
    hidden_row = {"id": "hidden", "submission_id": "survey-hidden"}

    kept = spotlight_build._countable_actor_rows(
        [public_row, private_row, hidden_row],
        "submission_id",
        {"survey-hidden"},
        {
            "survey-public": {"approved": True, "permission_to_share": "anonymous"},
            "survey-private": {"approved": True, "permission_to_share": "data_only"},
            "survey-hidden": {"approved": True, "permission_to_share": "public"},
        },
    )

    # data_only is countable but not quoteable; hidden rows are excluded.
    assert kept == [public_row, private_row]


if __name__ == "__main__":
    tests = [
        test_visibility_map_keeps_unembedded_public_actor_row,
        test_visibility_map_rejects_private_and_hidden_rows,
    ]
    for test in tests:
        test()
        print(f"PASS  {test.__name__}")
