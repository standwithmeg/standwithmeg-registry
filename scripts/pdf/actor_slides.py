"""Resolve current public actor artwork for a PDF snapshot.

Use the public asset route, which selects the newest published R2/bundled
version. Never guess a person from a similar name or reuse a local old frame.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from actor_cover_renderer import render_pending_covers
from lib_supabase_rows import _actor_name_key

PUBLIC_ORIGIN = "https://my.standwithmeg.com"
ARCHIVE_ORIGIN = "https://standwithmeg-registry-clean.vercel.app"
MAX_ASSET_BYTES = 12 * 1024 * 1024


def _download(path: str, *, origin: str = PUBLIC_ORIGIN, headers: dict | None = None) -> tuple[bytes, str]:
    request = Request(origin + path, headers={"Cache-Control": "no-cache", **(headers or {})})
    with urlopen(request, timeout=45) as response:
        body = response.read(MAX_ASSET_BYTES + 1)
        if len(body) > MAX_ASSET_BYTES:
            raise ValueError(f"Actor asset exceeds size limit: {path}")
        return body, response.headers.get("Content-Type", "").split(";")[0]


def load_slide_manifest() -> list[dict]:
    # The portrait publisher updates the archive/bundled manifest independently
    # of R2 slide rendering. A null in the slide manifest must not hide its photo.
    sources = [(PUBLIC_ORIGIN, {}), (PUBLIC_ORIGIN, {"x-swm-raw-asset": "1"}),
               (ARCHIVE_ORIGIN, {})]
    def fetch(source):
        origin, headers = source
        body, _ = _download("/court-actors/manifest.json", origin=origin, headers=headers)
        entries = json.loads(body).get("actors")
        if not isinstance(entries, list):
            raise ValueError(f"Public actor manifest has no actors list: {origin}")
        return entries
    with ThreadPoolExecutor(max_workers=3) as pool:
        return _merge_manifests(*pool.map(fetch, sources))


def _merge_manifests(*groups: list[dict]) -> list[dict]:
    entries = {}
    for group in groups:
        for entry in group:
            key = (str(entry.get("state_abbr", "")).upper(), entry.get("slug"))
            if key not in entries:
                entries[key] = dict(entry)
            elif not entries[key].get("photo_url") and entry.get("photo_url"):
                entries[key]["photo_url"] = entry["photo_url"]
    return list(entries.values())


def _asset_path(entry: dict, state: str, filename: str) -> str:
    slug = str(entry.get("slug") or "")
    if not re.fullmatch(r"[A-Za-z]{2}", state) or not re.fullmatch(r"[a-z0-9_]+", slug):
        raise ValueError("Invalid public actor asset path")
    return f"/court-actors/{state.lower()}/{slug}/{filename}"


def _published_timestamp(entry: dict, state: str) -> float:
    return _asset_timestamp(_asset_path(entry, state, "frame-01.jpg"))


def _asset_timestamp(path: str) -> float:
    request = Request(PUBLIC_ORIGIN + path, method="HEAD", headers={"Cache-Control": "no-cache"})
    try:
        with urlopen(request, timeout=45) as response:
            value = response.headers.get("Last-Modified")
            return parsedate_to_datetime(value).timestamp() if value else 0
    except HTTPError as error:
        if error.code in (404, 410):
            return 0
        raise


def _matching_entries(actor: dict, state: str, entries: list[dict]) -> list[dict]:
    def name_key(value: str) -> str:
        return _actor_name_key(value).replace("-", " ")

    names = {name_key(value) for value in [actor["name"], *(actor.get("name_aliases") or [])] if value}
    return [entry for entry in entries
               if str(entry.get("state_abbr", "")).upper() == state.upper()
               and names.intersection({name_key(entry.get("canonical_name") or ""),
                            name_key(entry.get("display_name") or ""),
                            name_key(str(entry.get("actor_bucket_key") or "").partition("|")[0])})]


def _match_actor(actor: dict, state: str, entries: list[dict]) -> dict | None:
    paths = {str(entry.get("slug")): entry for entry in _matching_entries(actor, state, entries)}
    if len(paths) > 1:
        # The public manifest can retain two approved spellings for the same
        # normalized person. Compare publication times, never family counts
        # (which can decrease after moderation), to select the newest slide.
        dated = sorted((_published_timestamp(entry, state), slug)
                       for slug, entry in paths.items())
        if dated[-1][0] <= 0 or dated[-1][0] == dated[-2][0]:
            raise ValueError(f"Cannot establish latest public slide for {actor['name']} in {state}")
        return paths[dated[-1][1]]
    return next(iter(paths.values()), None)


def _portrait_path(entry: dict, state: str) -> str:
    value = urlsplit(str(entry["photo_url"]))
    if value.netloc and value.netloc not in {urlsplit(PUBLIC_ORIGIN).netloc, urlsplit(ARCHIVE_ORIGIN).netloc}:
        raise ValueError("Untrusted public actor portrait origin")
    expected = _asset_path(entry, state, "image_1080.png")
    if value.path != expected or value.query or value.fragment:
        raise ValueError("Public actor portrait does not match its manifest identity")
    return expected


def _approved_portrait(actor: dict, state: str, entries: list[dict], selected: dict) -> str | None:
    if selected.get("photo_url"):
        return _portrait_path(selected, state)
    # An approved name correction may use a different slug from the older deck.
    paths = {_portrait_path(entry, state) for entry in _matching_entries(actor, state, entries)
             if entry.get("photo_url")}
    if len(paths) <= 1:
        return next(iter(paths), None)
    dated = sorted((_asset_timestamp(path), path) for path in paths)
    if dated[-1][0] <= 0 or dated[-1][0] == dated[-2][0]:
        raise ValueError(f"Cannot establish current approved portrait for {actor['name']} in {state}")
    return dated[-1][1]


def _slide_spec(entry: dict, state: str) -> dict:
    try:
        body, _ = _download(_asset_path(entry, state, "spec.json"))
    except HTTPError as error:
        if error.code in (404, 410):
            return {}
        raise
    return json.loads(body)


def _slide_count_matches(spec: dict, submission_count: int | None) -> bool:
    if submission_count is None:
        return True
    actor = spec.get("actor") or {}
    # This is the order the website renderer uses for the visible cover count.
    recorded_count = next((actor[key] for key in ("public_family_count", "family_count", "actor_report_count", "submission_count", "mention_count")
                           if actor.get(key) is not None), None)
    return recorded_count == submission_count


def _slide_contains_portrait(entry: dict, state: str, portrait_path: str, portrait_body: bytes, spec: dict) -> bool:
    photo = spec.get("photo") or {}
    # A share page can be newer than its JPEGs. Only the render input proves
    # the downloaded deck contained a portrait; unknown evidence rebuilds it.
    if photo.get("exists") is not True:
        return False
    recorded_hash = photo.get("content_sha256")
    if recorded_hash:
        return recorded_hash == hashlib.sha256(portrait_body).hexdigest()
    # A deployment can assign the same timestamp to a new photo and an old JPEG.
    # Without recorded photo bytes, rebuild the cover instead of assuming a match.
    return False


def _attach_slide(actor: dict, state: str, entries: list[dict], *, state_total: int | None = None) -> dict:
    result = {key: value for key, value in actor.items() if not key.startswith("artwork_")}
    entry = _match_actor(actor, state, entries)
    portrait_path = _approved_portrait(actor, state, entries, entry) if entry else None
    portrait = _download(portrait_path) if portrait_path else None
    if portrait and portrait[1] not in ("image/png", "image/jpeg", "image/webp"):
        raise ValueError(f"Invalid actor portrait: {portrait_path}")
    spec = {}

    def rebuild():
        result["artwork_url"] = PUBLIC_ORIGIN + (_asset_path(entry, state, "share.html") if entry else f"/report/{state}")
        result["_cover_pending"] = {"portrait": portrait, "portrait_url": PUBLIC_ORIGIN + portrait_path if portrait_path else None,
                                    "spec": spec, "state_total": state_total}
        return result

    if entry is None:
        return rebuild()
    path = _asset_path(entry, state, "frame-01.jpg")
    try:
        body, mime = _download(path)
        if mime != "image/jpeg" or not body.startswith(b"\xff\xd8\xff"):
            raise ValueError(f"Invalid actor slide: {path}")
        spec = _slide_spec(entry, state)
        count_matches = _slide_count_matches(spec, actor.get("submission_count"))
        published_actor = spec.get("actor") or {}
        role_matches = not actor.get("role") or published_actor.get("role") == actor["role"]
        names = {_actor_name_key(name) for name in [actor["name"], *(actor.get("name_aliases") or [])]}
        name_matches = _actor_name_key(published_actor.get("display_name") or "") in names
        stats = spec.get("state_stats") or {}
        state_count_matches = state_total is None or stats.get("state_family_count", stats.get("total_submissions")) == state_total
        if not count_matches or not role_matches or not name_matches or not state_count_matches:
            return rebuild()
        if portrait and not _slide_contains_portrait(entry, state, portrait_path, portrait[0], spec):
            return rebuild()
        if not portrait and (spec.get("photo") or {}).get("exists"):
            return rebuild()
    except HTTPError as error:
        # Missing or retired decks still receive a complete current cover.
        # Other network failures must fail visibly instead of using stale media.
        if error.code not in (404, 410):
            raise
        return rebuild()
    result.update({
        "artwork_uri": f"data:{mime};base64," + base64.b64encode(body).decode("ascii"),
        "artwork_sha256": hashlib.sha256(body).hexdigest(),
        "artwork_url": PUBLIC_ORIGIN + path,
        "artwork_kind": "slide", "artwork_source": "published",
        "artwork_photo_sha256": hashlib.sha256(portrait[0]).hexdigest() if portrait else None,
        "artwork_photo_url": PUBLIC_ORIGIN + portrait_path if portrait_path else None,
        "artwork_submission_count": actor.get("submission_count"),
    })
    return result


def attach_actor_slides(actors: list[dict], state: str, entries: list[dict], *, state_total: int | None = None) -> list[dict]:
    with ThreadPoolExecutor(max_workers=6) as pool:
        resolved = list(pool.map(lambda actor: _attach_slide(actor, state, entries, state_total=state_total), actors))
    return render_pending_covers(resolved, state)
