#!/usr/bin/env python3
"""Expose the PDF generator's public court-actor source for share pages.

The state PDFs use ``lib_supabase_rows.load_public_court_actors_from_supabase``
to decide which actor comments are public and how they are grouped. Share
slides must use the same source, otherwise Frame 3 can drift from the PDF.

Usage:
    python scripts/pdf/public_actor_for_share.py IN "David C. Bonfiglio"
    python scripts/pdf/public_actor_for_share.py --all
"""
from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))


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

from lib_supabase_rows import load_public_court_actors_from_supabase  # noqa: E402

_ROLE_PREFIX_RE = re.compile(
    r"^(hon\.?|honorable|judge|justice|magistrate|commissioner|referee|attorney|atty\.?|gal|guardian ad litem|minor'?s counsel|minor counsel|dr\.?|doctor)\s+",
    re.IGNORECASE,
)
_SUFFIX_RE = re.compile(r"\s+(jr\.?|sr\.?|ii|iii|iv|esq\.?|esquire)$", re.IGNORECASE)


def actor_key(name: Any) -> str:
    text = unicodedata.normalize("NFKD", str(name or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[.,'\"`´‘’]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = _ROLE_PREFIX_RE.sub("", text)
    text = _SUFFIX_RE.sub("", text)
    text = re.sub(r"\s+[a-z]\s+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return " ".join(
        re.sub(r"([a-z])\1+", r"\1", token) if len(token) >= 5 else token
        for token in text.split()
    )


def find_actor(state: str, display_name: str) -> dict | None:
    state = state.upper()
    target = actor_key(display_name)
    actors = load_public_court_actors_from_supabase(state).get(state) or []
    for actor in actors:
        if actor_key(actor.get("name")) == target:
            return actor
    target_tokens = set(target.split())
    if target_tokens:
        surname = max(target_tokens, key=len)
        candidates = [
            actor for actor in actors
            if surname in set(actor_key(actor.get("name")).split())
        ]
        if len(candidates) == 1:
            return candidates[0]
    return None


def main(argv: list[str]) -> int:
    if argv == ["--all"]:
        json.dump(load_public_court_actors_from_supabase(), sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    if len(argv) < 2:
        print("usage: public_actor_for_share.py <STATE_ABBR> <DISPLAY_NAME> | --all", file=sys.stderr)
        return 2
    actor = find_actor(argv[0], " ".join(argv[1:]))
    if not actor:
        print(f"no public actor match for {argv[1]!r} in {argv[0].upper()}", file=sys.stderr)
        return 1
    json.dump(actor, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
