#!/usr/bin/env python3
"""Refresh the public actor cache after share-page deploys.

The report page reads from a materialized view and a DB cache. The share-page
regenerator reads directly from Supabase, so a freshly-deployed actor can be
live on Vercel before the report page sees it. This script forces the MV and
cache to refresh so the report page catches up immediately.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
WEBSITE_ROOT = BASE_DIR.parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(WEBSITE_ROOT / "scripts" / "pdf"))


def _load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


for parent in BASE_DIR.parents:
    _load_env(parent / ".env.local")
    _load_env(parent / ".env")

from supabase import create_client, Client  # noqa: E402


def _client() -> Client:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def main() -> int:
    sb = _client()
    print("Refreshing materialized view mv_court_actors_public_safe...")
    try:
        sb.rpc("refresh_mv_court_actors_public_safe").execute()
        print("  OK")
    except Exception as exc:
        print(f"  FAILED: {exc}", file=sys.stderr)
        return 1

    print("Expiring public_actor_cache rows...")
    try:
        sb.table("public_actor_cache").delete().neq("cache_key", "").execute()
        print("  OK")
    except Exception as exc:
        print(f"  FAILED: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
