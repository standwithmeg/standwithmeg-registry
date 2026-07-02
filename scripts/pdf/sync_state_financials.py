"""
Write public/state-reports/financials.json from the live movement_stats_by_state
view — the same source the public /api/survey endpoint reads.

The public report dashboard normally shows live totals, but when Supabase is
briefly unreachable it falls back to the static snapshot in
lib/static-public-report-fallback.ts. That snapshot has no dollar totals of its
own, so without this file the "Total Reported Loss" card degrades to the
placeholder text "In state reports". Refreshing this file alongside the hourly
PDF/share regeneration keeps a real, capped figure available for the fallback.

The view already applies the $5M-per-submission outlier cap, so the totals here
match the live dashboard exactly. Fails open: a read error leaves any existing
financials.json untouched rather than breaking the regen batch.

Usage:
    python scripts/pdf/sync_state_financials.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from supabase import create_client, Client

BASE_DIR = Path(__file__).resolve().parent
WEBSITE_DIR = BASE_DIR.parent.parent
FINANCIALS_PATH = WEBSITE_DIR / "public" / "state-reports" / "financials.json"

VIEW = "movement_stats_by_state"
PAGE_SIZE = 1000


def _client() -> Client:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars"
        )
    return create_client(url, key)


def _load_rows(sb: Client) -> list[dict]:
    """Page through the view (Supabase caps each select at 1000 rows)."""
    rows: list[dict] = []
    offset = 0
    while True:
        resp = (
            sb.table(VIEW)
            .select("state,total_financial_loss")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def main() -> int:
    try:
        sb = _client()
        rows = _load_rows(sb)
    except Exception as exc:  # noqa: BLE001 — never break the regen batch on a read error
        print(f"  financials sync skipped (read failed): {exc}")
        return 0

    by_state: dict[str, int] = {}
    for row in rows:
        state = str(row.get("state") or "").strip()
        if not state:
            continue
        try:
            loss = int(round(float(row.get("total_financial_loss") or 0)))
        except (TypeError, ValueError):
            loss = 0
        # Defensive: keep the larger if a state ever appears twice.
        by_state[state] = max(by_state.get(state, 0), loss)

    total = sum(by_state.values())
    if total <= 0:
        # Refuse to overwrite a good file with an empty/zero snapshot.
        print("  financials sync skipped (view returned no loss totals).")
        return 0

    out = {
        "_comment": (
            "Capped (<=5M/submission) total reported loss from the "
            "movement_stats_by_state view. Auto-refreshed by "
            "scripts/pdf/sync_state_financials.py in the hourly regen workflow. "
            "Consumed by lib/static-public-report-fallback.ts so the public "
            "report's loss card shows a real figure even when live Supabase is "
            "briefly unreachable."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": VIEW,
        "total_financial_loss": total,
        "by_state": dict(sorted(by_state.items(), key=lambda kv: (-kv[1], kv[0]))),
    }

    FINANCIALS_PATH.parent.mkdir(parents=True, exist_ok=True)
    if FINANCIALS_PATH.exists():
        try:
            existing = json.loads(FINANCIALS_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing = None
        if isinstance(existing, dict):
            existing_without_timestamp = dict(existing)
            existing_without_timestamp.pop("generated_at", None)
            out_without_timestamp = dict(out)
            out_without_timestamp.pop("generated_at", None)
            if existing_without_timestamp == out_without_timestamp:
                print("  financials sync unchanged (only generated_at would change).")
                return 0

    FINANCIALS_PATH.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(
        f"  Wrote {FINANCIALS_PATH.relative_to(WEBSITE_DIR)} "
        f"({len(by_state)} states, total ${total:,})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
