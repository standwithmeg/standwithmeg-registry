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
from urllib.request import Request, urlopen

from lib_supabase_rows import _actor_name_key

PUBLIC_ORIGIN = "https://my.standwithmeg.com"
MAX_ASSET_BYTES = 12 * 1024 * 1024


def _download(path: str) -> tuple[bytes, str]:
    request = Request(PUBLIC_ORIGIN + path, headers={"Cache-Control": "no-cache"})
    with urlopen(request, timeout=45) as response:
        body = response.read(MAX_ASSET_BYTES + 1)
        if len(body) > MAX_ASSET_BYTES:
            raise ValueError(f"Actor asset exceeds size limit: {path}")
        return body, response.headers.get("Content-Type", "").split(";")[0]


def load_slide_manifest() -> list[dict]:
    body, _ = _download("/court-actors/manifest.json")
    entries = json.loads(body).get("actors")
    if not isinstance(entries, list):
        raise ValueError("Public actor manifest has no actors list")
    return entries


def _asset_path(entry: dict, state: str, filename: str) -> str:
    slug = str(entry.get("slug") or "")
    if not re.fullmatch(r"[A-Za-z]{2}", state) or not re.fullmatch(r"[a-z0-9_]+", slug):
        raise ValueError("Invalid public actor asset path")
    return f"/court-actors/{state.lower()}/{slug}/{filename}"


def _published_timestamp(entry: dict, state: str) -> float:
    path = _asset_path(entry, state, "frame-01.jpg")
    request = Request(PUBLIC_ORIGIN + path, method="HEAD", headers={"Cache-Control": "no-cache"})
    try:
        with urlopen(request, timeout=45) as response:
            value = response.headers.get("Last-Modified")
            return parsedate_to_datetime(value).timestamp() if value else 0
    except HTTPError as error:
        if error.code in (404, 410):
            return 0
        raise


def _match_actor(actor: dict, state: str, entries: list[dict]) -> dict | None:
    def name_key(value: str) -> str:
        return _actor_name_key(value).replace("-", " ")

    name = name_key(actor["name"])
    matches = [entry for entry in entries
               if str(entry.get("state_abbr", "")).upper() == state.upper()
               and name in {name_key(entry.get("canonical_name") or ""),
                            name_key(entry.get("display_name") or ""),
                            name_key(str(entry.get("actor_bucket_key") or "").partition("|")[0])}]
    paths = {str(entry.get("slug")): entry for entry in matches}
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


def _attach_slide(actor: dict, state: str, entries: list[dict]) -> dict:
    result = {key: value for key, value in actor.items() if not key.startswith("artwork_")}
    entry = _match_actor(actor, state, entries)
    if entry is None:
        return result
    path = _asset_path(entry, state, "frame-01.jpg")
    try:
        body, mime = _download(path)
        if mime != "image/jpeg" or not body.startswith(b"\xff\xd8\xff"):
            raise ValueError(f"Invalid actor slide: {path}")
        kind = "slide"
    except HTTPError as error:
        # A retired election deck or an actor without a deck can still have
        # an approved public portrait. Other network errors must fail visibly.
        if error.code not in (404, 410):
            raise
        if not entry.get("photo_url"):
            return result
        path = _asset_path(entry, state, "image_1080.png")
        body, mime = _download(path)
        if mime not in ("image/png", "image/jpeg", "image/webp"):
            raise ValueError(f"Invalid actor portrait: {path}")
        kind = "portrait"
    result.update({
        "artwork_uri": f"data:{mime};base64," + base64.b64encode(body).decode("ascii"),
        "artwork_sha256": hashlib.sha256(body).hexdigest(),
        "artwork_url": PUBLIC_ORIGIN + path,
        "artwork_kind": kind,
    })
    return result


def attach_actor_slides(actors: list[dict], state: str, entries: list[dict]) -> list[dict]:
    with ThreadPoolExecutor(max_workers=6) as pool:
        return list(pool.map(lambda actor: _attach_slide(actor, state, entries), actors))
