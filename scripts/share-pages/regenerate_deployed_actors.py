#!/usr/bin/env python3
"""Regenerate deployed court-actor share pages from live Supabase data.

This is the versioned CI/admin path. It does not depend on the unversioned
``/Users/meghannmiller/Code/court-actor-posts`` checkout. It refreshes only
actors already present in ``public/court-actors/manifest.json`` unless a
specific manifest-filtered state is passed.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
WEBSITE_ROOT = SCRIPT_DIR.parent.parent
PUBLIC_ACTORS_DIR = WEBSITE_ROOT / "public" / "court-actors"
MANIFEST_PATH = PUBLIC_ACTORS_DIR / "manifest.json"
WORK_DIR = Path(os.environ.get("SWM_SHARE_WORKDIR", tempfile.mkdtemp(prefix="swm-share-pages-"))).resolve()
EXPORT_ROOT = WORK_DIR / "New Final Post and Capcut template" / "export"


@dataclass
class ActorResult:
    label: str
    slug: str
    state: str
    old_count: str
    new_count: str
    status: str


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def family_count_from_spec(spec: dict[str, Any] | None) -> str:
    if not spec:
        return "-"
    actor = spec.get("actor") or {}
    value = actor.get("family_count") or (spec.get("supabase") or {}).get("family_count")
    if value in (None, ""):
        return "-"
    try:
        return f"{int(float(value)):,}"
    except (TypeError, ValueError):
        return str(value)


def run(cmd: list[str], env: dict[str, str]) -> tuple[int, str, str]:
    proc = subprocess.run(cmd, cwd=WEBSITE_ROOT, env=env, capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def manifest_entries(state_filter: str | None) -> list[dict[str, Any]]:
    data = read_json(MANIFEST_PATH)
    if not data:
        raise SystemExit(f"manifest missing or unreadable: {MANIFEST_PATH}")
    entries = [
        entry for entry in (data.get("actors") or [])
        if isinstance(entry, dict) and entry.get("slug") and entry.get("state_abbr")
    ]
    if state_filter:
        state_filter = state_filter.upper()
        entries = [entry for entry in entries if str(entry.get("state_abbr") or "").upper() == state_filter]
    return entries


def state_name_from_spec(spec: dict[str, Any] | None, fallback: str) -> str:
    actor = (spec or {}).get("actor") or {}
    return str(actor.get("state") or fallback)


def build_env() -> dict[str, str]:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env.setdefault("SWM_SHARE_WORKDIR", str(WORK_DIR))
    env.setdefault("SWM_PHOTO_ROOT", str(WEBSITE_ROOT))
    env.setdefault("SWM_PDF_STATS_HELPER", str(WEBSITE_ROOT / "scripts" / "pdf" / "state_stats_for_share.py"))
    env.setdefault("SWM_PDF_PUBLIC_ACTOR_HELPER", str(WEBSITE_ROOT / "scripts" / "pdf" / "public_actor_for_share.py"))

    stats_cache = env.get("SWM_PDF_STATS_CACHE")
    if not stats_cache:
        stats_cache = str(WORK_DIR / "state-stats-cache.json")
        code, out, err = run([sys.executable, "scripts/pdf/state_stats_for_share.py", "--all"], env)
        if code != 0:
            raise SystemExit(err or out or "state_stats_for_share.py --all failed")
        Path(stats_cache).write_text(out)
        env["SWM_PDF_STATS_CACHE"] = stats_cache

    actor_cache = env.get("SWM_PUBLIC_ACTORS_CACHE")
    if not actor_cache:
        actor_cache = str(WORK_DIR / "public-actors-cache.json")
        code, out, err = run([sys.executable, "scripts/pdf/public_actor_for_share.py", "--all"], env)
        if code != 0:
            raise SystemExit(err or out or "public_actor_for_share.py --all failed")
        Path(actor_cache).write_text(out)
        env["SWM_PUBLIC_ACTORS_CACHE"] = actor_cache

    return env


def copy_generated_assets(slug: str, state_abbr: str) -> None:
    generated_dir = EXPORT_ROOT / slug
    dest_dir = PUBLIC_ACTORS_DIR / state_abbr.lower() / slug
    dest_dir.mkdir(parents=True, exist_ok=True)
    for filename in ("spec.json", "share.html", "frame-01.jpg", "frame-02.jpg", "frame-03.jpg", "frame-04.jpg", "frame-05.jpg", "frame-06.jpg"):
        src = generated_dir / filename
        if src.exists():
            shutil.copy2(src, dest_dir / filename)


def rewrite_manifest() -> None:
    entries: list[dict[str, Any]] = []
    for state_dir in sorted(PUBLIC_ACTORS_DIR.iterdir()):
        if not state_dir.is_dir():
            continue
        for actor_dir in sorted(state_dir.iterdir()):
            if not actor_dir.is_dir():
                continue
            spec = read_json(actor_dir / "spec.json")
            if not spec:
                continue
            actor = spec.get("actor") or {}
            entries.append({
                "slug": actor.get("slug") or actor_dir.name,
                "state_abbr": actor.get("state_abbr"),
                "display_name": actor.get("display_name"),
                "canonical_name": actor.get("display_name"),
                "actor_bucket_key": actor.get("actor_bucket_key"),
                "photo_url": f"/court-actors/{state_dir.name}/{actor_dir.name}/image_1080.png"
                if (actor_dir / "image_1080.png").exists() else None,
                "share_url": f"/court-actors/{state_dir.name}/{actor_dir.name}/share.html"
                if (actor_dir / "share.html").exists() else None,
            })
    MANIFEST_PATH.write_text(json.dumps({
        "generated_at": datetime.now().isoformat(),
        "actors": entries,
    }, indent=2) + "\n")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", help="Optional 2-letter state filter. Omit for every manifest actor.")
    parser.add_argument("--skip-frames", action="store_true", help="Regenerate share.html/spec.json only.")
    args = parser.parse_args(argv)

    state_filter = args.state.strip().upper() if args.state else None
    if state_filter and not (len(state_filter) == 2 and state_filter.isalpha()):
        parser.error("--state must be a two-letter code")

    entries = manifest_entries(state_filter)
    if not entries:
        print("no manifest actors matched")
        return 0

    env = build_env()
    results: list[ActorResult] = []
    failed = False
    for entry in entries:
        slug = str(entry["slug"])
        state_abbr = str(entry["state_abbr"]).upper()
        deployed_spec_path = PUBLIC_ACTORS_DIR / state_abbr.lower() / slug / "spec.json"
        deployed_spec = read_json(deployed_spec_path)
        actor = (deployed_spec or {}).get("actor") or {}
        photo_path = PUBLIC_ACTORS_DIR / state_abbr.lower() / slug / "image_1080.png"
        label = str(entry.get("display_name") or actor.get("display_name") or entry.get("canonical_name") or slug)
        old_count = family_count_from_spec(deployed_spec)

        cmd = [
            sys.executable,
            "scripts/share-pages/spotlight_build.py",
            "--actor", slug,
            "--display-name", label,
            "--state", state_name_from_spec(deployed_spec, state_abbr),
            "--state-abbr", state_abbr,
        ]
        if actor.get("role"):
            cmd.extend(["--role", str(actor["role"])])
        if actor.get("court"):
            cmd.extend(["--court", str(actor["court"])])
        if actor.get("county"):
            cmd.extend(["--county", str(actor["county"])])
        if photo_path.exists():
            cmd.extend(["--photo", str(photo_path.relative_to(WEBSITE_ROOT))])
        if actor.get("actor_row_id"):
            cmd.extend(["--actor-row-id", str(actor["actor_row_id"])])
        actor_bucket_key = entry.get("actor_bucket_key") or actor.get("actor_bucket_key")
        if actor_bucket_key:
            cmd.extend(["--actor-bucket-key", str(actor_bucket_key)])

        code, out, err = run(cmd, env)
        if code != 0:
            failed = True
            results.append(ActorResult(label, slug, state_abbr, old_count, "-", "build failed"))
            print(err or out, file=sys.stderr)
            continue

        code, out, err = run([sys.executable, "scripts/share-pages/render_spotlight.py", slug, "--web"], env)
        if code != 0:
            failed = True
            results.append(ActorResult(label, slug, state_abbr, old_count, "-", "render failed"))
            print(err or out, file=sys.stderr)
            continue

        if not args.skip_frames:
            code, out, err = run([sys.executable, "scripts/share-pages/prerender_frames.py", slug], env)
            if code != 0:
                failed = True
                results.append(ActorResult(label, slug, state_abbr, old_count, "-", "frame render failed"))
                print(err or out, file=sys.stderr)
                continue

        copy_generated_assets(slug, state_abbr)
        fresh_spec = read_json(EXPORT_ROOT / slug / "spec.json")
        new_count = family_count_from_spec(fresh_spec)
        results.append(ActorResult(
            label, slug, state_abbr, old_count, new_count,
            "unchanged" if old_count == new_count else "updated",
        ))

    rewrite_manifest()
    print("actor | state | old_family_count | new_family_count | status")
    print("------|-------|------------------|------------------|-------")
    for r in results:
        print(f"{r.label} | {r.state} | {r.old_count} | {r.new_count} | {r.status}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
