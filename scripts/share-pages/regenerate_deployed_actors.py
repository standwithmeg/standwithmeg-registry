#!/usr/bin/env python3
"""Regenerate deployed court-actor share pages from live Supabase data.

This is the versioned CI/admin path. It does not depend on the unversioned
``/Users/meghannmiller/Code/court-actor-posts`` checkout. It refreshes only
actors already present in ``public/court-actors/manifest.json`` unless a
specific manifest-filtered state is passed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
WEBSITE_ROOT = SCRIPT_DIR.parent.parent
PUBLIC_ACTORS_DIR = WEBSITE_ROOT / "public" / "court-actors"
MEG_INTRO_DIR = PUBLIC_ACTORS_DIR / "_assets" / "meg-intros"
MANIFEST_PATH = PUBLIC_ACTORS_DIR / "manifest.json"
WORK_DIR = Path(os.environ.get("SWM_SHARE_WORKDIR", tempfile.mkdtemp(prefix="swm-share-pages-"))).resolve()
EXPORT_ROOT = WORK_DIR / "New Final Post and Capcut template" / "export"
CACHE_FILENAME = ".regen-cache.json"
TEMPLATE_INPUT_FILES = (
    "scripts/share-pages/spotlight_build.py",
    "scripts/share-pages/render_spotlight.py",
    "scripts/share-pages/prerender_frames.py",
    "scripts/share-pages/spotlight_columns.json",
    "scripts/pdf/public_actor_for_share.py",
    "scripts/pdf/state_stats_for_share.py",
    "scripts/pdf/generate_state_pdf.py",
    "scripts/pdf/lib_supabase_rows.py",
)


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


def stable_json(data: Any) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def sha256_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def template_version() -> str:
    payload = []
    for rel in TEMPLATE_INPUT_FILES:
        path = WEBSITE_ROOT / rel
        payload.append({"path": rel, "sha256": sha256_file(path)})
    return sha256_text(stable_json(payload))


def cache_path(slug: str, state_abbr: str) -> Path:
    return PUBLIC_ACTORS_DIR / state_abbr.lower() / slug / CACHE_FILENAME


def read_cache(slug: str, state_abbr: str) -> dict[str, Any] | None:
    return read_json(cache_path(slug, state_abbr))


def write_cache(slug: str, state_abbr: str, input_hash: str, version_hash: str) -> None:
    path = cache_path(slug, state_abbr)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(stable_json({
        "input_hash": input_hash,
        "last_regen": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "template_version": version_hash,
    }) + "\n")


def actor_outputs_exist(slug: str, state_abbr: str, render_frames: bool) -> bool:
    actor_dir = PUBLIC_ACTORS_DIR / state_abbr.lower() / slug
    required = ["spec.json", "share.html"]
    if render_frames:
        required.extend(f"frame-{i:02d}.jpg" for i in range(1, 8))
    return all((actor_dir / filename).exists() for filename in required)


def meg_intro_path(state_abbr: str) -> Path:
    return MEG_INTRO_DIR / f"meg_intro_{state_abbr.lower()}.jpg"


def actor_name_key(name: Any) -> str:
    return " ".join(
        "".join(ch.lower() if ch.isalnum() else " " for ch in str(name or "")).split()
    )


def public_actor_for_entry(public_actors_by_state: dict[str, Any], state_abbr: str, display_name: str) -> dict[str, Any] | None:
    actors = public_actors_by_state.get(state_abbr.upper()) or []
    target = actor_name_key(display_name)
    for actor in actors:
        if actor_name_key(actor.get("name") or actor.get("display_name")) == target:
            return actor
    target_parts = target.split()
    if target_parts:
        surname = target_parts[-1]
        matches = [
            actor for actor in actors
            if surname and surname in actor_name_key(actor.get("name") or actor.get("display_name")).split()
        ]
        if len(matches) == 1:
            return matches[0]
    return None


def load_cache_file(env: dict[str, str], key: str) -> dict[str, Any]:
    path = env.get(key)
    if not path:
        return {}
    data = read_json(Path(path))
    return data if isinstance(data, dict) else {}


def actor_input_hash(
    entry: dict[str, Any],
    deployed_spec: dict[str, Any] | None,
    state_stats_by_state: dict[str, Any],
    public_actors_by_state: dict[str, Any],
    version_hash: str,
    render_frames: bool,
) -> str:
    slug = str(entry["slug"])
    state_abbr = str(entry["state_abbr"]).upper()
    actor = (deployed_spec or {}).get("actor") or {}
    label = str(entry.get("display_name") or actor.get("display_name") or entry.get("canonical_name") or slug)
    photo_path = PUBLIC_ACTORS_DIR / state_abbr.lower() / slug / "image_1080.png"
    public_actor = public_actor_for_entry(public_actors_by_state, state_abbr, label)
    public_payload = public_actor if public_actor is not None else {
        "unmatched_state_public_actors": public_actors_by_state.get(state_abbr) or [],
    }
    actor_hints = {
        "slug": slug,
        "state_abbr": state_abbr,
        "display_name": label,
        "entry_actor_bucket_key": entry.get("actor_bucket_key"),
    }
    if public_actor is None:
        actor_hints.update({
            "role": actor.get("role"),
            "court": actor.get("court"),
            "county": actor.get("county"),
            "actor_row_id": actor.get("actor_row_id"),
            "actor_bucket_key": actor.get("actor_bucket_key"),
        })
    payload = {
        "actor": actor_hints,
        "photo_sha256": sha256_file(photo_path),
        "meg_intro_sha256": sha256_file(meg_intro_path(state_abbr)),
        "public_actor_payload": public_payload,
        "state_stats": state_stats_by_state.get(state_abbr),
        "template_version": version_hash,
        "render_frames": render_frames,
    }
    return sha256_text(stable_json(payload))


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
    for filename in ("spec.json", "share.html", "frame-01.jpg"):
        src = generated_dir / filename
        if src.exists():
            shutil.copy2(src, dest_dir / filename)
    meg_src = meg_intro_path(state_abbr)
    if meg_src.exists():
        shutil.copy2(meg_src, dest_dir / "frame-02.jpg")
    else:
        print(f"[meg-intro] missing meg_intro_{state_abbr.lower()}.jpg - falling back to generated frame-02 for slug={slug}", file=sys.stderr)
        src = generated_dir / "frame-02.jpg"
        if src.exists():
            shutil.copy2(src, dest_dir / "frame-02.jpg")
    for filename in ("frame-03.jpg", "frame-04.jpg", "frame-05.jpg", "frame-06.jpg", "frame-07.jpg"):
        src = generated_dir / filename
        if src.exists():
            shutil.copy2(src, dest_dir / filename)


def prepare_generated_meg_intro(slug: str, state_abbr: str) -> None:
    meg_src = meg_intro_path(state_abbr)
    if not meg_src.exists():
        print(f"[meg-intro] missing meg_intro_{state_abbr.lower()}.jpg - frame-02 image may be blank for slug={slug}", file=sys.stderr)
        return
    generated_dir = EXPORT_ROOT / slug
    generated_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(meg_src, generated_dir / "frame-02.jpg")


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
    parser.add_argument("--force", action="store_true", help="Bypass .regen-cache.json and regenerate every selected actor.")
    parser.add_argument("--changed-only", action="store_true", default=True, help="Regenerate only changed actors. Default unless --force is set.")
    args = parser.parse_args(argv)

    state_filter = args.state.strip().upper() if args.state else None
    if state_filter and not (len(state_filter) == 2 and state_filter.isalpha()):
        parser.error("--state must be a two-letter code")

    entries = manifest_entries(state_filter)
    if not entries:
        print("no manifest actors matched")
        return 0

    env = build_env()
    state_stats_by_state = load_cache_file(env, "SWM_PDF_STATS_CACHE")
    public_actors_by_state = load_cache_file(env, "SWM_PUBLIC_ACTORS_CACHE")
    version_hash = template_version()
    render_frames = not args.skip_frames
    results: list[ActorResult] = []
    failed = False
    changed_any = False
    for entry in entries:
        slug = str(entry["slug"])
        state_abbr = str(entry["state_abbr"]).upper()
        deployed_spec_path = PUBLIC_ACTORS_DIR / state_abbr.lower() / slug / "spec.json"
        deployed_spec = read_json(deployed_spec_path)
        actor = (deployed_spec or {}).get("actor") or {}
        photo_path = PUBLIC_ACTORS_DIR / state_abbr.lower() / slug / "image_1080.png"
        label = str(entry.get("display_name") or actor.get("display_name") or entry.get("canonical_name") or slug)
        old_count = family_count_from_spec(deployed_spec)
        input_hash = actor_input_hash(
            entry,
            deployed_spec,
            state_stats_by_state,
            public_actors_by_state,
            version_hash,
            render_frames,
        )
        cached = read_cache(slug, state_abbr)
        if (not args.force
                and cached
                and cached.get("input_hash") == input_hash
                and actor_outputs_exist(slug, state_abbr, render_frames)):
            results.append(ActorResult(label, slug, state_abbr, old_count, old_count, "skipped (unchanged)"))
            print(f"· skipped {slug} (unchanged)")
            continue

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

        prepare_generated_meg_intro(slug, state_abbr)

        if not args.skip_frames:
            code, out, err = run([sys.executable, "scripts/share-pages/prerender_frames.py", slug], env)
            if code != 0:
                failed = True
                results.append(ActorResult(label, slug, state_abbr, old_count, "-", "frame render failed"))
                print(err or out, file=sys.stderr)
                continue

        copy_generated_assets(slug, state_abbr)
        write_cache(slug, state_abbr, input_hash, version_hash)
        changed_any = True
        fresh_spec = read_json(EXPORT_ROOT / slug / "spec.json")
        new_count = family_count_from_spec(fresh_spec)
        results.append(ActorResult(
            label, slug, state_abbr, old_count, new_count,
            "unchanged" if old_count == new_count else "updated",
        ))

    if changed_any:
        rewrite_manifest()
    print("actor | state | old_family_count | new_family_count | status")
    print("------|-------|------------------|------------------|-------")
    for r in results:
        print(f"{r.label} | {r.state} | {r.old_count} | {r.new_count} | {r.status}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
