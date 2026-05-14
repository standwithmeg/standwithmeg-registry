#!/usr/bin/env python3
"""
Build a per-actor spec.json for the Court Actor Spotlight pack.

Two modes:
  --introspect           Dump the live schema of the 5 tables the pack uses to
                         _scripts/spotlight_columns_observed.json. Run this once
                         after Supabase changes; then update spotlight_columns.json.

  default (resolve mode) Resolve markers for one actor and write
                         "New Final Post and Capcut template/export/<slug>/spec.json" plus the folder
                         skeleton, photo-policy doc, and CapCut import checklist.

Usage examples:
  python3 _scripts/spotlight_build.py --introspect
  python3 _scripts/spotlight_build.py --actor julia_kolber \
      --display-name "Julia C. Kolber" \
      --role "Family Law Attorney · Partner, Boucher & Kolber" \
      --county Montgomery --state Ohio --state-abbr OH \
      --photo "ohio/julia_kolber/image_1080.png"

If Supabase env vars are missing, the script still writes a spec.json with
basic actor info from CLI args and leaves Supabase-derived fields as null
(unresolved markers are listed in spec.json["unresolved"]). That unblocks
dry-runs before the schema is wired up.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
COLUMNS_CONFIG = PROJECT_ROOT / "_scripts" / "spotlight_columns.json"
OBSERVED_OUT = PROJECT_ROOT / "_scripts" / "spotlight_columns_observed.json"
NEW_TEMPLATE_ROOT = PROJECT_ROOT / "New Final Post and Capcut template"
EXPORT_ROOT = NEW_TEMPLATE_ROOT / "export"
README_PATH = PROJECT_ROOT / "README.md"

PHOTO_POLICY = "covers_only"  # locked: Option A
MAX_QUOTE_WORDS = 14
REPORTS_LIMIT = 6
COMMENTS_LIMIT = 6
MAX_REASONABLE_MONTHS = 240
MAX_REASONABLE_FINANCIAL_LOSS = 10_000_000
PUBLIC_SHARE_PERMISSIONS = {"public", "anonymous", "first_name"}

_ROLE_PREFIX_RE = re.compile(
    r"^(hon\.?|honorable|judge|justice|magistrate|commissioner|referee|attorney|atty\.?|gal|guardian ad litem|minor'?s counsel|minor counsel|dr\.?|doctor)\s+",
    re.IGNORECASE,
)
_SUFFIX_RE = re.compile(r"\s+(jr\.?|sr\.?|ii|iii|iv|esq\.?|esquire)$", re.IGNORECASE)
_GIVEN_NAME_ALIASES = {
    "andy": "andrew",
    "drew": "andrew",
    "keven": "kevin",
}


# ---------------------------------------------------------------------------
# env loader (no python-dotenv dependency)
# ---------------------------------------------------------------------------
def load_env(env_path: Path) -> None:
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


load_env(PROJECT_ROOT / ".env")
load_env(PROJECT_ROOT / ".env.local")  # Next.js convention — share keys with the web app

# Accept NEXT_PUBLIC_SUPABASE_URL as a fallback (that's where the Next.js app stores it).
SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
DEBUG = os.environ.get("SPOTLIGHT_DEBUG", "").lower() == "true"


# ---------------------------------------------------------------------------
# Supabase REST helpers
# ---------------------------------------------------------------------------
@dataclass
class SupabaseError(Exception):
    status: int
    body: str


def supabase_available() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def _request(path: str, method: str = "GET") -> Any:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if DEBUG:
        print(f"[supabase] {method} {url}", file=sys.stderr)
    req = urllib.request.Request(url, method=method)
    req.add_header("apikey", SUPABASE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_KEY}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise SupabaseError(status=e.code, body=body) from e


def select(table: str, columns: list[str], filters: list[str] | None = None, limit: int | None = None, order: str | None = None) -> list[dict]:
    query: list[tuple[str, str]] = [("select", ",".join(columns))]
    for f in filters or []:
        # filters are pre-encoded PostgREST clauses like "col=eq.value"
        key, _, val = f.partition("=")
        query.append((key, val))
    if limit:
        query.append(("limit", str(limit)))
    if order:
        query.append(("order", order))
    # quote_via=urllib.parse.quote so spaces in filter values are encoded as
    # %20 (the SQL-correct form for PostgREST ILIKE). The default quote_plus
    # would turn 'Doug Arnold' into 'Doug+Arnold' and PostgREST treats + as
    # a literal '+' inside ILIKE, so name=ilike.*Doug+Arnold* matches zero
    # rows. That bug silently zeroed family_reports on every spec.json.
    qs = urllib.parse.urlencode(query, safe=".,*:", quote_via=urllib.parse.quote)
    return _request(f"{table}?{qs}")


def list_columns(table: str) -> list[dict]:
    """Use PostgREST OPTIONS-like trick: select all with limit 0, inspect first row, fallback to information_schema endpoint if exposed."""
    # Simpler: select * with limit 1 and read keys
    rows = _request(f"{table}?select=*&limit=1")
    if rows:
        return [{"column_name": k, "sample": rows[0][k]} for k in rows[0].keys()]
    return []


# ---------------------------------------------------------------------------
# introspect mode
# ---------------------------------------------------------------------------
def introspect() -> None:
    if not supabase_available():
        die("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first (see .env.example).")
    config = load_columns_config()
    observed: dict[str, Any] = {}
    for key, block in config.items():
        if key.startswith("_") or not isinstance(block, dict):
            continue
        for table_key in ("table", "fallback_table"):
            table = block.get(table_key)
            if not table or table in observed:
                continue
            try:
                cols = list_columns(table)
                observed[table] = {"columns": [c["column_name"] for c in cols]}
                print(f"[ok]   {table}: {len(cols)} columns", file=sys.stderr)
            except SupabaseError as e:
                observed[table] = {"error": f"{e.status}: {e.body[:200]}"}
                print(f"[fail] {table}: {e.status}", file=sys.stderr)
    OBSERVED_OUT.write_text(json.dumps(observed, indent=2))
    print(f"\nWrote {OBSERVED_OUT.relative_to(PROJECT_ROOT)}")
    print("Open it, compare against _scripts/spotlight_columns.json, and adjust mappings.")


# ---------------------------------------------------------------------------
# config loader
# ---------------------------------------------------------------------------
def load_columns_config() -> dict:
    if not COLUMNS_CONFIG.exists():
        die(f"Missing {COLUMNS_CONFIG}. Initialize it from the project repo.")
    return json.loads(COLUMNS_CONFIG.read_text())


def first_present(candidates: list[str] | str, available: set[str]) -> str | None:
    if isinstance(candidates, str):
        candidates = [candidates]
    for c in candidates:
        if c in available:
            return c
    return None


def _is_public_shareable_submission(submission: dict | None) -> bool:
    if not submission:
        return False
    if submission.get("approved") is not True:
        return False
    perm = str(submission.get("permission_to_share") or "").strip()
    return perm in PUBLIC_SHARE_PERMISSIONS


def _is_countable_submission(submission: dict | None) -> bool:
    if not submission:
        return False
    perm = str(submission.get("permission_to_share") or "").strip()
    if perm == "data_only":
        return True
    if submission.get("approved") is not True:
        return False
    return perm in PUBLIC_SHARE_PERMISSIONS


def _actor_name_key(name: Any) -> str:
    text = unicodedata.normalize("NFKD", str(name or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[.,'\"`´‘’]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = _ROLE_PREFIX_RE.sub("", text)
    text = _SUFFIX_RE.sub("", text)
    text = re.sub(r"\s+[a-z]\s+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    tokens = text.split()
    if len(tokens) >= 2:
        tokens[0] = _GIVEN_NAME_ALIASES.get(tokens[0], tokens[0])
    return " ".join(
        re.sub(r"([a-z])\1+", r"\1", token) if len(token) >= 5 else token
        for token in tokens
    )


def _actor_loose_name_key(name: Any) -> str:
    return _actor_name_key(name)


def _actor_bucket_key_with_location(name: str, _role: str, location_key: str | None) -> str:
    return f"{_actor_loose_name_key(name)}|{location_key or ''}"


def _joined_submission(row: dict) -> dict:
    joined = row.get("survey_submissions") or {}
    if isinstance(joined, list):
        joined = joined[0] if joined else {}
    return joined if isinstance(joined, dict) else {}


def _actor_location(row: dict) -> str:
    direct = str(row.get("location_key") or "").strip().upper()
    if direct:
        return direct
    state = str(row.get("state_code") or "").strip().upper()
    if state:
        return state
    sub = _joined_submission(row)
    state = str(sub.get("state_of_occurrence") or "").strip().upper()
    if state:
        return state
    return str(sub.get("outside_us_country") or "").strip().upper()


def _load_row_review_map() -> dict[str, str]:
    try:
        rows = select("court_actor_row_review", ["row_id", "decision"])
    except SupabaseError as e:
        if e.status in (404, 406, 42703) or "court_actor_row_review" in e.body or "42P01" in e.body:
            return {}
        raise
    out: dict[str, str] = {}
    for row in rows:
        row_id = row.get("row_id")
        decision = row.get("decision")
        if row_id and decision:
            out[str(row_id)] = str(decision)
    return out


def _load_alias_resolver() -> dict[str, dict[str, str | None]]:
    try:
        rows = select(
            "court_actor_alias_decisions",
            ["location_key", "canonical_name", "canonical_role", "name_keys"],
            filters=["decision=eq.same_actor"],
        )
    except SupabaseError as e:
        if e.status in (404, 406, 42703) or "court_actor_alias_decisions" in e.body or "42P01" in e.body:
            return {}
        raise

    resolver: dict[str, dict[str, str | None]] = {}
    for row in rows:
        canonical_name = row.get("canonical_name")
        if not canonical_name:
            continue
        location_key = str(row.get("location_key") or "")
        for name_key in row.get("name_keys") or []:
            if not name_key:
                continue
            resolver[f"{name_key}|{location_key}"] = {
                "canonical_name": canonical_name,
                "canonical_role": row.get("canonical_role"),
            }
        canonical_key = f"{_actor_loose_name_key(canonical_name)}|{location_key}"
        resolver.setdefault(
            canonical_key,
            {
                "canonical_name": canonical_name,
                "canonical_role": row.get("canonical_role"),
            },
        )
    return resolver


def _family_key_from_row(row: dict, review_map: dict[str, str]) -> str | None:
    decision = review_map.get(str(row.get("id") or ""), None)
    if decision in {"duplicate", "merge_comments"}:
        return None
    if decision == "count_separately":
        return f"row:{row.get('id')}"
    submission = _joined_submission(row)
    email = str(submission.get("email") or "").strip().lower()
    location = _actor_location(row)
    return f"{email}|{location}" if email else f"submission:{row.get('submission_id')}"


# ---------------------------------------------------------------------------
# resolution helpers
# ---------------------------------------------------------------------------
@dataclass
class Resolved:
    actor: dict = field(default_factory=dict)
    state_stats: dict = field(default_factory=dict)
    movement_total: int | None = None
    family_count: int | None = None
    public_family_count: int | None = None
    public_family_count_source: str | None = None
    family_reports: list[dict] = field(default_factory=list)
    public_comments: list[dict] = field(default_factory=list)
    report_count: int | None = None
    unresolved: list[str] = field(default_factory=list)


def truncate_words(text: str, max_words: int) -> str:
    if not text:
        return ""
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]) + "…"


def clean_public_text(text: str, max_words: int) -> str:
    """Conservative sanitizer for draft share graphics.

    Anything with obvious PII, case identifiers, addresses, or violent wording
    is dropped so the renderer uses a placeholder instead of publishing it.
    """
    if not text:
        return ""
    s = " ".join(str(text).split())
    risky_patterns = [
        r"\b[\w.+-]+@[\w.-]+\.\w+\b",
        r"\b(?:case|docket|cause)\s*(?:no\.?|number|#)?\s*[:#]?\s*[A-Z0-9-]{5,}\b",
        r"\b\d{1,6}\s+[A-Z][A-Za-z0-9.'-]+\s+(?:Street|St\.|Road|Rd\.|Avenue|Ave\.|Lane|Ln\.|Drive|Dr\.|Court|Ct\.)\b",
        r"\b(?:kill|murder|shoot|hang|execute|bomb)\b",
    ]
    if any(re.search(pattern, s, flags=re.IGNORECASE) for pattern in risky_patterns):
        return ""
    s = re.sub(r"\b[A-Z0-9]{2,}-\d{2,}[A-Z0-9-]*\b", "[redacted]", s)
    s = re.sub(r"\b\d{5,}\b", "[redacted]", s)
    return truncate_words(s, max_words)


_TITLE_RE = re.compile(
    r"^(magistrate(\s+judge)?|chief\s+judge|judge|honorable|hon\.?|mag\.?|attorney|atty\.?|dr\.?)\s+",
    re.IGNORECASE,
)


def strip_title(full_name: str) -> tuple[str, str]:
    """Return (title, remaining_name). Title is empty if no match.

    Examples:
        'Magistrate Angela Blevins' -> ('Magistrate', 'Angela Blevins')
        'Judge Kristen K. Johnson'  -> ('Judge', 'Kristen K. Johnson')
        'Julia C. Kolber'           -> ('', 'Julia C. Kolber')
    """
    s = (full_name or "").strip()
    if not s:
        return "", ""
    m = _TITLE_RE.match(s)
    if not m:
        return "", s
    title = m.group(0).strip()
    # Normalize title casing — preserve original except for canonical title form
    return title, s[m.end():].strip()


# Surname particles that should stay attached to the last name when present.
# Example: 'Raymond De Jesus' → last='De Jesus', not last='Jesus'.
# Includes the bare 'o' for cases like 'Keven O Grady' (without apostrophe).
_SURNAME_PARTICLES = {
    "de", "del", "della", "di", "du", "la", "le", "van", "von", "der",
    "mc", "mac", "o", "o'", "st.", "st", "el", "al", "fitz",
}

# Generational suffixes that should attach to the last name, not become it.
# 'William F. Ebert III' should give last='Ebert III', not last='III'.
_GENERATIONAL_SUFFIXES = {"jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"}


def _split_with_particles(tokens: list[str]) -> tuple[str, str]:
    """Split a token list into (first, last) honoring surname particles."""
    if not tokens:
        return "", ""
    if len(tokens) == 1:
        return "", tokens[0]
    if len(tokens) >= 3 and tokens[-2].lower().rstrip(".") in _SURNAME_PARTICLES:
        return " ".join(tokens[:-2]), " ".join(tokens[-2:])
    return " ".join(tokens[:-1]), tokens[-1]


def split_name(full_name: str) -> tuple[str, str, str]:
    """Returns (title, first, last). Handles titles, particles, and generational suffixes.

    Examples:
        'Magistrate Angela Blevins'  -> ('Magistrate', 'Angela', 'Blevins')
        'Magistrate Blevins'         -> ('Magistrate', 'Magistrate', 'Blevins')
        'Julia C. Kolber'            -> ('', 'Julia C.', 'Kolber')
        'Raymond De Jesus'           -> ('', 'Raymond', 'De Jesus')
        'Keven O Grady'              -> ('', 'Keven', 'O Grady')
        'William F. Ebert III'       -> ('', 'William F.', 'Ebert III')
        'Bob Smith Jr.'              -> ('', 'Bob', 'Smith Jr.')
        'Madonna'                    -> ('', '', 'Madonna')
    """
    title, remaining = strip_title(full_name)
    tokens_after_title = remaining.split() if remaining else []

    # Strip generational suffix (III, IV, Jr., Sr., II, V) — it gets re-attached
    # to the last name after splitting. Prevents 'Ebert III' becoming last='III'.
    suffix = ""
    if tokens_after_title and tokens_after_title[-1].lower().rstrip(".") in _GENERATIONAL_SUFFIXES:
        suffix = tokens_after_title[-1]
        tokens_after_title = tokens_after_title[:-1]

    def _apply_suffix(last: str) -> str:
        return f"{last} {suffix}".strip() if suffix else last

    # Two+ tokens after title strip → use them as first/last (real first name present)
    if len(tokens_after_title) >= 2:
        first, last = _split_with_particles(tokens_after_title)
        return title, first, _apply_suffix(last)

    # Only 0–1 tokens after strip → use the full original name so the display reads
    # 'MAGISTRATE / BLEVINS' instead of just 'BLEVINS' with an orphan title.
    full_tokens = (full_name or "").strip().split()
    if full_tokens and full_tokens[-1].lower().rstrip(".") in _GENERATIONAL_SUFFIXES:
        full_tokens = full_tokens[:-1]
    first, last = _split_with_particles(full_tokens)
    return title, first, _apply_suffix(last)


def pick_most_complete_name(rows: list[dict], name_col: str) -> str:
    """When multiple court_actors rows belong to the same actor (different
    family spellings/title prefixes), return the name with the most tokens
    AFTER title-stripping. 'Magistrate Angela Blevins' beats 'Magistrate Blevins'
    beats 'Blevins' beats ''.
    """
    best = ""
    best_token_count = -1
    for r in rows:
        name = (r.get(name_col) or "").strip()
        if not name:
            continue
        _, remaining = strip_title(name)
        token_count = len(remaining.split())
        # Tie-break on raw name length so we prefer 'Angela Blevins' over 'Blevins'
        if token_count > best_token_count or (
            token_count == best_token_count and len(name) > len(best)
        ):
            best = name
            best_token_count = token_count
    return best


def resolve_actor(
    name_search: str,
    state_abbr: str,
    config: dict,
    actor_row_id: str | None = None,
    actor_bucket_key: str | None = None,
) -> tuple[dict, str | None]:
    """Find court_actors rows for this person+state.

    Public notifications carry court_actor_row_id and actor_bucket_key, so
    anchor on those exact public-notification references first. Full-name match
    is only a fallback. This replaces the old last-name-only lookup.
    """
    block = config["court_actors"]
    table = block["table"]
    if not (actor_row_id or name_search):
        return {}, "court_actors: empty name search"

    head: dict | None = None
    rows: list[dict] = []
    if actor_row_id:
        try:
            exact_rows = select(table, ["*"], filters=[f"{block['id_column']}=eq.{actor_row_id}"], limit=1)
        except SupabaseError as e:
            return {}, f"court_actors: exact row query failed {e.status}: {e.body[:160]}"
        if not exact_rows:
            return {}, f"court_actors: no exact row for id='{actor_row_id}'"
        head = exact_rows[0]
        name_search = head.get(block["name_column"]) or name_search
        state_abbr = head.get(block["state_code_column"]) or state_abbr

    if actor_bucket_key:
        try:
            notification_rows = select(
                "court_actor_public_notifications",
                ["court_actor_row_id"],
                filters=[f"actor_bucket_key=eq.{actor_bucket_key}", "status=eq.sent"],
                limit=1000,
                order="sent_at.desc",
            )
            bucket_ids = [r.get("court_actor_row_id") for r in notification_rows if r.get("court_actor_row_id")]
            if actor_row_id:
                bucket_ids.append(actor_row_id)
            bucket_ids = list(dict.fromkeys(str(i) for i in bucket_ids if i))
            if bucket_ids:
                rows = select(
                    table,
                    ["*"],
                    filters=[f"{block['id_column']}=in.({','.join(bucket_ids)})"],
                    order=f"{block['created_column']}.desc",
                )
        except SupabaseError as e:
            if DEBUG:
                print(f"[supabase] actor bucket query failed: {e.status}", file=sys.stderr)

    search_token = (name_search or "").strip()
    if not search_token:
        return {}, "court_actors: empty canonical name"

    filters = [f"{block['name_column']}=ilike.*{search_token}*"]
    if state_abbr:
        filters.append(f"{block['state_code_column']}=eq.{state_abbr}")

    try:
        name_rows = select(table, ["*"], filters=filters, order=f"{block['created_column']}.desc")
    except SupabaseError as e:
        return {}, f"court_actors: query failed {e.status}: {e.body[:160]}"
    if name_rows:
        seen_ids = {r.get(block["id_column"]) for r in rows}
        rows.extend(r for r in name_rows if r.get(block["id_column"]) not in seen_ids)

    if not rows and head:
        rows = [head]
    if not rows:
        return {}, f"court_actors: no rows match name~'{search_token}' state='{state_abbr}'"

    if head:
        rows = [head] + [r for r in rows if r.get(block["id_column"]) != actor_row_id]
    else:
        head = rows[0]
    # Across all matched rows, pick the most-complete name version.
    # 'Magistrate Angela Blevins' wins over 'Magistrate Blevins' wins over 'Blevins'.
    name = pick_most_complete_name(rows, block["name_column"]) or head.get(block["name_column"]) or name_search
    title, first, last = split_name(name)
    submission_ids = [r[block["submission_link_column"]] for r in rows if r.get(block["submission_link_column"])]
    actor_row_ids = [r[block["id_column"]] for r in rows if r.get(block["id_column"])]
    raw_notes = [r[block["notes_column"]] for r in rows if r.get(block["notes_column"])]

    return {
        "name": name,
        "title": title,
        "first_name": first,
        "last_name": last,
        "role": head.get(block["role_column"]),
        "court_or_county": head.get(block["court_or_county_column"]),
        "state_abbr": head.get(block["state_code_column"]),
        "_actor_row_ids": actor_row_ids,
        "_submission_ids": submission_ids,
        "_raw_notes": raw_notes,
        "_mention_count": len(rows),
    }, None


# ---------------------------------------------------------------------------
# Live public-API mirror — read the count straight from /api/survey/court-actors
# so the share page can never drift from the public card. The Python alias
# resolver gets close, but the TypeScript route is authoritative; we ask it
# directly and cache the per-state response within a single build run.
# ---------------------------------------------------------------------------
PUBLIC_API_BASE = os.environ.get("SWM_PUBLIC_API_BASE", "https://my.standwithmeg.com").rstrip("/")

_public_api_cache: dict[str, list[dict]] = {}


def _fetch_public_actors_for_state(state_abbr: str) -> list[dict]:
    state_abbr = (state_abbr or "").upper()
    if not state_abbr:
        return []
    if state_abbr in _public_api_cache:
        return _public_api_cache[state_abbr]
    url = f"{PUBLIC_API_BASE}/api/survey/court-actors?state={urllib.parse.quote(state_abbr)}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError):
        _public_api_cache[state_abbr] = []
        return []
    actors = data.get("actors") if isinstance(data, dict) else None
    actors = actors if isinstance(actors, list) else []
    _public_api_cache[state_abbr] = actors
    return actors


def resolve_public_family_count_via_api(
    display_name: str,
    state_abbr: str,
    actor_bucket_key: str | None = None,
    slug: str | None = None,
) -> tuple[int | None, str | None]:
    """Return the exact count the public actor card shows on the live site.

    The Next.js API is the source of truth — it applies the canonical
    alias decisions, row-review duplicates, and count_separately overrides
    that the local resolver only approximates. Calling it directly removes
    the drift that produced Dianna Russell's 3-vs-4 mismatch.

    Match precedence:
      1. slug appears in the API entry's photo_url / share_url — survives
         alias renames where the canonical display name diverged from
         the manifest spelling (e.g. Anneka → Anika, Catadeulla →
         Cataudella).
      2. loose-name-key equality with display_name.
      3. loose-name-key equality with the manifest bucket-key prefix.
    """
    actors = _fetch_public_actors_for_state(state_abbr)
    if not actors:
        return None, f"public_family_count_api: no actors returned for state={state_abbr!r}"

    if slug:
        slug_token = f"/{slug}/"
        for actor in actors:
            for url_field in ("photo_url", "share_url"):
                if slug_token in (actor.get(url_field) or ""):
                    return int(actor.get("count") or 0), None

    name_key = _actor_loose_name_key(display_name or "")
    target_bucket = (actor_bucket_key or "").split("|", 1)[0].strip().lower() if actor_bucket_key else ""
    for actor in actors:
        api_name = actor.get("name") or actor.get("display_name") or ""
        api_key = _actor_loose_name_key(api_name)
        if name_key and api_key == name_key:
            return int(actor.get("count") or 0), None
        if target_bucket and api_key == target_bucket:
            return int(actor.get("count") or 0), None
    return None, (
        f"public_family_count_api: no match for display_name={display_name!r} "
        f"bucket={actor_bucket_key!r} slug={slug!r} in {state_abbr} ({len(actors)} actors)"
    )


def resolve_public_actor_family_count(
    canonical_name: str,
    state_abbr: str,
    config: dict,
    actor_bucket_key: str | None = None,
) -> tuple[int | None, str | None]:
    """Count distinct families for the public actor bucket using the same
    source/form_direct + row-review + alias decision rules as the public card.

    This mirrors the Next.js /api/survey/court-actors route closely enough that
    the share-page family count stays in sync with the public card count.
    """
    block = config["court_actors"]
    state = (state_abbr or "").strip().upper()
    if not state:
        return None, "family_count: no state_abbr provided"

    try:
        rows = select(
            block["table"],
            [
                "*",
                "survey_submissions(email,state_of_occurrence,outside_us_country,permission_to_share,approved)",
            ],
            filters=[f"{block['state_code_column']}=eq.{state}", "source=eq.form_direct"],
            limit=5000,
            order=f"{block['created_column']}.asc",
        )
    except SupabaseError as e:
        return None, f"family_count: query failed {e.status}: {e.body[:160]}"

    review_map = _load_row_review_map()
    alias_resolver = _load_alias_resolver()
    buckets: dict[str, set[str]] = {}

    for row in rows:
        if not row.get("role") or not row.get("name"):
            continue
        submission = _joined_submission(row)
        if not _is_countable_submission(submission):
            continue
        location = _actor_location(row)
        if not location or location != state:
            continue
        family_key = _family_key_from_row(row, review_map)
        if family_key is None:
            continue
        name_key = _actor_loose_name_key(str(row.get("name") or ""))
        alias_hit = alias_resolver.get(f"{name_key}|{location}") if name_key else None
        effective_name = alias_hit.get("canonical_name") if alias_hit else row.get("name")
        bucket_key = _actor_bucket_key_with_location(
            str(effective_name or canonical_name or ""),
            str(row.get("role") or ""),
            location,
        )
        if not bucket_key:
            continue
        buckets.setdefault(bucket_key, set()).add(family_key)

    target_key = actor_bucket_key or _actor_bucket_key_with_location(canonical_name, "", state)
    family_count = len(buckets.get(target_key, set()))
    if family_count:
        return family_count, None

    # Fallback 1 — alias chain. The canonical_name passed in (often the
    # manifest's frozen display_name) may belong to an older alias-decision
    # spelling. Look it up through the resolver: if it maps to a different
    # active canonical, retry the bucket lookup against that canonical.
    canonical_name_key = _actor_loose_name_key(canonical_name)
    alias_hit = alias_resolver.get(f"{canonical_name_key}|{state}") if canonical_name_key else None
    if alias_hit and alias_hit.get("canonical_name"):
        resolved_key = _actor_bucket_key_with_location(alias_hit["canonical_name"], "", state)
        if resolved_key != target_key:
            family_count = len(buckets.get(resolved_key, set()))
            if family_count:
                return family_count, None

    # Fallback 2 — same-state bucket with overlapping surname token. This
    # catches the case where the active alias decision uses a respelled
    # surname that the resolver doesn't know about. Conservative: requires
    # the surname token to match, and only fires when exactly one bucket
    # qualifies (otherwise we could attribute counts to the wrong person).
    canonical_tokens = set(canonical_name_key.split()) - {""}
    if canonical_tokens:
        surname = max(canonical_tokens, key=len)
        candidates = []
        for key, families in buckets.items():
            bucket_tokens = set(key.split("|", 1)[0].split())
            if surname in bucket_tokens and (canonical_tokens & bucket_tokens) == canonical_tokens:
                candidates.append(len(families))
            elif surname in bucket_tokens and len(canonical_tokens & bucket_tokens) >= max(1, len(canonical_tokens) - 1):
                candidates.append(len(families))
        if len(candidates) == 1 and candidates[0] > 0:
            return candidates[0], None

    return 0, None


def _median_number(rows: list[dict], column: str, max_value: float) -> float | None:
    vals: list[float] = []
    for r in rows:
        raw = r.get(column)
        if raw in (None, ""):
            continue
        try:
            val = float(raw)
        except (TypeError, ValueError):
            continue
        if 0 < val <= max_value:
            vals.append(val)
    return round(statistics.median(vals), 1) if vals else None


# Per-field sanity caps and burden rules ported from
# standwithmeg-court-actor-fresh/scripts/pdf/generate_state_pdf.py
# so the spotlight reads identical numbers to the public state report.
_EXPENSE_KEYS = [
    "attorney_fees", "gal_fees", "therapy_eval_fees", "reunification_fees",
    "other_court_actors_fees", "lost_wages", "asset_liquidation_loss",
]
_FIN_MAX = {
    "attorney_fees":          5_000_000,
    "gal_fees":                 500_000,
    "therapy_eval_fees":        500_000,
    "reunification_fees":       500_000,
    "other_court_actors_fees":  500_000,
    "lost_wages":             5_000_000,
    "asset_liquidation_loss":10_000_000,
}
_BURDEN_MIN_NONZERO_CATS = 3
_BURDEN_MIN_TOTAL = 1_000


def _to_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _median_family_burden(rows: list[dict]) -> tuple[float | None, int]:
    """Match `median_family_burden()` in generate_state_pdf.py — median of per-family
    expense sums, only for families with ≥3 non-zero categories AND total ≥ $1,000."""
    totals: list[float] = []
    for r in rows:
        t = 0.0
        nonzero = 0
        any_field = False
        for k in _EXPENSE_KEYS:
            v = _to_float(r.get(k))
            cap = _FIN_MAX.get(k)
            if v is None or v < 0:
                continue
            if cap is not None and v > cap:
                continue
            t += v
            any_field = True
            if v > 0:
                nonzero += 1
        if any_field and nonzero >= _BURDEN_MIN_NONZERO_CATS and t >= _BURDEN_MIN_TOTAL:
            totals.append(t)
    if not totals:
        return None, 0
    return round(statistics.median(totals)), len(totals)


def resolve_clean_state_medians(state: str, state_abbr: str, config: dict) -> tuple[dict, list[str]]:
    """Compute medians + counts that match the public state PDF report.

    The column `survey_submissions.state_of_occurrence` stores the state ABBR
    (e.g. 'TN'), not the full name — so we filter by state_abbr.
    Public counts use ALL submissions (not just approved-for-publication), matching
    `movement_stats_by_state.total_submissions` (dashboard headline number).
    """
    block = config["survey_submissions"]
    abbr = (state_abbr or "").upper()
    if not abbr:
        return {}, ["state_medians: no state_abbr provided"]
    try:
        rows = select(
            block["table"],
            [
                "id", "state_of_occurrence", "number_of_kids", "is_pro_se",
                "legal_rep_history", "months_lost_parenting_time",
                "total_financial_loss", *_EXPENSE_KEYS,
            ],
            filters=[f"{block['state_column']}=eq.{abbr}"],
            limit=5000,
            order=f"{block['created_column']}.desc",
        )
    except SupabaseError as e:
        return {}, [f"state_medians: query failed {e.status}: {e.body[:160]}"]

    n = len(rows)
    median_months = _median_number(rows, "months_lost_parenting_time", MAX_REASONABLE_MONTHS)
    median_burden, burden_n = _median_family_burden(rows)

    # Pro-se: ONLY count rows where the dedicated is_pro_se boolean is true.
    # Earlier version also matched substrings in legal_rep_history, which counted
    # families twice and inflated the percentage. Match the PDF generator's count
    # (which uses just the pro_se column, not the legal_rep column).
    pro_se = sum(1 for r in rows if r.get("is_pro_se") is True)
    pro_se_pct = round(pro_se / n * 100, 1) if n else None

    children_impacted = sum(int(_to_float(r.get("number_of_kids")) or 0) for r in rows)

    unresolved: list[str] = []
    if median_months is None:
        unresolved.append(f"state_stats.median_months_lost: no sane values between 1 and {MAX_REASONABLE_MONTHS}")
    if median_burden is None:
        unresolved.append(
            f"state_stats.median_financial_loss: no families met "
            f"{_BURDEN_MIN_NONZERO_CATS}+ non-zero categories with total ≥ ${_BURDEN_MIN_TOTAL:,}"
        )

    return {
        "state_family_count": n,
        "median_months_lost": median_months,
        "median_financial_loss": median_burden,
        "median_burden_sample_size": burden_n,
        "pro_se_count": pro_se,
        "pro_se_pct": pro_se_pct,
        "children_impacted": children_impacted,
        "clean_sample_size": n,
    }, unresolved


# Path to the next-repo PDF helper. Configurable via env so CI runners can
# point at a checkout in a different location, but defaults to the local
# sibling clone that founders use day-to-day.
PDF_STATS_HELPER = Path(
    os.environ.get(
        "SWM_PDF_STATS_HELPER",
        "/Users/meghannmiller/Code/standwithmeg-court-actor-fresh/scripts/pdf/state_stats_for_share.py",
    )
)


# When regen_all_deployed_actors prebuilds a cache (one helper run for all
# states) it sets this env var so each per-actor build can read its stats
# instantly. The cache file is a dict[state_abbr]->stats_dict written by
# state_stats_for_share.py --all.
PDF_STATS_CACHE_FILE = Path(os.environ.get("SWM_PDF_STATS_CACHE", ""))


def _pdf_headline_stats(state_abbr: str) -> tuple[dict | None, str | None]:
    """Return the same headline stats the state PDF emits. Reads from a
    prebuilt cache when present (fast path used by bulk regens); otherwise
    invokes scripts/pdf/state_stats_for_share.py for the requested state.

    The share Frame 5 medians MUST come from here so the slide and the
    PDF never drift.
    """
    state_abbr = (state_abbr or "").upper()
    if not state_abbr:
        return None, "pdf_stats: no state_abbr provided"

    if PDF_STATS_CACHE_FILE and PDF_STATS_CACHE_FILE.exists():
        try:
            cache = json.loads(PDF_STATS_CACHE_FILE.read_text())
        except (OSError, json.JSONDecodeError) as e:
            return None, f"pdf_stats: cache unreadable at {PDF_STATS_CACHE_FILE}: {e}"
        stats = cache.get(state_abbr)
        if stats:
            return stats, None
        return None, f"pdf_stats: state {state_abbr} missing from cache {PDF_STATS_CACHE_FILE}"

    if not PDF_STATS_HELPER.exists():
        return None, (
            f"pdf_stats: helper missing at {PDF_STATS_HELPER} — share slides "
            "will fall back to local Supabase queries and may drift from the PDF"
        )
    try:
        proc = subprocess.run(
            [sys.executable, str(PDF_STATS_HELPER), state_abbr],
            capture_output=True, text=True, timeout=300,
        )
    except (subprocess.SubprocessError, OSError) as e:
        return None, f"pdf_stats: helper invocation failed: {e}"
    if proc.returncode != 0:
        snippet = (proc.stderr or proc.stdout).strip().splitlines()[-1:] or [""]
        return None, f"pdf_stats: helper exit {proc.returncode}: {snippet[0][:160]}"
    try:
        return json.loads(proc.stdout), None
    except json.JSONDecodeError as e:
        return None, f"pdf_stats: helper output not JSON: {e}"


def resolve_state_stats(state: str, state_abbr: str, config: dict) -> tuple[dict, str | None]:
    """Pull state stats matching the public dashboard + state PDF report.

    Headline medians (Median Family Burden, % Pro Se, Median Months Lost)
    come from the same `scripts/pdf/state_stats_for_share.py` helper that
    the published state PDFs use. The dashboard count
    (`movement_stats_by_state.total_submissions`) is layered on top so
    Frame 1's statewide total matches what families see on the dashboard.
    """
    block = config["state_stats"]
    candidates = [v for v in (state, state_abbr) if v]
    # Prefer movement_stats_by_state — matches what the public dashboard shows.
    tables = [t for t in (block.get("table"), block.get("fallback_table")) if t]

    aggregate_row: dict | None = None
    matched_table: str | None = None
    matched_value: str | None = None
    for table in tables:
        if aggregate_row:
            break
        for val in candidates:
            try:
                rows = select(table, ["*"], filters=[f"{block['state_match_column']}=eq.{val}"], limit=1)
            except SupabaseError as e:
                if DEBUG:
                    print(f"[supabase] {table} state match failed: {e.status}", file=sys.stderr)
                continue
            if rows:
                aggregate_row = rows[0]
                matched_table = table
                matched_value = val
                break

    unresolved: list[str] = []
    pdf_stats, pdf_err = _pdf_headline_stats(state_abbr or "")
    if pdf_err:
        unresolved.append(pdf_err)

    state_family_count = None
    avg_financial_loss = None
    avg_months_lost = None
    if aggregate_row:
        state_family_count = aggregate_row.get(block["total_submissions_column"])
        avg_financial_loss = aggregate_row.get(block["avg_financial_loss_column"])
        avg_months_lost = aggregate_row.get(block["avg_months_lost_column"])
        try:
            if avg_financial_loss is not None and float(avg_financial_loss) > MAX_REASONABLE_FINANCIAL_LOSS:
                avg_financial_loss = None
        except (TypeError, ValueError):
            avg_financial_loss = None
        try:
            if avg_months_lost is not None and not (0 < float(avg_months_lost) <= MAX_REASONABLE_MONTHS):
                avg_months_lost = None
        except (TypeError, ValueError):
            avg_months_lost = None

    # Prefer the dashboard family count when available — keeps Frame 1 in
    # lock-step with the headline number families see on the dashboard.
    # Fall back to the PDF count (post-dedup) and only then to whatever
    # local Supabase query salvages.
    final_family_count = (
        state_family_count
        if state_family_count is not None
        else (pdf_stats or {}).get("state_family_count")
    )

    stats: dict[str, Any] = {
        "families_approved": (aggregate_row or {}).get(block["approved_count_column"]),
        "total_submissions": state_family_count,
        "avg_financial_loss": avg_financial_loss,
        "avg_months_lost": avg_months_lost,
        "_source_table": matched_table,
        "_match_value": matched_value,
    }

    if pdf_stats:
        # Headline numbers come straight from the PDF helper. No locally
        # recomputed medians — the share slide must match the PDF exactly.
        stats.update({
            "state_family_count": final_family_count,
            "median_financial_loss": pdf_stats.get("median_financial_loss"),
            "median_burden_sample_size": pdf_stats.get("median_burden_sample_size"),
            "median_months_lost": pdf_stats.get("median_months_lost"),
            "pro_se_pct": pdf_stats.get("pro_se_pct"),
            "pro_se_count": pdf_stats.get("pro_se_count"),
            "_pdf_state_family_count": pdf_stats.get("state_family_count"),
            "_stats_source": pdf_stats.get("source"),
        })
        if not aggregate_row and not pdf_stats.get("state_family_count"):
            return stats, f"state_stats: no rows for state='{state}' / abbr='{state_abbr}'"
        if unresolved:
            stats["_unresolved"] = unresolved
        return stats, None

    # PDF helper unreachable: fall back to the local Supabase recomputation
    # so the build doesn't fail outright, but record the drift risk.
    clean, clean_unresolved = resolve_clean_state_medians(state, state_abbr, config)
    unresolved.extend(clean_unresolved)
    stats.update(clean)
    stats["state_family_count"] = (
        state_family_count if state_family_count is not None else clean.get("state_family_count")
    )
    stats["raw_submission_count"] = clean.get("state_family_count")
    if unresolved:
        stats["_unresolved"] = unresolved
    if not aggregate_row and not clean.get("clean_sample_size"):
        return stats, f"state_stats: no rows for state='{state}' / abbr='{state_abbr}'"
    return stats, None


def resolve_family_reports(actor: dict, config: dict) -> tuple[list[dict], int | None, str | None]:
    """Pull impact_quote from survey_submissions for any submission that mentioned this actor.
    Guardrails: approved=true AND permission_to_share=true."""
    block = config["survey_submissions"]
    limits = config.get("limits", {})
    max_words = limits.get("max_quote_words", MAX_QUOTE_WORDS)
    pool = limits.get("fetch_pool_size", REPORTS_LIMIT)
    pick = limits.get("reports_in_frame_3", 3)

    submission_ids = actor.get("_submission_ids") or []
    if not submission_ids:
        return [], 0, "family_reports: no submission_ids on actor"

    id_csv = ",".join(str(i) for i in submission_ids)
    # permission_to_share is a string enum, NOT a boolean. The legacy
    # spotlight_columns.json comment described it as a boolean which is
    # wrong — the eq.true filter silently matched 0 rows for every actor,
    # so every spec.json was rebuilt with family_reports=[]. We now match
    # the same enum values the public actor card treats as shareable:
    # public, anonymous, first_name. data_only is excluded because those
    # families opted into counting but not quoting.
    public_perm_csv = ",".join(sorted(PUBLIC_SHARE_PERMISSIONS))
    filters = [
        f"{block['id_column']}=in.({id_csv})",
        f"{block['approved_column']}=eq.true",
        f"{block['permission_column']}=in.({public_perm_csv})",
    ]
    try:
        rows = select(block["table"], ["*"], filters=filters, order=f"{block['created_column']}.desc", limit=pool)
    except SupabaseError as e:
        return [], None, f"survey_submissions: query failed {e.status}: {e.body[:160]}"

    out: list[dict] = []
    for r in rows:
        quote = clean_public_text(r.get(block["quote_column"]) or "", max_words)
        if not quote:
            continue
        out.append({
            "body": quote,
            "state": r.get(block["state_column"]),
            "county": r.get(block["county_column"]),
            "row_id": r.get(block["id_column"]),
        })
        if len(out) >= pick:
            break
    return out, len(submission_ids), None


def resolve_public_comments(actor: dict, config: dict) -> tuple[list[dict], str | None]:
    """Comments displayed on the 'what people are saying' frames.
    Prefers court_actor_comment_merges.merged_comment (admin-curated). Falls back to court_actors.notes."""
    limits = config.get("limits", {})
    pick = limits.get("comments_in_set_d", 3)
    actor_row_ids = actor.get("_actor_row_ids") or []

    # Try the merged-comment table first (curated)
    merges_block = config["comment_merges"]
    merged: list[dict] = []
    if actor_row_ids:
        id_csv = ",".join(str(i) for i in actor_row_ids)
        try:
            merged = select(
                merges_block["table"],
                ["*"],
                filters=[f"{merges_block['actor_link_column']}=in.({id_csv})"],
                order=f"{merges_block['actor_link_column']}.desc",
            )
        except SupabaseError as e:
            if DEBUG:
                print(f"[supabase] comment_merges query failed: {e.status}", file=sys.stderr)

    out: list[dict] = []
    for m in merged:
        text = clean_public_text(m.get(merges_block["merged_text_column"]) or "", 30)
        if not text:
            continue
        out.append({
            "comment_text": text,
            "author": "Anonymous parent",
            "source": "court_actor_comment_merges",
            "row_id": m.get(merges_block["actor_link_column"]),
        })
        if len(out) >= pick:
            break

    # Fallback: raw notes from court_actors rows (one per family mention)
    if len(out) < pick:
        for n in actor.get("_raw_notes") or []:
            if not n or not str(n).strip():
                continue
            cleaned = clean_public_text(str(n), 30)
            if not cleaned:
                continue
            out.append({
                "comment_text": cleaned,
                "author": "Anonymous parent",
                "source": "court_actors.notes",
            })
            if len(out) >= pick:
                break

    if not out:
        return [], "public_comments: no merged comments or raw notes available"
    return out, None


# ---------------------------------------------------------------------------
# state stat fallback from README
# ---------------------------------------------------------------------------
README_STATE_PATTERN_HINT = (
    "Looks for a line like: '### Ohio (175 families · 256 children · $74,850 median burden · 55.4% pro se · 20 mo.)'"
)


def parse_readme_state(state: str) -> dict:
    if not README_PATH.exists():
        return {}
    import re
    text = README_PATH.read_text()
    pattern = re.compile(
        rf"###\s*{re.escape(state)}\b.*?"
        rf"\(\s*(?P<families>[\d,]+)\s*families[^()]*?"
        rf"(?P<children>[\d,]+)\s*children[^()]*?"
        rf"(?P<burden>\$[\d,]+)[^()]*?"
        rf"(?P<pro_se>[\d.]+)%\s*pro\s*se[^()]*?"
        rf"(?P<months>\d+)\s*mo",
        re.IGNORECASE | re.DOTALL,
    )
    m = pattern.search(text)
    if not m:
        return {}
    return {
        "state_family_count": int(m.group("families").replace(",", "")),
        "families": int(m.group("families").replace(",", "")),
        "children": int(m.group("children").replace(",", "")),
        "median_burden": m.group("burden"),
        "pro_se_pct": float(m.group("pro_se")),
        "median_months_lost": int(m.group("months")),
        "median_months": int(m.group("months")),
        "_source": "README.md",
    }


def resolve_movement_total(config: dict) -> tuple[int | None, str | None]:
    """Sum of total_submissions across ALL rows (US + global) in movement_stats_by_state.

    Matches the public dashboard's headline "FAMILIES DOCUMENTED" number
    (e.g. 3,522 as of this writing). The dashboard's GET /api/survey endpoint
    in standwithmeg-court-actor-fresh does exactly this:
        SUM(total_submissions) FROM movement_stats_by_state
    """
    block = config["state_stats"]
    # movement_stats_by_state is the dashboard source — try that first.
    tables = [t for t in (block.get("table"), block.get("fallback_table")) if t]
    column = block["total_submissions_column"]
    for table in tables:
        try:
            rows = select(table, [column], limit=5000)  # NO is_us filter — dashboard counts global too
        except SupabaseError as e:
            if DEBUG:
                print(f"[supabase] movement total failed for {table}: {e.status}", file=sys.stderr)
            continue
        total = 0
        for r in rows:
            try:
                total += int(r.get(column) or 0)
            except (TypeError, ValueError):
                pass
        if total:
            return total, None
    return None, "movement_total: no aggregate rows found"


# ---------------------------------------------------------------------------
# folder skeleton + spec.json writer
# ---------------------------------------------------------------------------
def ensure_export_skeleton(slug: str) -> Path:
    base = EXPORT_ROOT / slug
    for sub in ("vertical", "carousel", "alt-covers", "comment-set"):
        (base / sub).mkdir(parents=True, exist_ok=True)
    return base


def copy_capcut_checklist(slug: str, display_name: str, base: Path) -> None:
    target = base / "CAPCUT_IMPORT.md"
    if target.exists():
        return
    text = f"""# CapCut / Story Import Checklist — {display_name}

Generated draft assets live in this folder.

1. Open `share.html` first and review all six story frames.
2. Confirm the text uses family-reported wording and no child names, case numbers, emails, addresses, or threats.
3. Screenshot or export each 9:16 frame only after review.
4. Import reviewed frames into CapCut in order: F1 through F6.
5. Use the flag-wave HTML as the motion reference; screenshots freeze the wave, video export preserves it.

This generator creates drafts only. Do not auto-post.
"""
    target.write_text(text)


def _previous_family_count(slug: str) -> int | None:
    """Read the existing spec.json for this actor and return the previously
    written family_count (top-level actor or supabase block), if any.

    Used as a safeguard so a transient 0 from resolve_public_actor_family_count
    doesn't wipe out a previously-correct count when alias decisions get
    respelled between rebuilds.
    """
    spec_path = EXPORT_ROOT / slug / "spec.json"
    if not spec_path.exists():
        return None
    try:
        spec = json.loads(spec_path.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    actor = spec.get("actor") or {}
    val = actor.get("family_count")
    if isinstance(val, int) and val > 0:
        return val
    sb = spec.get("supabase") or {}
    val = sb.get("family_count")
    if isinstance(val, int) and val > 0:
        return val
    return None


def write_spec(base: Path, resolved: Resolved, args: argparse.Namespace) -> Path:
    photo_rel = args.photo
    photo_abs = (PROJECT_ROOT / photo_rel) if photo_rel else None
    photo_ok = photo_abs.exists() if photo_abs else False
    if photo_rel and not photo_ok:
        resolved.unresolved.append(f"photo: file not found at {photo_rel}")

    # Best-effort title/first/last from whichever source has the most-complete name.
    resolved_name = resolved.actor.get("name") or args.display_name or ""
    fallback_title, fallback_first, fallback_last = split_name(resolved_name)
    title = resolved.actor.get("title") or fallback_title
    first_name = resolved.actor.get("first_name") or fallback_first
    last_name = resolved.actor.get("last_name") or fallback_last
    # If the canonical name was just a title + last name (e.g. 'Magistrate Blevins'),
    # first_name will be empty. That's correct — the renderer falls back gracefully.

    # Load per-actor display overrides from _scripts/actor_overrides.json.
    # Used for spelling fixes, role corrections, etc. that should survive
    # future Supabase rebuilds without modifying the underlying database.
    overrides_path = PROJECT_ROOT / "_scripts" / "actor_overrides.json"
    actor_overrides: dict = {}
    if overrides_path.exists():
        try:
            all_overrides = json.loads(overrides_path.read_text())
            actor_overrides = all_overrides.get(args.actor) or {}
            actor_overrides = {k: v for k, v in actor_overrides.items() if not k.startswith("_")}
        except (json.JSONDecodeError, OSError) as exc:
            print(f"warning: could not read {overrides_path.name}: {exc}", file=sys.stderr)

    # Build the actor dict, then apply per-actor overrides on top of it.
    # public_family_count is the value the live /api/survey/court-actors
    # route returns — render_spotlight uses it first so the share page and
    # the public actor card can never disagree.
    actor_dict = {
        "slug": args.actor,
        "display_name": args.display_name or resolved.actor.get("name"),
        "title": title,
        "first_name": first_name,
        "last_name": last_name,
        "role": resolved.actor.get("role") or args.role,
        "court": args.court or resolved.actor.get("court_or_county"),
        "county": args.county,
        "court_or_county": resolved.actor.get("court_or_county"),
        "state": args.state,
        "state_abbr": resolved.actor.get("state_abbr") or args.state_abbr,
        "mention_count": resolved.actor.get("_mention_count"),
        "family_count": resolved.family_count,
        "public_family_count": resolved.public_family_count,
        "public_family_count_source": resolved.public_family_count_source,
        "actor_report_count": resolved.report_count,
        "supabase_row_ids": resolved.actor.get("_actor_row_ids"),
        "actor_row_id": args.actor_row_id,
        "actor_bucket_key": args.actor_bucket_key,
    }
    if actor_overrides:
        actor_dict.update(actor_overrides)
        actor_dict["_overrides_applied"] = sorted(actor_overrides.keys())

    spec = {
        "schema_version": 2,
        "actor": actor_dict,
        "photo": {
            "path": photo_rel,
            "exists": photo_ok,
            "policy": PHOTO_POLICY,
        },
        "state_stats": resolved.state_stats or parse_readme_state(args.state or ""),
        "movement_total": resolved.movement_total,
        "supabase": {
            "report_count": resolved.report_count,
            "actor_report_count": resolved.report_count,
            "family_count": resolved.family_count,
            "family_reports": resolved.family_reports,
            "public_comments": resolved.public_comments,
        },
        "export_dir": str(base.relative_to(PROJECT_ROOT)),
        "unresolved": resolved.unresolved,
        "guardrails": {
            "voice": "families reported / submitted / alleged — never 'this person did X'",
            "footer": "Family-reported submissions · not court findings.",
            "strike_through_reserved_for": ["isolated", "dismissed", "ignored"],
            "no_minors": True,
            "no_case_numbers": True,
        },
        "public_share": {
            "recommended_route": f"/actors/{(args.state or '').lower().replace(' ', '-')}/{args.actor}/share",
            "draft_only": True,
        },
        "cta": "STANDWITHMEG.COM ↗",
    }
    out = base / "spec.json"
    out.write_text(json.dumps(spec, indent=2, ensure_ascii=False))
    return out


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def get_observed_columns() -> dict[str, list[str]]:
    if OBSERVED_OUT.exists():
        return {k: v.get("columns", []) for k, v in json.loads(OBSERVED_OUT.read_text()).items() if isinstance(v, dict)}
    return {}


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Build a per-actor spec.json for the Court Actor Spotlight pack.")
    p.add_argument("--introspect", action="store_true", help="Dump live schema for the 5 tables to spotlight_columns_observed.json.")
    p.add_argument("--actor", help="Actor slug (e.g. julia_kolber)")
    p.add_argument("--display-name", help="Full display name (e.g. 'Julia C. Kolber')")
    p.add_argument("--role", help="Public role (e.g. 'Family Law Attorney · Partner, ...')")
    p.add_argument("--court", help="Court / agency name")
    p.add_argument("--county", help="County")
    p.add_argument("--state", help="State name")
    p.add_argument("--state-abbr", help="State abbreviation (e.g. OH)")
    p.add_argument("--photo", help="Path to portrait PNG, relative to project root")
    p.add_argument("--actor-row-id", help="Exact court_actors.id from court_actor_public_notifications")
    p.add_argument("--actor-bucket-key", help="Public notification actor_bucket_key for audit")
    args = p.parse_args(argv)

    if args.introspect:
        introspect()
        return 0

    if not args.actor:
        die("--actor is required (or use --introspect).")

    config = load_columns_config()
    resolved = Resolved()

    if supabase_available():
        actor, err = resolve_actor(
            args.display_name or args.actor,
            args.state_abbr or "",
            config,
            args.actor_row_id,
            args.actor_bucket_key,
        )
        if err:
            resolved.unresolved.append(err)
        resolved.actor = actor

        family_count, err = resolve_public_actor_family_count(
            actor.get("name") or args.display_name or args.actor,
            args.state_abbr or actor.get("state_abbr") or "",
            config,
            args.actor_bucket_key,
        )
        if err:
            resolved.unresolved.append(err)

        # Read the canonical public-card count straight from the live API.
        # Anything we render on the share page MUST match this number, so
        # we store it separately from the local resolver's `family_count`
        # and prefer it downstream. Pass the slug so alias renames are
        # caught via the API response's photo_url join.
        public_count, api_err = resolve_public_family_count_via_api(
            args.display_name or actor.get("name") or args.actor,
            args.state_abbr or actor.get("state_abbr") or "",
            args.actor_bucket_key,
            slug=args.actor,
        )
        if api_err:
            resolved.unresolved.append(api_err)
        if public_count is not None:
            resolved.public_family_count = public_count
            resolved.public_family_count_source = f"{PUBLIC_API_BASE}/api/survey/court-actors"
            # The API is the single source of truth — collapse the legacy
            # `family_count` field to the same number so the regression
            # checker (and any older consumer that still reads family_count)
            # cannot diverge from the public card.
            family_count = public_count

        # Resolve report_count and family_reports BEFORE the family_count
        # sanity gate so report_count can act as a fallback. Without this
        # ordering, the gate has nothing to compare against and any actor
        # whose live family_count lookup returns 0 (alias respellings,
        # transient row-review state) gets a 0 written to the spec — which
        # is the Naomi Catadeulla / Cataudella regression case.
        if actor:
            reports, count, err = resolve_family_reports(actor, config)
            if err:
                resolved.unresolved.append(err)
            resolved.family_reports = reports
            resolved.report_count = count

            comments, err = resolve_public_comments(actor, config)
            if err:
                resolved.unresolved.append(err)
            resolved.public_comments = comments

        # Sanity gate (hardened): never write 0 over a positive previous
        # spec value OR a positive report_count. Precedence when the live
        # lookup returns falsy:
        #   1. previous spec.family_count (most authoritative — survived
        #      at least one rebuild that produced consistent data)
        #   2. resolve_family_reports report_count (impact_quote submissions
        #      that named this actor — close proxy for distinct families)
        #   3. 0 (only if every signal also says 0)
        # We also refuse to drop a positive count by more than 50% in one
        # rebuild, since that is almost always an alias-resolution glitch
        # rather than real families being removed.
        if not family_count:
            existing = _previous_family_count(args.actor)
            if existing and existing > 0:
                resolved.unresolved.append(
                    f"family_count: lookup returned 0 — kept previous spec value {existing}"
                )
                family_count = existing
            elif resolved.report_count and resolved.report_count > 0:
                resolved.unresolved.append(
                    f"family_count: lookup and previous spec returned 0 — "
                    f"using report_count={resolved.report_count} as fallback"
                )
                family_count = resolved.report_count
        else:
            existing = _previous_family_count(args.actor)
            if existing and existing > family_count * 2:
                resolved.unresolved.append(
                    f"family_count: lookup returned {family_count} but previous "
                    f"spec was {existing} — kept previous to avoid alias-drift "
                    f"regressions; verify manually"
                )
                family_count = existing
        resolved.family_count = family_count

        stats, err = resolve_state_stats(args.state or "", args.state_abbr or "", config)
        if err:
            resolved.unresolved.append(err)
        resolved.state_stats = stats
        for u in stats.get("_unresolved", []):
            resolved.unresolved.append(u)

        movement_total, err = resolve_movement_total(config)
        if err:
            resolved.unresolved.append(err)
        resolved.movement_total = movement_total
    else:
        resolved.unresolved.append("supabase: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; dry-run only.")

    if not resolved.state_stats:
        readme_stats = parse_readme_state(args.state or "")
        if readme_stats:
            resolved.state_stats = readme_stats
        else:
            resolved.unresolved.append(f"state_stats: not found in Supabase or README.md for state='{args.state}'")

    base = ensure_export_skeleton(args.actor)
    copy_capcut_checklist(args.actor, args.display_name or args.actor, base)
    spec_path = write_spec(base, resolved, args)

    print(f"\nWrote {spec_path.relative_to(PROJECT_ROOT)}")
    print(f"Export folder: {base.relative_to(PROJECT_ROOT)}")
    if resolved.unresolved:
        print("\nUnresolved (rendered as placeholders in design):")
        for u in resolved.unresolved:
            print(f"  - {u}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
