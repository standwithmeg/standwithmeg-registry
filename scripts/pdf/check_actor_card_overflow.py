#!/usr/bin/env python3
"""Per-state actor-card overflow risk audit for the court-actor PDF.

Uses the same weight estimator (`_court_actor_card_weight`) that
`_paginate_court_actors` uses, so any card whose estimated weight is
close to the per-page budget is flagged here too. Run after share-page
regen but before committing PDFs; if a state reports MAX_OVER_BUDGET,
the corresponding state PDF is at real risk of bleeding a card across
the bottom margin (the original Kevin Greer / OH page-4 regression).

Usage:
    python3 scripts/pdf/check_actor_card_overflow.py
    python3 scripts/pdf/check_actor_card_overflow.py --state OH
    python3 scripts/pdf/check_actor_card_overflow.py --json

Exits non-zero when any actor card alone would exceed the continuation
page budget — that is the only scenario the paginator cannot fix.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from generate_state_pdf import _court_actor_card_weight, _paginate_court_actors  # noqa: E402
from lib_supabase_rows import load_public_court_actors_from_supabase  # noqa: E402

# Mirror the budgets in _pack_actor_pages so we report a single source of
# truth. If those change, change here too.
PAGE_BUDGET_FIRST = 3400
PAGE_BUDGET_REST = 4600


def audit(state_filter: str | None = None) -> list[dict]:
    by_state = load_public_court_actors_from_supabase(state_filter)
    results: list[dict] = []
    for state, actors in sorted(by_state.items()):
        if not actors:
            continue
        weights = [_court_actor_card_weight(a) for a in actors]
        pages = _paginate_court_actors(actors)
        per_card = sorted(
            ({"name": a["name"], "weight": w, "comments": len(a.get("comments", []))}
             for a, w in zip(actors, weights)),
            key=lambda x: -x["weight"],
        )
        max_w = per_card[0]["weight"] if per_card else 0
        over_budget = max_w > PAGE_BUDGET_REST
        results.append({
            "state": state,
            "actors": len(actors),
            "pages": len(pages),
            "max_card_weight": max_w,
            "max_card_name": per_card[0]["name"] if per_card else None,
            "page_budget_rest": PAGE_BUDGET_REST,
            "over_budget": over_budget,
            "heaviest": per_card[:3],
        })
    return results


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--state", help="audit only this state abbr")
    p.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = p.parse_args(argv)

    results = audit(args.state)
    if args.json:
        print(json.dumps(results, indent=2, default=str))
        return 1 if any(r["over_budget"] for r in results) else 0

    print(f"{'STATE':<6} {'ACTORS':>7} {'PAGES':>6} {'MAX_W':>7} {'BUDGET':>7}  HEAVIEST CARD")
    print("-" * 80)
    failed = 0
    for r in results:
        flag = "!! OVER" if r["over_budget"] else "ok"
        if r["over_budget"]:
            failed += 1
        print(
            f"{r['state']:<6} {r['actors']:>7} {r['pages']:>6} "
            f"{r['max_card_weight']:>7} {r['page_budget_rest']:>7}  "
            f"{flag}  {r['max_card_name']}"
        )
    print("-" * 80)
    print(f"{len(results) - failed}/{len(results)} states within budget · {failed} over budget")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
