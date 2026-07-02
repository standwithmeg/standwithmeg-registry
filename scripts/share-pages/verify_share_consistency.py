#!/usr/bin/env python3
"""
Pre-push consistency gate for the deployed court-actor share pages.

For every actor in the deployed manifest:
  * the public API count for the actor (live /api/survey/court-actors)
  * the spec.json `public_family_count` (and legacy `family_count`)
  * the count rendered into the share.html Frame 1 number block
must agree. For every state that appears in the manifest, the share-page
Frame 5 stats (median family burden, % pro se, median months lost) must
match the same numbers the PDF generator emits via the
`scripts/pdf/state_stats_for_share.py` helper.

Exit code 0 on full agreement, 1 on any mismatch. Designed to be wired
into the deploy pipeline before `git push` so Dianna-style drift cannot
slip into production again.

Fixtures: Dianna Russell (TN) and Anthony Miller (FL) are exercised
explicitly so the user-visible regression cases stay covered even if the
manifest reorders or grows.

Usage:
    python3 _scripts/verify_share_consistency.py
    python3 _scripts/verify_share_consistency.py --actor dianna_russell
    python3 _scripts/verify_share_consistency.py --states FL,TN
"""
from __future__ import annotations

import argparse
import html
import importlib.util
import json
import os
import re
import socket
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
GENERATOR_REPO = Path(
    os.environ.get(
        "SWM_GENERATOR_REPO",
        str(PROJECT_ROOT if (PROJECT_ROOT / "New Final Post and Capcut template").exists()
            else Path("/Users/meghannmiller/Code/court-actor-posts")),
    )
)
NEXT_REPO = Path(
    os.environ.get(
        "SWM_NEXT_REPO",
        str(PROJECT_ROOT),
    )
)
PUBLIC_ACTORS_DIR = NEXT_REPO / "public" / "court-actors"
MANIFEST_PATH = NEXT_REPO / "public" / "court-actors" / "manifest.json"
EXPORT_ROOT = GENERATOR_REPO / "New Final Post and Capcut template" / "export"
PDF_STATS_HELPER = Path(
    os.environ.get(
        "SWM_PDF_STATS_HELPER",
        str(NEXT_REPO / "scripts" / "pdf" / "state_stats_for_share.py"),
    )
)
RENDER_SPOTLIGHT_PATH = SCRIPT_DIR / "render_spotlight.py"
RENDER_SPEC = importlib.util.spec_from_file_location("render_spotlight", RENDER_SPOTLIGHT_PATH)
assert RENDER_SPEC and RENDER_SPEC.loader
render_spotlight = importlib.util.module_from_spec(RENDER_SPEC)
RENDER_SPEC.loader.exec_module(render_spotlight)
PUBLIC_API_BASE = os.environ.get("SWM_PUBLIC_API_BASE", "https://my.standwithmeg.com").rstrip("/")
QUOTE_PLACEHOLDER = "families are adding their reports to the public record."

# Explicit fixtures from the user's regression report — checked even when
# they aren't yet in the manifest. Keeps these cases first-class regardless
# of churn elsewhere.
FIXTURE_ACTORS = [
    {"slug": "dianna_russell", "state_abbr": "TN", "display_name": "Dianna Russell", "expected_count": 5},
    {"slug": "anthony_miller", "state_abbr": "FL", "display_name": "Anthony Miller"},
    {"slug": "danny_phillips", "state_abbr": "FL", "display_name": "Danny Phillips", "expected_photo": True, "expected_share": True},
    {"slug": "cara_d_hutson", "state_abbr": "CA", "display_name": "Cara D. Hutson", "expected_count": 3, "expected_share": True},
    {
        "slug": "frances_m_giordano",
        "state_abbr": "MA",
        "display_name": "Frances M. Giordano",
        "expected_comment_substrings": [
            "Denied motions rushed to judgment",
            "Evidence and testimony was ignored",
        ],
    },
    {
        "slug": "david_c_bonfiglio",
        "state_abbr": "IN",
        "display_name": "David C. Bonfiglio",
        "expected_comment_substrings": [
            "A month later she turned around and gave him full custody",
            "Ignored sexual abuse concerns",
            "Judgment was made on a 15 minute contested hearing with a flawed biased gal report",
        ],
    },
]


# ---------------------------------------------------------------------------
# env loader so subprocess + Supabase env vars are populated
# ---------------------------------------------------------------------------
def _load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_load_env(GENERATOR_REPO / ".env")
_load_env(GENERATOR_REPO / ".env.local")
_load_env(NEXT_REPO / ".env")
_load_env(NEXT_REPO / ".env.local")


# ---------------------------------------------------------------------------
# Loose name key (mirrors lib/court-actors.ts actorLooseNameKey, simplified).
# Only used here for fuzzy lookup against the API response.
# ---------------------------------------------------------------------------
_NAME_SUFFIX_RE = re.compile(r"\b(jr\.?|sr\.?|ii|iii|iv|v|esq\.?)$", re.IGNORECASE)
_NAME_PUNCT_RE = re.compile(r"[^a-z0-9]+")


def loose_name_key(name: str) -> str:
    s = (name or "").lower().strip()
    s = _NAME_SUFFIX_RE.sub("", s).strip()
    s = _NAME_PUNCT_RE.sub(" ", s).strip()
    parts = [p for p in s.split() if len(p) > 1 or p in {"a", "i"}]
    out = " ".join(parts)
    # Collapse repeated letters in long tokens to match the API's behavior on
    # alias-respelled surnames (Catadeulla → Cataudella collapse to the same
    # key). Conservative: only 5+ char tokens, only consecutive dups.
    collapsed = []
    for tok in out.split():
        if len(tok) >= 5:
            tok = re.sub(r"([a-z])\1+", r"\1", tok)
        collapsed.append(tok)
    return " ".join(collapsed)


# ---------------------------------------------------------------------------
# Live API + PDF helper
# ---------------------------------------------------------------------------
_api_cache: dict[str, list[dict]] = {}
_pdf_cache: dict[str, dict] = {}

# Vercel's bot challenge 403s plain urllib requests. "Protection Bypass for
# Automation" (Vercel project settings → Deployment Protection) issues a secret
# that scripted callers send as a header to skip the challenge.
VERCEL_BYPASS_SECRET = os.environ.get("VERCEL_AUTOMATION_BYPASS_SECRET", "")


def _public_api_request(url: str) -> urllib.request.Request:
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "swm-share-pipeline/1.0 (+https://my.standwithmeg.com)")
    req.add_header("Accept", "application/json")
    if VERCEL_BYPASS_SECRET:
        req.add_header("x-vercel-protection-bypass", VERCEL_BYPASS_SECRET)
    return req


def fetch_state_actors(state_abbr: str) -> list[dict]:
    state_abbr = (state_abbr or "").upper()
    if state_abbr in _api_cache:
        return _api_cache[state_abbr]
    url = f"{PUBLIC_API_BASE}/api/survey/court-actors?state={urllib.parse.quote(state_abbr)}"
    try:
        with urllib.request.urlopen(_public_api_request(url), timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, socket.timeout, json.JSONDecodeError) as e:
        print(f"[warn] API fetch failed for {state_abbr}: {e}", file=sys.stderr)
        _api_cache[state_abbr] = []
        return []
    actors = data.get("actors") if isinstance(data, dict) else None
    actors = actors if isinstance(actors, list) else []
    _api_cache[state_abbr] = actors
    return actors


def api_count_for_actor(
    state_abbr: str,
    display_name: str,
    bucket_key: str | None,
    slug: str | None = None,
) -> tuple[int | None, str]:
    """Return (count, reason). Reason is either 'matched_by_<path>' on a hit
    or a human-readable explanation when no canonical count is reachable —
    important for distinguishing 'API rejected our lookup' from 'actor is
    below the public 3-family threshold and therefore absent from the API
    response by design'."""
    actors = fetch_state_actors(state_abbr)
    if not actors:
        return None, "api_response_empty"

    # The API joins the manifest into each response — photo_url contains the
    # actor's slug. Match on that first so alias renames (catadeulla →
    # cataudella) don't break the comparison.
    if slug:
        slug_token = f"/{slug}/"
        for a in actors:
            for url_field in ("photo_url", "share_url"):
                if slug_token in (a.get(url_field) or ""):
                    return int(a.get("count") or 0), f"matched_by_{url_field}"

    name_key = loose_name_key(display_name or "")
    target_bucket = (bucket_key or "").split("|", 1)[0].strip().lower() if bucket_key else ""
    for a in actors:
        api_key = loose_name_key(a.get("name") or a.get("display_name") or "")
        if name_key and api_key == name_key:
            return int(a.get("count") or 0), "matched_by_name"
        if target_bucket and api_key == target_bucket:
            return int(a.get("count") or 0), "matched_by_bucket"

    return None, "below_threshold_or_unmatched"


def pdf_stats_for_state(state_abbr: str) -> dict | None:
    state_abbr = (state_abbr or "").upper()
    if state_abbr in _pdf_cache:
        return _pdf_cache[state_abbr]
    if not PDF_STATS_HELPER.exists():
        print(f"[warn] PDF helper missing at {PDF_STATS_HELPER}", file=sys.stderr)
        return None
    try:
        proc = subprocess.run(
            [sys.executable, str(PDF_STATS_HELPER), state_abbr],
            capture_output=True, text=True, timeout=300,
        )
    except (subprocess.SubprocessError, OSError) as e:
        print(f"[warn] PDF helper invocation failed for {state_abbr}: {e}", file=sys.stderr)
        return None
    if proc.returncode != 0:
        snippet = (proc.stderr or proc.stdout).strip().splitlines()[-1:] or [""]
        print(f"[warn] PDF helper exit {proc.returncode} for {state_abbr}: {snippet[0]}", file=sys.stderr)
        return None
    try:
        stats = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        print(f"[warn] PDF helper output not JSON for {state_abbr}: {e}", file=sys.stderr)
        return None
    _pdf_cache[state_abbr] = stats
    return stats


# ---------------------------------------------------------------------------
# Share.html parsing — extract the rendered count + Frame 5 stats
# ---------------------------------------------------------------------------
# Frame 1 renders the actor's family count inside `.f1-report-count > b`.
# Scoped to that class so the regex doesn't accidentally pick up the state
# count, movement total, or any other bolded integer earlier in the doc.
_FRAME1_COUNT_RE = re.compile(
    r'class="f1-report-count">\s*<b[^>]*>([0-9,]+)</b>',
    re.DOTALL,
)
_FRAME5_BURDEN_RE = re.compile(
    r'class="stat-n">\s*([^<]+?)\s*</span>\s*<span class="stat-l">MEDIAN FAMILY BURDEN',
    re.DOTALL,
)
_FRAME5_PROSE_RE = re.compile(
    r'class="stat-n">\s*([^<]+?)\s*</span>\s*<span class="stat-l">PARENTS FORCED PRO SE',
    re.DOTALL,
)
_FRAME5_MONTHS_RE = re.compile(
    r'class="stat-n">\s*([^<]+?)\s*</span>\s*<span class="stat-l">MEDIAN TIME LOST',
    re.DOTALL,
)
_QUOTE_TEXT_RE = re.compile(r'<p class="f4-text">(.+?)</p>', re.DOTALL)


def parse_share_html(html_path: Path) -> dict:
    if not html_path.exists():
        return {"_missing": True}
    text = html_path.read_text(encoding="utf-8", errors="ignore")
    out: dict = {"_path": str(html_path)}
    m = _FRAME1_COUNT_RE.search(text)
    if m:
        out["frame1_count"] = int(m.group(1).replace(",", ""))
    m = _FRAME5_BURDEN_RE.search(text)
    if m:
        out["frame5_burden"] = m.group(1).strip()
    m = _FRAME5_PROSE_RE.search(text)
    if m:
        out["frame5_pro_se"] = m.group(1).strip()
    m = _FRAME5_MONTHS_RE.search(text)
    if m:
        out["frame5_months"] = m.group(1).strip()
    out["frame3_quotes"] = [
        re.sub(r"\s+", " ", html.unescape(q)).strip()
        for q in _QUOTE_TEXT_RE.findall(text)
    ]
    return out


def _sanitize_quote_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    text = re.sub(r"\b\d{2}-?\d{4,}\b", "[case #]", text)
    text = re.sub(r"\b\S+@\S+\.\S+\b", "[email]", text)
    text = re.sub(r"\b\d{3}-\d{3}-\d{4}\b", "[phone]", text)
    return text


def _quote_char_budget(target_count: int) -> int:
    return render_spotlight._quote_char_budget(target_count)


def select_best_quote(text: str, char_budget: int = 140) -> str:
    return render_spotlight.select_best_quote(text, char_budget=char_budget)


def expected_frame3_quotes(spec: dict, n: int | None = None) -> tuple[list[str], str]:
    """Mirror render_spotlight.story_quotes: actor-specific public_comments
    are exclusive. family_reports are only allowed when public_comments is
    empty."""
    sb = spec.get("supabase") or {}
    comments = sb.get("public_comments") or []
    reports = sb.get("family_reports") or []
    source = "public_comments" if comments else "family_reports"
    out = [item["body"] for item in render_spotlight.story_quotes(spec, n=n)]
    return out, source


def _norm_quote(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(text or "")).strip().lower()


def _quote_summary(quotes: list[str]) -> str:
    return json.dumps(quotes, ensure_ascii=False)


def fmt_money(v) -> str:
    try:
        return f"${int(round(float(v))):,}"
    except (TypeError, ValueError):
        return "Review"


def fmt_pct(v) -> str:
    try:
        return f"{float(v):.1f}%"
    except (TypeError, ValueError):
        return "Review"


def fmt_months(v) -> str:
    try:
        m = float(v)
    except (TypeError, ValueError):
        return "Review"
    if not 0 < m <= 240:
        return "Review"
    return f"{m:.0f} mo"


# ---------------------------------------------------------------------------
# Failure aggregation
# ---------------------------------------------------------------------------
@dataclass
class Mismatch:
    scope: str          # actor slug or state abbr
    field: str          # 'family_count', 'frame5_burden', etc.
    api_or_pdf: str     # canonical source value
    spec: str           # value written to spec.json
    rendered: str       # value rendered into share.html

    def __str__(self) -> str:
        return (
            f"  [{self.scope}] {self.field}: "
            f"canonical={self.api_or_pdf!r} "
            f"spec={self.spec!r} "
            f"rendered={self.rendered!r}"
        )


def load_manifest() -> list[dict]:
    if not MANIFEST_PATH.exists():
        print(f"error: manifest missing at {MANIFEST_PATH}", file=sys.stderr)
        sys.exit(2)
    data = json.loads(MANIFEST_PATH.read_text())
    return list(data.get("actors") or [])


def find_actor_export(slug: str) -> Path | None:
    for p in PUBLIC_ACTORS_DIR.glob(f"*/{slug}"):
        if (p / "spec.json").exists():
            return p
    p = EXPORT_ROOT / slug
    if (p / "spec.json").exists():
        return p
    return None


def manifest_asset_path(asset_url: str | None) -> Path | None:
    if not asset_url or not asset_url.startswith("/") or asset_url.startswith("//"):
        return None
    parsed = urllib.parse.urlparse(asset_url)
    if not parsed.path.startswith("/court-actors/"):
        return None
    rel = Path(parsed.path.lstrip("/"))
    if ".." in rel.parts:
        return None
    return NEXT_REPO / "public" / rel


def manifest_asset_exists(asset_url: str | None) -> bool:
    path = manifest_asset_path(asset_url)
    return bool(path and path.is_file())


def git_tracks_path(path: Path) -> bool:
    try:
        proc = subprocess.run(
            ["git", "ls-files", "--error-unmatch", str(path.relative_to(NEXT_REPO))],
            cwd=NEXT_REPO,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except (OSError, ValueError):
        return True
    return proc.returncode == 0


def check_actor(
    entry: dict,
    expected_count: int | None = None,
    expected_photo: bool = False,
    expected_share: bool = False,
    expected_comment_substrings: list[str] | None = None,
    asset_only: bool = False,
) -> list[Mismatch]:
    slug = entry.get("slug") or ""
    state_abbr = (entry.get("state_abbr") or "").upper()
    display_name = entry.get("display_name") or entry.get("canonical_name") or slug
    bucket_key = entry.get("actor_bucket_key")

    export_dir = find_actor_export(slug)
    if not export_dir:
        return [Mismatch(slug, "spec.json", "exists", "missing", "n/a")]

    spec = json.loads((export_dir / "spec.json").read_text())
    rendered = parse_share_html(export_dir / "share.html")
    actor = spec.get("actor") or {}
    supabase = spec.get("supabase") or {}

    spec_public = actor.get("public_family_count")
    spec_family = actor.get("family_count")
    rendered_count = rendered.get("frame1_count")
    api_count, api_reason = api_count_for_actor(state_abbr, display_name, bucket_key, slug=slug)

    mismatches: list[Mismatch] = []
    manifest_photo = entry.get("photo_url")
    manifest_share = entry.get("share_url")
    manifest_photo_exists = manifest_asset_exists(manifest_photo)
    manifest_share_exists = manifest_asset_exists(manifest_share)
    manifest_advertises_public_asset = bool(manifest_photo or manifest_share)
    if manifest_photo and not manifest_photo_exists:
        mismatches.append(Mismatch(slug, "manifest.photo_url asset", "existing file", str(manifest_photo), "missing"))
    if manifest_share and not manifest_share_exists:
        mismatches.append(Mismatch(slug, "manifest.share_url asset", "existing file", str(manifest_share), "missing"))
    if expected_photo and not manifest_photo_exists:
        mismatches.append(Mismatch(slug, "manifest.photo_url", "present file", str(manifest_photo), "missing"))
    if expected_share and not manifest_share_exists:
        mismatches.append(Mismatch(slug, "manifest.share_url", "present file", str(manifest_share), "missing"))
    if manifest_photo_exists:
        spec_photo = spec.get("photo") or {}
        if not (spec_photo.get("exists") and spec_photo.get("path")):
            mismatches.append(Mismatch(slug, "spec.photo",
                                       "wired image_1080.png", str(spec_photo),
                                       "share page may render placeholder"))
        rendered_path = rendered.get("_path")
        if rendered_path:
            try:
                share_html = Path(rendered_path).read_text(encoding="utf-8", errors="ignore")
            except OSError:
                share_html = ""
            if "{{ACTOR.IMAGE_URL}}" in share_html:
                mismatches.append(Mismatch(slug, "share.html photo placeholder",
                                           "real photo rendered", str(manifest_photo),
                                           "{{ACTOR.IMAGE_URL}}"))

    expected_quotes, quote_source = expected_frame3_quotes(spec, n=None)
    rendered_quotes = rendered.get("frame3_quotes") or []
    expected_norm = [_norm_quote(q) for q in expected_quotes if _norm_quote(q)]
    rendered_norm = [_norm_quote(q) for q in rendered_quotes if _norm_quote(q)]
    rendered_only_placeholder = not expected_norm and rendered_norm == [QUOTE_PLACEHOLDER]
    if expected_norm != rendered_norm and not rendered_only_placeholder:
        mismatches.append(Mismatch(
            slug,
            f"share.html WHAT FAMILIES SAY quotes ({quote_source})",
            _quote_summary(expected_quotes),
            f"count={len(expected_quotes)}",
            _quote_summary(rendered_quotes),
        ))

    # If public_comments exist, Frame 3 must not top up with broad
    # family_reports. This catches the "one actor note plus generic filler"
    # regression without relying on private reporter data.
    if supabase.get("public_comments"):
        expected_norm_set = set(expected_norm)
        report_norm = {
            _norm_quote(select_best_quote(str(r.get("body") or ""), _quote_char_budget(len(expected_quotes) or 6)))
            for r in (supabase.get("family_reports") or [])
        }
        leaked = [q for q in rendered_norm if q in report_norm and q not in expected_norm_set]
        if leaked:
            mismatches.append(Mismatch(slug, "frame3 fallback mixing",
                                       "public_comments only", str(expected_quotes),
                                       str(rendered_quotes)))

    for needle in expected_comment_substrings or []:
        if _norm_quote(needle) not in _norm_quote(" ".join(rendered_quotes)):
            mismatches.append(Mismatch(slug, "fixture expected comment",
                                       needle, "public_comments", str(rendered_quotes)))

    if asset_only:
        return mismatches

    if api_count is None:
        # The API legitimately omits actors below the 3-family public
        # threshold and entire states that have no public actors yet.
        # Either path is consistent only when the local spec is also below
        # threshold. If spec/share claim 3+ families but the public API cannot
        # match the actor, the manifest/spec is stale or mis-keyed.
        benign = {"below_threshold_or_unmatched", "api_response_empty"}
        new_local_actor = not git_tracks_path(export_dir / "spec.json")
        local_public_count = next(
            (
                int(value)
                for value in (spec_public, spec_family, rendered_count)
                if value is not None and str(value).strip().isdigit()
            ),
            None,
        )
        if manifest_advertises_public_asset and (
            api_reason not in benign
            or (
                local_public_count is not None
                and local_public_count >= 3
                and not new_local_actor
            )
        ):
            mismatches.append(Mismatch(slug, "public_family_count_lookup",
                                       api_reason, str(spec_public), str(rendered_count)))
    else:
        if spec_public is not None and int(spec_public) != int(api_count):
            mismatches.append(Mismatch(slug, "spec.public_family_count",
                                       str(api_count), str(spec_public),
                                       str(rendered_count)))
        if spec_family is not None and int(spec_family) != int(api_count):
            mismatches.append(Mismatch(slug, "spec.family_count",
                                       str(api_count), str(spec_family),
                                       str(rendered_count)))
        if rendered_count is not None and int(rendered_count) != int(api_count):
            mismatches.append(Mismatch(slug, "share.html frame1 count",
                                       str(api_count),
                                       str(spec_public if spec_public is not None else spec_family),
                                       str(rendered_count)))
        if expected_count is not None and int(api_count) != expected_count:
            mismatches.append(Mismatch(slug, "fixture expected count",
                                       str(expected_count),
                                       str(spec_public if spec_public is not None else spec_family),
                                       str(rendered_count)))

    unresolved = spec.get("unresolved") or []
    if (
        manifest_share_exists
        and not expected_quotes
        and any("court_actors: no rows match" in str(item) for item in unresolved)
    ):
        mismatches.append(Mismatch(slug, "resolved_actor_rows",
                                   "matched court_actors rows before live share",
                                   str(unresolved[:3]),
                                   "share page has no parent quote source"))

    return mismatches


def check_state(state_abbr: str, sample_actor: Path) -> list[Mismatch]:
    pdf = pdf_stats_for_state(state_abbr)
    if pdf is None:
        return [Mismatch(state_abbr, "pdf_stats", "unavailable", "n/a", "n/a")]
    spec = json.loads((sample_actor / "spec.json").read_text())
    state_stats = spec.get("state_stats") or {}
    rendered = parse_share_html(sample_actor / "share.html")

    fields = [
        ("median_financial_loss", "frame5_burden", fmt_money),
        ("pro_se_pct", "frame5_pro_se", fmt_pct),
        ("median_months_lost", "frame5_months", fmt_months),
    ]

    mismatches: list[Mismatch] = []
    for stat_field, render_field, formatter in fields:
        canonical = pdf.get(stat_field)
        canonical_formatted = formatter(canonical)
        spec_val = state_stats.get(stat_field)
        spec_formatted = formatter(spec_val)
        rendered_val = rendered.get(render_field)
        if spec_val is None and canonical is None:
            # Both sides agree the stat is genuinely missing (young states,
            # international locations) — that's consistent, not a mismatch.
            continue
        try:
            values_differ = spec_val is None or canonical is None or float(spec_val) != float(canonical)
        except (TypeError, ValueError):
            # A non-numeric value (stale placeholder, partial helper output)
            # is itself a mismatch — never let it crash the whole check.
            values_differ = True
        if values_differ:
            mismatches.append(Mismatch(state_abbr, f"spec.state_stats.{stat_field}",
                                       canonical_formatted, spec_formatted,
                                       str(rendered_val)))
        elif rendered_val is not None and rendered_val != canonical_formatted:
            mismatches.append(Mismatch(state_abbr, f"share.html {render_field}",
                                       canonical_formatted, spec_formatted,
                                       str(rendered_val)))
    return mismatches


_HONORIFICS = {
    "dr", "mr", "mrs", "ms", "miss", "hon", "honorable", "judge", "justice",
    "atty", "attorney", "the", "gal", "esq",
}


def _person_identity(entry: dict) -> str:
    """Normalize an actor's display/canonical name to a comparison key so the
    same person under a corrected title can't slip in as a second public card.
    Strips honorifics (Dr., Judge, Hon., ...) and punctuation so
    'Gage Stermensky' and 'Dr. Gage Stermensky' collapse to one identity."""
    name = (entry.get("canonical_name") or entry.get("display_name") or "").lower()
    tokens = [re.sub(r"[^a-z0-9]", "", t) for t in name.split()]
    tokens = [t for t in tokens if t and t not in _HONORIFICS]
    return " ".join(tokens)


def check_duplicate_manifest_entries(manifest_entries: list[dict]) -> list[Mismatch]:
    """Catch the same court actor deployed twice under different slugs/names.

    Root cause of the Gage Stermensky regression: re-deploying an actor with a
    corrected display name produces a new slug, and the old manifest entry was
    never removed, so two public cards described one person. We flag both a
    shared resolved bucket key and a shared state+person identity."""
    mismatches: list[Mismatch] = []
    by_bucket: dict[str, list[dict]] = {}
    by_identity: dict[tuple[str, str], list[dict]] = {}
    for entry in manifest_entries:
        slug = entry.get("slug")
        if not slug:
            continue
        bucket = (entry.get("actor_bucket_key") or "").strip().lower()
        if bucket:
            by_bucket.setdefault(bucket, []).append(entry)
        identity = _person_identity(entry)
        state = (entry.get("state_abbr") or "").upper()
        if identity:
            by_identity.setdefault((state, identity), []).append(entry)

    reported: set[frozenset[str]] = set()

    def _report(group: list[dict], reason: str) -> None:
        slugs = frozenset(e.get("slug") for e in group if e.get("slug"))
        if len(slugs) < 2 or slugs in reported:
            return
        reported.add(slugs)
        ordered = sorted(slugs)
        mismatches.append(Mismatch(ordered[0], "duplicate court actor",
                                   "one public card per person", reason,
                                   "duplicate slugs: " + ", ".join(ordered)))

    for bucket, group in by_bucket.items():
        _report(group, f"shared actor_bucket_key '{bucket}'")
    for (state, identity), group in by_identity.items():
        _report(group, f"shared identity '{identity}' in {state}")
    return mismatches


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--actor", action="append", help="Limit checks to one or more actor slugs.")
    p.add_argument("--states", help="Comma-separated state abbrs to check (default: all states in manifest).")
    p.add_argument("--skip-states", action="store_true", help="Skip state-stats checks (actors only).")
    p.add_argument("--asset-only", action="store_true", help="Only verify manifest asset URLs point at local files.")
    args = p.parse_args(argv)

    manifest_entries = load_manifest()
    manifest_by_slug = {e.get("slug"): e for e in manifest_entries if e.get("slug")}
    entries = list(manifest_entries)
    wanted_states = {s.strip().upper() for s in args.states.split(",") if s.strip()} if args.states else set()
    if args.actor:
        wanted = set(args.actor)
        entries = [e for e in entries if e.get("slug") in wanted]
    if wanted_states:
        entries = [e for e in entries if (e.get("state_abbr") or "").upper() in wanted_states]

    # Always include the fixture actors so regressions can't hide them.
    fixture_slugs = {f["slug"] for f in FIXTURE_ACTORS}
    seen_slugs = {e.get("slug") for e in entries}
    for fixture in FIXTURE_ACTORS:
        if args.actor and fixture["slug"] not in set(args.actor):
            continue
        if wanted_states and fixture["state_abbr"].upper() not in wanted_states:
            continue
        if fixture["slug"] not in seen_slugs:
            manifest_entry = manifest_by_slug.get(fixture["slug"]) or {}
            entries.append({
                **manifest_entry,
                "slug": fixture["slug"],
                "state_abbr": manifest_entry.get("state_abbr") or fixture["state_abbr"],
                "display_name": manifest_entry.get("display_name") or fixture["display_name"],
                "actor_bucket_key": manifest_entry.get("actor_bucket_key") or fixture.get("actor_bucket_key"),
            })

    failures: list[Mismatch] = []
    # Duplicate detection runs over the FULL manifest (not the filtered
    # subset) so a --actor/--states run can't hide a sibling duplicate.
    failures.extend(check_duplicate_manifest_entries(manifest_entries))
    checked_actors = 0
    for entry in entries:
        slug = entry.get("slug")
        fixture = next((f for f in FIXTURE_ACTORS if f["slug"] == slug), {})
        result = check_actor(
            entry,
            expected_count=fixture.get("expected_count"),
            expected_photo=bool(fixture.get("expected_photo")),
            expected_share=bool(fixture.get("expected_share")),
            expected_comment_substrings=fixture.get("expected_comment_substrings"),
            asset_only=args.asset_only,
        )
        failures.extend(result)
        checked_actors += 1

    state_count = 0
    if not args.skip_states and not args.asset_only:
        if not wanted_states:
            for e in entries:
                if e.get("state_abbr"):
                    wanted_states.add(e["state_abbr"].upper())

        for state_abbr in sorted(wanted_states):
            # Pick the first manifest actor that lives in this state — we
            # only need its spec/share to verify the rendered values.
            sample = next(
                (find_actor_export(e["slug"])
                 for e in entries
                 if (e.get("state_abbr") or "").upper() == state_abbr and find_actor_export(e["slug"])),
                None,
            )
            if not sample:
                continue
            failures.extend(check_state(state_abbr, sample))
            state_count += 1

    if failures:
        print(f"\nFAIL: {len(failures)} mismatch(es) across {checked_actors} actor(s) and {state_count} state(s):")
        for f in failures:
            print(str(f))
        print(f"\nNamed regression fixtures: {'in failures' if any(f.scope in fixture_slugs for f in failures) else 'PASS'}")
        return 1

    print(f"OK: {checked_actors} actor(s) and {state_count} state(s) consistent "
          f"(API ↔ spec.json ↔ share.html ↔ PDF helper)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
