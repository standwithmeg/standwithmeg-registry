"""
Build public/state-reports/index.json from live Supabase counts and the PDFs
that are actually committed under website/public/state-reports.

This is the deployment-facing index used by the public dashboard. The legacy
xlsx/master spreadsheet is not consulted here; Supabase is the canonical source.

Usage:
    python scripts/pdf/sync_public_state_reports.py
    python scripts/pdf/sync_public_state_reports.py --prune --require-all
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from generate_state_pdf import build_states
from lib_supabase_rows import load_rows_from_supabase

WEBSITE_DIR = BASE_DIR.parent.parent
PUBLIC_REPORT_DIR = WEBSITE_DIR / "public" / "state-reports"
PDF_RE = re.compile(r"^(?:[A-Z]{2}|[A-Za-z][A-Za-z0-9 -]{1,80})\.pdf$")


def _entry_for(state: str, count: int) -> dict:
    pdf_path = PUBLIC_REPORT_DIR / f"{state}.pdf"
    size_kb = round(pdf_path.stat().st_size / 1024) if pdf_path.exists() else 0
    return {
        "state": state,
        "submissions": count,
        "file": f"/state-reports/{state}.pdf",
        "size_kb": size_kb,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--prune",
        action="store_true",
        help="Remove public PDFs for states below the 30-family threshold.",
    )
    parser.add_argument(
        "--require-all",
        action="store_true",
        help="Fail if any 30+ location is missing its public PDF.",
    )
    args = parser.parse_args()

    PUBLIC_REPORT_DIR.mkdir(parents=True, exist_ok=True)

    rows = load_rows_from_supabase()
    by_state = build_states(rows)
    qualifying = {
        state: len(state_rows)
        for state, state_rows in by_state.items()
        if len(state_rows) >= 30
    }

    if args.prune:
        for pdf_path in PUBLIC_REPORT_DIR.glob("*.pdf"):
            if not PDF_RE.match(pdf_path.name):
                continue
            state = pdf_path.stem
            if state not in qualifying:
                pdf_path.unlink()
                print(f"  Removed stale under-threshold PDF: {pdf_path.relative_to(WEBSITE_DIR)}")

    missing = sorted(
        state for state in qualifying
        if not (PUBLIC_REPORT_DIR / f"{state}.pdf").exists()
    )
    if missing:
        print(f"  Missing public PDFs for 30+ locations: {', '.join(missing)}")
        if args.require_all:
            return 1

    entries = [
        _entry_for(state, count)
        for state, count in sorted(qualifying.items(), key=lambda item: (-item[1], item[0]))
        if (PUBLIC_REPORT_DIR / f"{state}.pdf").exists()
    ]

    index_path = PUBLIC_REPORT_DIR / "index.json"
    index_path.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")

    print(f"  Wrote {index_path.relative_to(WEBSITE_DIR)} with {len(entries)} report(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
