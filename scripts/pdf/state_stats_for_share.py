"""
State stats helper for the share-page generator.

Both the public state PDFs (generate_state_pdf.py) and the per-actor share
pages (court-actor-posts/_scripts/spotlight_build.py) need identical state
headline stats — Median Family Burden, % Pro Se, Median Months Lost. Without
a single shared compute path they drift (the share slide for FL once read
$215,500 / 58.9% / 20 mo while the FL PDF read $226,000 / 58.6% / 18 mo).

This module loads the same rows from Supabase, runs the same `state_stats()`
function, and emits a small JSON object. The share-page builder shells out
to it; the regression checker compares its output against rendered share
slides. If you need to change the headline math, change it in
`generate_state_pdf.state_stats()` and both consumers stay in lockstep.

Usage:
    python3 state_stats_for_share.py FL
    python3 state_stats_for_share.py --all
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Local imports — these files sit next to this helper.
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))


def _load_env(path: Path) -> None:
    """Bootstrap Supabase env vars from a .env file when the helper is
    invoked outside Next.js (e.g. via subprocess from court-actor-posts).
    Mirrors the loader used in court-actor-posts/_scripts/spotlight_build.py."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


# Walk parents looking for the next-repo root that owns .env.local. This
# lets the share builder invoke us by absolute path without piping env
# vars manually.
for parent in BASE_DIR.parents:
    candidate = parent / ".env.local"
    if candidate.exists():
        _load_env(candidate)
        break

from generate_state_pdf import build_states, state_stats  # noqa: E402
from lib_supabase_rows import load_rows_from_supabase  # noqa: E402


# Public column names that match the share-page spec schema. The PDF
# internally produces a richer dict; we only expose the headline numbers
# that Frame 5 renders, plus the dashboard count Frame 1 displays.
def _to_headline(state_abbr: str, rows: list) -> dict:
    if not rows:
        return {
            "state_abbr": state_abbr,
            "state_family_count": 0,
            "median_financial_loss": None,
            "median_burden_sample_size": 0,
            "median_months_lost": None,
            "pro_se_pct": None,
            "pro_se_count": 0,
            "source": "scripts/pdf/state_stats_for_share.py",
        }
    d = state_stats(rows)
    family_burden = d.get("family_burden") or {}
    months_lost = d.get("months_lost") or {}
    return {
        "state_abbr": state_abbr,
        "state_family_count": d.get("total") or 0,
        "median_financial_loss": family_burden.get("median"),
        "median_burden_sample_size": family_burden.get("n") or 0,
        "median_months_lost": months_lost.get("median"),
        "pro_se_pct": d.get("pro_se_pct"),
        "pro_se_count": int(round(((d.get("pro_se_pct") or 0) / 100.0) * (d.get("total") or 0))),
        "source": "scripts/pdf/state_stats_for_share.py",
    }


def _load_rows_quietly() -> list:
    """lib_supabase_rows.load_rows_from_supabase prints a 'Loaded …' summary
    to stdout. We want pure JSON on stdout for subprocess consumers, so
    silently redirect that print to stderr while loading."""
    import contextlib
    with contextlib.redirect_stdout(sys.stderr):
        return load_rows_from_supabase()


def stats_for_state(state_abbr: str) -> dict:
    """Return headline stats for one state. Loads the full Supabase row set
    once and filters — same as the PDF generator."""
    state_abbr = (state_abbr or "").upper()
    rows = _load_rows_quietly()
    by_state = build_states(rows)
    return _to_headline(state_abbr, by_state.get(state_abbr) or [])


def stats_for_all_states() -> dict[str, dict]:
    rows = _load_rows_quietly()
    by_state = build_states(rows)
    return {abbr: _to_headline(abbr, st_rows) for abbr, st_rows in by_state.items()}


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: state_stats_for_share.py <STATE_ABBR> | --all", file=sys.stderr)
        return 2
    if argv[0] == "--all":
        json.dump(stats_for_all_states(), sys.stdout, indent=2, default=str)
        sys.stdout.write("\n")
        return 0
    state_abbr = argv[0].upper()
    json.dump(stats_for_state(state_abbr), sys.stdout, indent=2, default=str)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
