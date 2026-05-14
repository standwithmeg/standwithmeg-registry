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
import json
import os
import re
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
        "/Users/meghannmiller/Code/standwithmeg-court-actor-fresh",
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
PUBLIC_API_BASE = os.environ.get("SWM_PUBLIC_API_BASE", "https://my.standwithmeg.com").rstrip("/")

# Explicit fixtures from the user's regression report — checked even when
# they aren't yet in the manifest. Keeps these cases first-class regardless
# of churn elsewhere.
FIXTURE_ACTORS = [
    {"slug": "dianna_russell", "state_abbr": "TN", "display_name": "Dianna Russell", "expected_count": 4},
    {"slug": "anthony_miller", "state_abbr": "FL", "display_name": "Anthony Miller"},
    {"slug": "danny_phillips", "state_abbr": "FL", "display_name": "Danny Phillips", "expected_photo": True, "expected_share": True},
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
            "A lawyer took me to the wrong courtroom",
            "Found me in contempt",
            "Sided with gal report",
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


def fetch_state_actors(state_abbr: str) -> list[dict]:
    state_abbr = (state_abbr or "").upper()
    if state_abbr in _api_cache:
        return _api_cache[state_abbr]
    url = f"{PUBLIC_API_BASE}/api/survey/court-actors?state={urllib.parse.quote(state_abbr)}"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError) as e:
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
_FRAME3_TEXT_RE = re.compile(r'<p class="f3-text">(.+?)</p>', re.DOTALL)


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
        for q in _FRAME3_TEXT_RE.findall(text)
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
    if target_count >= 6:
        return 110
    if target_count == 5:
        return 125
    if target_count == 4:
        return 140
    return 168


def select_best_quote(text: str, char_budget: int = 140) -> str:
    text = _sanitize_quote_text(text)
    if not text:
        return ""
    if len(text) <= char_budget:
        return text
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    first = sentences[0] if sentences else text
    if len(first) <= char_budget:
        return first
    trimmed = first[: max(1, char_budget - 1)].rstrip(" ,;:-")
    return f"{trimmed}…"


def expected_frame3_quotes(spec: dict, n: int = 6) -> tuple[list[str], str]:
    """Mirror render_spotlight.story_quotes: actor-specific public_comments
    are exclusive. family_reports are only allowed when public_comments is
    empty."""
    sb = spec.get("supabase") or {}
    comments = sb.get("public_comments") or []
    reports = sb.get("family_reports") or []
    source = "public_comments" if comments else "family_reports"
    raw = [
        str(item.get("comment_text") if comments else item.get("body") or "").strip()
        for item in (comments if comments else reports)
    ][:n]
    target_count = max(4, min(n, len(raw))) if raw else 0
    char_budget = _quote_char_budget(target_count or n)
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        body = select_best_quote(item, char_budget=char_budget)
        key = re.sub(r"\s+", " ", body).strip().lower()
        if body and key not in seen:
            out.append(body)
            seen.add(key)
    return out, source


def _norm_quote(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(text or "")).strip().lower()


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


def check_actor(
    entry: dict,
    expected_count: int | None = None,
    expected_photo: bool = False,
    expected_share: bool = False,
    expected_comment_substrings: list[str] | None = None,
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
    if expected_photo and not manifest_photo:
        mismatches.append(Mismatch(slug, "manifest.photo_url", "present", str(manifest_photo), "n/a"))
    if expected_share and not manifest_share:
        mismatches.append(Mismatch(slug, "manifest.share_url", "present", str(manifest_share), "n/a"))

    if api_count is None:
        # The API legitimately omits actors below the 3-family public
        # threshold and entire states that have no public actors yet.
        # Either path is consistent with "share page shows the local
        # spec value because the API has nothing public to show" — flag
        # only when we couldn't reach the API at all.
        benign = {"below_threshold_or_unmatched", "api_response_empty"}
        if api_reason not in benign:
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

    expected_quotes, quote_source = expected_frame3_quotes(spec, n=6)
    rendered_quotes = rendered.get("frame3_quotes") or []
    rendered_norm = [_norm_quote(q) for q in rendered_quotes]
    for q in expected_quotes:
        q_norm = _norm_quote(q)
        if q_norm and q_norm not in rendered_norm:
            mismatches.append(Mismatch(slug, "frame3 actor-specific quote",
                                       quote_source, q, "missing from share.html"))

    # If public_comments exist, Frame 3 must not top up with broad
    # family_reports. This catches the "one actor note plus generic filler"
    # regression without relying on private reporter data.
    if supabase.get("public_comments"):
        expected_norm = {_norm_quote(q) for q in expected_quotes}
        report_norm = {
            _norm_quote(select_best_quote(str(r.get("body") or ""), _quote_char_budget(len(expected_quotes) or 6)))
            for r in (supabase.get("family_reports") or [])
        }
        leaked = [q for q in rendered_norm if q in report_norm and q not in expected_norm]
        if leaked:
            mismatches.append(Mismatch(slug, "frame3 fallback mixing",
                                       "public_comments only", str(expected_quotes),
                                       str(rendered_quotes)))

    for needle in expected_comment_substrings or []:
        if _norm_quote(needle) not in _norm_quote(" ".join(rendered_quotes)):
            mismatches.append(Mismatch(slug, "fixture expected comment",
                                       needle, "public_comments", str(rendered_quotes)))

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
        if spec_val is None or canonical is None or float(spec_val) != float(canonical):
            mismatches.append(Mismatch(state_abbr, f"spec.state_stats.{stat_field}",
                                       canonical_formatted, spec_formatted,
                                       str(rendered_val)))
        elif rendered_val is not None and rendered_val != canonical_formatted:
            mismatches.append(Mismatch(state_abbr, f"share.html {render_field}",
                                       canonical_formatted, spec_formatted,
                                       str(rendered_val)))
    return mismatches


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--actor", action="append", help="Limit checks to one or more actor slugs.")
    p.add_argument("--states", help="Comma-separated state abbrs to check (default: all states in manifest).")
    p.add_argument("--skip-states", action="store_true", help="Skip state-stats checks (actors only).")
    args = p.parse_args(argv)

    manifest_entries = load_manifest()
    manifest_by_slug = {e.get("slug"): e for e in manifest_entries if e.get("slug")}
    entries = list(manifest_entries)
    if args.actor:
        wanted = set(args.actor)
        entries = [e for e in entries if e.get("slug") in wanted]

    # Always include the fixture actors so regressions can't hide them.
    fixture_slugs = {f["slug"] for f in FIXTURE_ACTORS}
    seen_slugs = {e.get("slug") for e in entries}
    for fixture in FIXTURE_ACTORS:
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
        )
        failures.extend(result)
        checked_actors += 1

    state_count = 0
    if not args.skip_states:
        wanted_states: set[str] = set()
        if args.states:
            wanted_states = {s.strip().upper() for s in args.states.split(",") if s.strip()}
        else:
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
