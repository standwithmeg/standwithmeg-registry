#!/usr/bin/env python3
"""Regenerate deployed court-actor share pages from live Supabase data.

This is the versioned CI/admin path. It does not depend on the unversioned
``/Users/meghannmiller/Code/court-actor-posts`` checkout. It refreshes actors
already present in ``public/court-actors/manifest.json`` and also picks up
new public-threshold actors from the same cache used by the share/PDF helpers.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
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
ROLE_PREFIX_RE = re.compile(
    r"^(hon\.?|honorable|judge|justice|magistrate|commissioner|referee|attorney|atty\.?|gal|guardian ad litem|minor'?s counsel|minor counsel|dr\.?|doctor)\s+",
    re.IGNORECASE,
)
SUFFIX_RE = re.compile(r"\s+(jr\.?|sr\.?|ii|iii|iv|esq\.?|esquire)$", re.IGNORECASE)
GIVEN_NAME_ALIASES = {
    "andy": "andrew",
    "drew": "andrew",
    "keven": "kevin",
    "anika": "anneka",
    "aneka": "anneka",
    "jonathan": "johnathan",
    "johnathan": "johnathan",
}
TEMPLATE_INPUT_FILES = (
    "scripts/share-pages/spotlight_build.py",
    "scripts/share-pages/render_spotlight.py",
    "scripts/share-pages/prerender_frames.py",
    "scripts/share-pages/spotlight_columns.json",
    "scripts/share-pages/actor_overrides.json",
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


def frame_ids_from_share_html(actor_dir: Path) -> list[str]:
    share_path = actor_dir / "share.html"
    if not share_path.exists():
        return [f"frame-{i:02d}" for i in range(1, 8)]
    html = share_path.read_text(errors="ignore")
    ids = re.findall(r'<article\s+class="[^"]*\bframe\b[^"]*"\s+id="(frame-\d{2})"', html)
    seen: list[str] = []
    for frame_id in ids:
        if frame_id not in seen:
            seen.append(frame_id)
    return seen or [f"frame-{i:02d}" for i in range(1, 8)]


def meg_frame_id_from_share_html(actor_dir: Path) -> str:
    share_path = actor_dir / "share.html"
    if not share_path.exists():
        return "frame-04"
    html = share_path.read_text(errors="ignore")
    match = re.search(r'<article\s+class="[^"]*\bf2\b[^"]*"\s+id="(frame-\d{2})"', html)
    return match.group(1) if match else "frame-04"


def actor_outputs_exist(slug: str, state_abbr: str, render_frames: bool) -> bool:
    actor_dir = PUBLIC_ACTORS_DIR / state_abbr.lower() / slug
    required = ["spec.json", "share.html"]
    if render_frames:
        required.extend(f"{frame_id}.jpg" for frame_id in frame_ids_from_share_html(actor_dir))
    return all((actor_dir / filename).exists() for filename in required)


def actor_photo_wired(slug: str, state_abbr: str) -> bool:
    """Return false for cached output that still renders the photo placeholder."""
    actor_dir = PUBLIC_ACTORS_DIR / state_abbr.lower() / slug
    photo_path = actor_dir / "image_1080.png"
    if not photo_path.exists():
        return True
    # If the photo file is on disk and the share.html does not contain the
    # placeholder, the photo is wired — regardless of what spec.json says.
    share_path = actor_dir / "share.html"
    try:
        share_html = share_path.read_text(errors="ignore")
    except OSError:
        return False
    if "{{ACTOR.IMAGE_URL}}" not in share_html:
        return True
    # Fallback: spec.json may still say photo.exists=false even though the
    # share.html already renders the real image. Accept it if the file exists.
    spec = read_json(actor_dir / "spec.json") or {}
    photo = spec.get("photo") or {}
    return bool(photo.get("exists") and photo.get("path"))


def meg_intro_path(state_abbr: str) -> Path:
    return MEG_INTRO_DIR / f"meg_intro_{state_abbr.lower()}.jpg"


def actor_name_key(name: Any) -> str:
    text = unicodedata.normalize("NFKD", str(name or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[.,'\"`´‘’]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = ROLE_PREFIX_RE.sub("", text)
    text = SUFFIX_RE.sub("", text)
    text = re.sub(r"\s+[a-z]\s+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    tokens = text.split()
    if len(tokens) >= 2:
        tokens[0] = GIVEN_NAME_ALIASES.get(tokens[0], tokens[0])
    return " ".join(
        re.sub(r"([a-z])\1+", r"\1", token) if len(token) >= 5 else token
        for token in tokens
    )


def spotlight_slug(name: Any) -> str:
    text = unicodedata.normalize("NFKD", str(name or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-z0-9]+", "_", text))


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


def submission_count_from_spec(spec: dict[str, Any] | None) -> str:
    if not spec:
        return "-"
    actor = spec.get("actor") or {}
    # Prefer the same family count the public card and cover slide use.
    value = (
        actor.get("public_family_count")
        or actor.get("family_count")
        or actor.get("actor_report_count")
        or actor.get("mention_count")
        or (spec.get("supabase") or {}).get("public_family_count")
        or (spec.get("supabase") or {}).get("actor_report_count")
        or (spec.get("supabase") or {}).get("mention_count")
        or (spec.get("supabase") or {}).get("family_count")
    )
    if value in (None, ""):
        return "-"
    try:
        return f"{int(float(value)):,}"
    except (TypeError, ValueError):
        return str(value)


def apply_actor_cli_overrides(
    entries: list[dict[str, Any]],
    display_name: str | None = None,
    actor_bucket_key: str | None = None,
) -> list[dict[str, Any]]:
    """Apply single-actor identity overrides from admin/workflow dispatch.

    Explicit display_name + actor_bucket_key pin Michele Bell to her public
    bucket even when the on-disk manifest still says 'Michelle Bell'.
    """
    if not (display_name or actor_bucket_key):
        return entries
    if len(entries) != 1:
        raise ValueError("--display-name/--actor-bucket-key require exactly one matched --actor")
    if display_name:
        entries[0]["display_name"] = display_name.strip()
        entries[0]["canonical_name"] = display_name.strip()
    if actor_bucket_key:
        entries[0]["actor_bucket_key"] = actor_bucket_key.strip()
    return entries


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


def _manifest_actor_dir(entry: dict[str, Any]) -> Path:
    return PUBLIC_ACTORS_DIR / str(entry.get("state_abbr") or "").lower() / str(entry.get("slug") or "")


def _entry_public_asset_score(entry: dict[str, Any]) -> tuple[int, int, int, int, int, str]:
    """Rank duplicate deployed folders; higher score is the one to keep."""
    actor_dir = _manifest_actor_dir(entry)
    spec = read_json(actor_dir / "spec.json") or {}
    actor = spec.get("actor") or {}
    unresolved = spec.get("unresolved") or []
    count = 0
    for value in (
        actor.get("public_family_count"),
        actor.get("family_count"),
        actor.get("actor_report_count"),
        actor.get("mention_count"),
    ):
        try:
            count = int(float(value))
            break
        except (TypeError, ValueError):
            continue
    frame_count = len(list(actor_dir.glob("frame-*.jpg"))) if actor_dir.exists() else 0
    return (
        int((actor_dir / "image_1080.png").exists()),
        int((actor_dir / "share.html").exists()),
        frame_count,
        count,
        -len(unresolved) if isinstance(unresolved, list) else 0,
        str(entry.get("slug") or ""),
    )


def prune_existing_duplicate_actor_dirs(entries: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[ActorResult]]:
    """Remove already-deployed duplicate public cards before manifest rewrite.

    The new-actor path below prevents future alias variants from shipping, but
    it cannot repair duplicates already committed under public/court-actors.
    Mirror the verifier's identity checks here and keep the richest deployed
    folder, preferring wired photos and complete share assets.
    """
    from verify_share_consistency import _person_identity

    deployed_entries = [
        entry for entry in entries
        if not entry.get("_new_public_actor") and _manifest_actor_dir(entry).exists()
    ]
    duplicate_groups: list[list[dict[str, Any]]] = []
    by_bucket: dict[str, list[dict[str, Any]]] = {}
    by_identity: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for entry in deployed_entries:
        bucket = str(entry.get("actor_bucket_key") or "").strip().lower()
        if bucket:
            by_bucket.setdefault(bucket, []).append(entry)
        identity = _person_identity(entry)
        state = str(entry.get("state_abbr") or "").upper()
        if identity:
            by_identity.setdefault((state, identity), []).append(entry)

    for groups in (by_bucket, by_identity):
        for group in groups.values():
            slugs = {str(entry.get("slug") or "") for entry in group if entry.get("slug")}
            if len(slugs) > 1:
                duplicate_groups.append(group)

    removed_slugs: set[str] = set()
    results: list[ActorResult] = []
    for group in duplicate_groups:
        candidates = [entry for entry in group if str(entry.get("slug") or "") not in removed_slugs]
        if len(candidates) < 2:
            continue
        keeper = max(candidates, key=_entry_public_asset_score)
        keeper_slug = str(keeper.get("slug") or "")
        keeper_dir = _manifest_actor_dir(keeper)
        keeper_photo = keeper_dir / "image_1080.png"
        for entry in candidates:
            slug = str(entry.get("slug") or "")
            if not slug or slug == keeper_slug:
                continue
            state_abbr = str(entry.get("state_abbr") or "").upper()
            label = str(entry.get("display_name") or entry.get("canonical_name") or slug)
            loser_dir = _manifest_actor_dir(entry)
            loser_photo = loser_dir / "image_1080.png"
            if not keeper_photo.exists() and loser_photo.exists():
                keeper_dir.mkdir(parents=True, exist_ok=True)
                shutil.copy2(loser_photo, keeper_photo)
                keeper_photo = keeper_dir / "image_1080.png"
            old_count = submission_count_from_spec(read_json(loser_dir / "spec.json"))
            shutil.rmtree(loser_dir, ignore_errors=True)
            removed_slugs.add(slug)
            results.append(ActorResult(
                label,
                slug,
                state_abbr,
                old_count,
                "-",
                f"pruned duplicate; kept {keeper_slug}",
            ))
            print(f"· pruned duplicate {slug}; kept {keeper_slug}")

    if not removed_slugs:
        return entries, results
    return [entry for entry in entries if str(entry.get("slug") or "") not in removed_slugs], results


def public_actor_entries(
    public_actors_by_state: dict[str, Any],
    state_filter: str | None,
    existing_entries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    existing_state_slugs = {
        f"{str(entry.get('state_abbr') or '').upper()}/{entry.get('slug')}"
        for entry in existing_entries
        if entry.get("slug") and entry.get("state_abbr")
    }
    existing_bucket_keys = {
        str(entry.get("actor_bucket_key") or "").strip()
        for entry in existing_entries
        if str(entry.get("actor_bucket_key") or "").strip()
    }

    out: list[dict[str, Any]] = []
    for state_abbr, actors in sorted(public_actors_by_state.items()):
        state = str(state_abbr or "").strip().upper()
        if state_filter and state != state_filter:
            continue
        if not (len(state) == 2 and state.isalpha()):
            continue
        if not isinstance(actors, list):
            continue
        for actor in actors:
            if not isinstance(actor, dict):
                continue
            display_name = str(actor.get("name") or actor.get("display_name") or "").strip()
            if not display_name:
                continue
            slug = spotlight_slug(display_name)
            name_key = actor_name_key(display_name)
            if not slug or not name_key:
                continue
            actor_bucket_key = f"{name_key}|{state}"
            state_slug = f"{state}/{slug}"
            if state_slug in existing_state_slugs or actor_bucket_key in existing_bucket_keys:
                continue
            state_lower = state.lower()
            out.append({
                "slug": slug,
                "state_abbr": state,
                "display_name": display_name,
                "canonical_name": display_name,
                "actor_bucket_key": actor_bucket_key,
                "role": actor.get("role"),
                "court_or_county": actor.get("court_or_county"),
                "photo_url": f"/court-actors/{state_lower}/{slug}/image_1080.png"
                if (PUBLIC_ACTORS_DIR / state_lower / slug / "image_1080.png").exists() else None,
                "share_url": f"/court-actors/{state_lower}/{slug}/share.html"
                if (PUBLIC_ACTORS_DIR / state_lower / slug / "share.html").exists() else None,
                "_new_public_actor": True,
            })
            existing_state_slugs.add(state_slug)
            existing_bucket_keys.add(actor_bucket_key)
    return out


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
    for filename in ("spec.json", "share.html"):
        src = generated_dir / filename
        if src.exists():
            shutil.copy2(src, dest_dir / filename)
    expected_frames = {f"{frame_id}.jpg" for frame_id in frame_ids_from_share_html(generated_dir)}
    for old_frame in dest_dir.glob("frame-*.jpg"):
        if old_frame.name not in expected_frames:
            old_frame.unlink()
    for filename in sorted(expected_frames):
        src = generated_dir / filename
        if src.exists():
            shutil.copy2(src, dest_dir / filename)
    # Never drop a committed portrait during HTML/frame regen. Refresh only when
    # the build explicitly produced a new image_1080.png in the work dir.
    dest_photo = dest_dir / "image_1080.png"
    generated_photo = generated_dir / "image_1080.png"
    if generated_photo.exists():
        shutil.copy2(generated_photo, dest_photo)


def prepare_generated_meg_intro(slug: str, state_abbr: str) -> None:
    meg_src = meg_intro_path(state_abbr)
    generated_dir = EXPORT_ROOT / slug
    meg_frame_id = meg_frame_id_from_share_html(generated_dir)
    if not meg_src.exists():
        print(f"[meg-intro] missing meg_intro_{state_abbr.lower()}.jpg - {meg_frame_id} image may be blank for slug={slug}", file=sys.stderr)
        return
    generated_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(meg_src, generated_dir / f"{meg_frame_id}.jpg")


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
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "actors": entries,
    }, indent=2) + "\n")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", help="Optional 2-letter state filter. Omit for every manifest actor.")
    parser.add_argument("--actor", action="append", help="Optional actor slug filter. Repeat to regenerate several actors.")
    parser.add_argument("--display-name", help="Canonical display name override for a single --actor rebuild.")
    parser.add_argument("--actor-bucket-key", help="Canonical actor bucket key override for a single --actor rebuild.")
    parser.add_argument("--skip-frames", action="store_true", help="Regenerate share.html/spec.json only.")
    parser.add_argument("--force", action="store_true", help="Bypass .regen-cache.json and regenerate every selected actor.")
    parser.add_argument("--changed-only", action="store_true", default=True, help="Regenerate only changed actors. Default unless --force is set.")
    args = parser.parse_args(argv)

    state_filter = args.state.strip().upper() if args.state else None
    if state_filter and not (len(state_filter) == 2 and state_filter.isalpha()):
        parser.error("--state must be a two-letter code")
    actor_filter = {str(slug).strip() for slug in (args.actor or []) if str(slug).strip()}

    env = build_env()
    state_stats_by_state = load_cache_file(env, "SWM_PDF_STATS_CACHE")
    public_actors_by_state = load_cache_file(env, "SWM_PUBLIC_ACTORS_CACHE")
    entries = manifest_entries(state_filter)
    new_entries = public_actor_entries(public_actors_by_state, state_filter, entries)
    if new_entries:
        print(f"including {len(new_entries)} new public-threshold actor(s) not yet in manifest")
        entries.extend(new_entries)
    entries, pruned_results = prune_existing_duplicate_actor_dirs(entries)
    if actor_filter:
        entries = [entry for entry in entries if str(entry.get("slug") or "") in actor_filter]
    try:
        entries = apply_actor_cli_overrides(
            entries,
            display_name=args.display_name,
            actor_bucket_key=args.actor_bucket_key,
        )
    except ValueError as exc:
        parser.error(str(exc))
    if not entries:
        print("no manifest or public-threshold actors matched")
        return 0

    version_hash = template_version()
    render_frames = not args.skip_frames
    results: list[ActorResult] = []
    failed = False
    changed_any = bool(pruned_results)
    results.extend(pruned_results)

    # Identities of every already-deployed actor, keyed by state. New
    # public-threshold name groups are deduped against the manifest by EXACT
    # slug/bucket only, so a spelling variant ('Michele Bell' vs deployed
    # 'Michelle Bell') slips through discovery, builds, alias-resolves to the
    # same canonical person, and ships a second public card — which then
    # fails verify_share_consistency ('one public card per person'). Guard
    # with the verifier's own identity normalization AFTER the build, when
    # the alias-resolved canonical name is known.
    from verify_share_consistency import _person_identity
    existing_identities: dict[str, set[str]] = {}
    for known in entries:
        if known.get("_new_public_actor"):
            continue
        known_state = str(known.get("state_abbr") or "").upper()
        known_identity = _person_identity(known)
        if known_identity:
            existing_identities.setdefault(known_state, set()).add(known_identity)

    for entry in entries:
        slug = str(entry["slug"])
        state_abbr = str(entry["state_abbr"]).upper()
        deployed_spec_path = PUBLIC_ACTORS_DIR / state_abbr.lower() / slug / "spec.json"
        deployed_spec = read_json(deployed_spec_path)
        actor = (deployed_spec or {}).get("actor") or {}
        photo_path = PUBLIC_ACTORS_DIR / state_abbr.lower() / slug / "image_1080.png"
        share_path = PUBLIC_ACTORS_DIR / state_abbr.lower() / slug / "share.html"
        manifest_asset_missing = (
            (bool(entry.get("photo_url")) and not photo_path.exists())
            or (bool(entry.get("share_url")) and not share_path.exists())
        )
        label = str(entry.get("display_name") or actor.get("display_name") or entry.get("canonical_name") or slug)
        public_actor = public_actor_for_entry(public_actors_by_state, state_abbr, label)
        old_count = submission_count_from_spec(deployed_spec)
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
                and not manifest_asset_missing
                and cached
                and cached.get("input_hash") == input_hash
                and actor_outputs_exist(slug, state_abbr, render_frames)
                and actor_photo_wired(slug, state_abbr)):
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
        role = actor.get("role") or entry.get("role") or (public_actor or {}).get("role")
        court = actor.get("court")
        county = actor.get("county") or entry.get("court_or_county") or (public_actor or {}).get("court_or_county")
        if role:
            cmd.extend(["--role", str(role)])
        if court:
            cmd.extend(["--court", str(court)])
        if county:
            cmd.extend(["--county", str(county)])
        if photo_path.exists():
            cmd.extend(["--photo", str(photo_path.relative_to(WEBSITE_ROOT))])
        if actor.get("actor_row_id") and not args.actor_bucket_key:
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

        if entry.get("_new_public_actor"):
            built_spec = read_json(EXPORT_ROOT / slug / "spec.json") or {}
            built_actor = built_spec.get("actor") or {}
            resolved_identity = _person_identity({
                "canonical_name": built_actor.get("canonical_name")
                or built_actor.get("display_name")
                or label,
            })
            if resolved_identity and resolved_identity in existing_identities.get(state_abbr, set()):
                # Same person already has a public card under another slug —
                # do NOT deploy a second one. Drop any partial output.
                shutil.rmtree(PUBLIC_ACTORS_DIR / state_abbr.lower() / slug, ignore_errors=True)
                results.append(ActorResult(label, slug, state_abbr, old_count, "-", "skipped (duplicate person)"))
                print(
                    f"· skipped {slug}: alias-resolves to '{resolved_identity}', "
                    f"already deployed in {state_abbr} under another slug"
                )
                continue
            if resolved_identity:
                # Two NEW spelling variants of the same person in one run:
                # the first claims the identity, the second hits the guard.
                existing_identities.setdefault(state_abbr, set()).add(resolved_identity)

        if not args.skip_frames:
            code, out, err = run([sys.executable, "scripts/share-pages/render_spotlight.py", slug, "--web", "--live-html"], env)
            if code != 0:
                failed = True
                results.append(ActorResult(label, slug, state_abbr, old_count, "-", "render source failed"))
                print(err or out, file=sys.stderr)
                continue

            prepare_generated_meg_intro(slug, state_abbr)

            code, out, err = run([sys.executable, "scripts/share-pages/prerender_frames.py", slug], env)
            if code != 0:
                failed = True
                results.append(ActorResult(label, slug, state_abbr, old_count, "-", "frame render failed"))
                print(err or out, file=sys.stderr)
                continue

        code, out, err = run([sys.executable, "scripts/share-pages/render_spotlight.py", slug, "--web"], env)
        if code != 0:
            failed = True
            results.append(ActorResult(label, slug, state_abbr, old_count, "-", "render failed"))
            print(err or out, file=sys.stderr)
            continue

        copy_generated_assets(slug, state_abbr)
        write_cache(slug, state_abbr, input_hash, version_hash)
        changed_any = True
        fresh_spec = read_json(EXPORT_ROOT / slug / "spec.json")
        new_count = submission_count_from_spec(fresh_spec)
        results.append(ActorResult(
            label, slug, state_abbr, old_count, new_count,
            "unchanged" if old_count == new_count else "updated",
        ))

    if changed_any:
        rewrite_manifest()
        refreshed_entries = manifest_entries(state_filter)
        _, post_pruned_results = prune_existing_duplicate_actor_dirs(refreshed_entries)
        if post_pruned_results:
            results.extend(post_pruned_results)
            rewrite_manifest()
    print("actor | state | old_submission_count | new_submission_count | status")
    print("------|-------|------------------|------------------|-------")
    for r in results:
        print(f"{r.label} | {r.state} | {r.old_count} | {r.new_count} | {r.status}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
