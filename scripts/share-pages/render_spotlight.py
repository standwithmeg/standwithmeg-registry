#!/usr/bin/env python3
"""
Render a per-actor Court Actor Spotlight share page from spec.json.

Implements the Spotlight Stories v2 design vocabulary
(see `New Final Post and Capcut template/Spotlight Stories v2.html`):
 - Visible waving flag SVG background (displacement filter)
 - STATE OF [state] yellow stamp top-right on every frame
 - JetBrains Mono top-left frame tags
 - Anton huge headlines, Fraunces italic serif accents
 - Frame 2 "KEEP US" red highlight bar + rotated "NOT ANY MORE!" stamp
 - Frame 3 ghost quote mark behind italic pull-quote
 - ActorIDStrip + MovementFoot at the bottom of every frame

Reads:
    New Final Post and Capcut template/export/<slug>/spec.json
Writes:
    New Final Post and Capcut template/export/<slug>/share.html
    New Final Post and Capcut template/export/<slug>/spotlight.html (alias)
"""

from __future__ import annotations

import argparse
import html
import json
import math
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if SCRIPT_DIR.name == "share-pages":
    WEBSITE_ROOT = SCRIPT_DIR.parent.parent
    PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent / ".share-pages-work"
    PROJECT_ROOT = Path(os.environ.get("SWM_SHARE_WORKDIR", PROJECT_ROOT)).resolve()
    PHOTO_ROOT = Path(os.environ.get("SWM_PHOTO_ROOT", WEBSITE_ROOT)).resolve()
else:
    WEBSITE_ROOT = PROJECT_ROOT = SCRIPT_DIR.parent
    PHOTO_ROOT = PROJECT_ROOT
NEW_TEMPLATE_ROOT = PROJECT_ROOT / "New Final Post and Capcut template"
EXPORT_ROOT = NEW_TEMPLATE_ROOT / "export"


# ---------------------------------------------------------------------------
# Acronym + role helpers (unchanged from prior renderer)
# ---------------------------------------------------------------------------
ACRONYMS: dict[str, str] = {
    "GAL": "Guardian ad Litem",
    "CPS": "Child Protective Services",
    "DCF": "Department of Children and Families",
    "DCFS": "Department of Children and Family Services",
    "DSS": "Department of Social Services",
    "DHS": "Department of Human Services",
    "CASA": "Court Appointed Special Advocate",
    "AAG": "Assistant Attorney General",
    "ADA": "Assistant District Attorney",
    "DA": "District Attorney",
    "JFS": "Job and Family Services",
}


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def expand_acronyms(text: str) -> str:
    if not text:
        return text

    def repl(match: "re.Match[str]") -> str:
        token = match.group(0)
        full = ACRONYMS.get(token.upper())
        return f"{full} ({token})" if full else token

    return re.sub(r"\b(" + "|".join(ACRONYMS.keys()) + r")\b", repl, text)


def fmt_int(value: Any) -> str:
    try:
        return f"{int(float(value)):,}"
    except (TypeError, ValueError):
        return "—"


def fmt_money(value: Any) -> str:
    try:
        return f"${int(round(float(value))):,}"
    except (TypeError, ValueError):
        return "Review"


def fmt_months(value: Any) -> str:
    try:
        months = float(value)
    except (TypeError, ValueError):
        return "Review"
    if not 0 < months <= 240:
        return "Review"
    return f"{months:.0f} mo"


def fmt_pct(value: Any) -> str:
    try:
        return f"{float(value):.1f}%"
    except (TypeError, ValueError):
        return "Review"


def first_nonempty(*values: Any) -> Any:
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return None


def story_quote(spec: dict) -> tuple[str, str]:
    """Returns (quote_text, source_kind). source_kind = 'comment' | 'family_report' | 'fallback'.

    Order: admin-curated public_comments (court_actors.notes) FIRST so the
    same quotes that appear in the state PDF appear on the share slide.
    Then survey_submissions.impact_quote family_reports as the secondary
    source for actors whose admin-curated comments are short or missing.
    """
    sb = spec.get("supabase") or {}
    comments = sb.get("public_comments") or []
    family_reports = sb.get("family_reports") or []
    if comments:
        return (comments[0].get("comment_text") or "", "comment")
    if family_reports:
        return (family_reports[0].get("body") or "", "family_report")
    return (
        "Families are adding their reports to the public record.",
        "fallback",
    )


# ---------------------------------------------------------------------------
# Multi-quote selection — prefers 4-6 short snippets for Frame 3
# ---------------------------------------------------------------------------
def _sanitize_quote_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    # Strip obvious PII patterns just in case
    text = re.sub(r"\b\d{2}-?\d{4,}\b", "[case #]", text)            # case numbers
    text = re.sub(r"\b\S+@\S+\.\S+\b", "[email]", text)              # email
    text = re.sub(r"\b\d{3}-\d{3}-\d{4}\b", "[phone]", text)        # phone
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
    """Return a short, publication-safe quote that PRESERVES THE OPENING.

    Strategy (matches the state PDF rendering):
      1. If the whole quote fits the budget, keep it.
      2. Otherwise take the FIRST sentence. If it fits, keep it whole.
      3. If the first sentence is also too long, truncate IT with an
         ellipsis. Do NOT skip to later sentences — the opening line of
         a complaint carries the specific allegation ("Hand-picked by
         Judge Richard Fisher…", "Ignored evidence…", "Lied under oath…")
         and dropping to whichever sentence happens to fit produces
         out-of-context fragments like "The system has stripped…".
    """
    text = _sanitize_quote_text(text)
    if not text:
        return ""
    if len(text) <= char_budget:
        return text

    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    first = sentences[0] if sentences else text
    if len(first) <= char_budget:
        return first

    if char_budget <= 1:
        return "…"
    trimmed = first[: max(1, char_budget - 1)].rstrip(" ,;:-")
    return f"{trimmed}…"


def story_quotes(spec: dict, n: int = 3) -> list[dict]:
    """Returns up to N {body, kind} dicts for Frame 3.

    Precedence — strict, EXCLUSIVE sources:
      1. spec.supabase.public_comments  (admin-curated court_actors.notes —
         the actor-SPECIFIC family quotes the state PDF shows for this
         exact actor). If ANY are present, the slide uses ONLY these.
      2. spec.supabase.family_reports   (survey_submissions.impact_quote —
         broad survey responses from submissions that mentioned this
         actor; not actor-specific). ONLY used when there are zero
         public_comments. We do not mix the two: a top-up from
         family_reports would put broad survey text alongside the PDF's
         actor-specific text on the same slide.

    Each raw body is then routed through select_best_quote so long
    quotes truncate cleanly to the per-frame char budget.
    """
    sb = spec.get("supabase") or {}
    comments = sb.get("public_comments") or []
    reports = sb.get("family_reports") or []

    raw_items: list[dict] = []

    def _add(raw: str, kind: str) -> None:
        text = (raw or "").strip()
        if not text:
            return
        raw_items.append({"raw": text, "kind": kind})

    if comments:
        for c in comments:
            if len(raw_items) >= n:
                break
            _add(c.get("comment_text") or "", "comment")
    else:
        for r in reports:
            if len(raw_items) >= n:
                break
            _add(r.get("body") or "", "family_report")

    target_count = max(4, min(n, len(raw_items))) if raw_items else 0
    char_budget = _quote_char_budget(target_count or n)

    out: list[dict] = []
    seen_keys: set[str] = set()
    for item in raw_items:
        body = select_best_quote(item["raw"], char_budget=char_budget)
        if not body:
            continue
        # Normalize for dedup: collapse whitespace and lowercase the full
        # body. Two quotes are "the same" only if their entire wording
        # matches after normalization.
        key = re.sub(r"\s+", " ", body).strip().lower()
        if key in seen_keys:
            continue
        seen_keys.add(key)
        out.append({"body": body, "kind": item["kind"]})
        if len(out) >= n:
            break
    return out


# ---------------------------------------------------------------------------
# Photo handling
# ---------------------------------------------------------------------------
def photo_block(spec: dict, web_mode: bool = False) -> str:
    """Render either the actor photo with a 60% navy overlay, or a placeholder.

    Real photos render ABOVE the flag layer so the flag doesn't bleed across
    the actor's face. Placeholder mode keeps the flag visible behind the
    gradient because the placeholder has no photo content to obscure.

    web_mode=True embeds the photo as a base64 data URL directly in the HTML.
    This avoids the iOS Safari canvas-tainting bug where html2canvas can't
    read a canvas that touched a non-data-URL image (even same-origin), which
    surfaces as "Save failed: The operation is insecure" when the Save/Share
    buttons try toBlob() on the rendered canvas. Data URLs are part of the
    document, so the canvas stays CORS-clean.

    Local file:// mode keeps the file:// URL with a cache-busting query so
    Chrome refetches when the photo is updated.
    """
    import base64

    photo = spec.get("photo") or {}
    rel = photo.get("path")
    if photo.get("exists") and rel:
        rel_path = Path(rel)
        full = (rel_path if rel_path.is_absolute() else (PHOTO_ROOT / rel_path)).resolve()
        try:
            cache_bust = f"?v={int(full.stat().st_mtime)}" if full.exists() else ""
        except OSError:
            cache_bust = ""

        if web_mode:
            # Embed as data URL — bulletproof against canvas tainting on iOS.
            try:
                data = full.read_bytes()
                mime = {
                    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                    ".webp": "image/webp", ".gif": "image/gif",
                }.get(full.suffix.lower(), "image/png")
                b64 = base64.b64encode(data).decode("ascii")
                url = f"data:{mime};base64,{b64}"
            except OSError:
                url = f"image_1080.png{cache_bust}"   # fallback to relative path
        else:
            url = f"file://{full}{cache_bust}"
        return (
            f'<div class="photo-bg photo-real" style="background-image:url(\'{url}\');">'
            f'<div class="photo-overlay"></div>'
            f"</div>"
        )
    return (
        '<div class="photo-bg photo-placeholder">'
        '<div class="ph-silhouette"></div>'
        '<div class="ph-overlay"></div>'
        '<div class="ph-tag">{{ACTOR.IMAGE_URL}} · 1080×1920 · pad-don\'t-crop</div>'
        "</div>"
    )


# ---------------------------------------------------------------------------
# Waving flag SVG (matches src/flag.jsx + Spotlight Stories v2)
# ---------------------------------------------------------------------------
def _star_points(cx: float, cy: float, r_outer: float, r_inner: float, n: int = 5) -> str:
    step = math.pi / n
    pts = []
    for i in range(n * 2):
        r = r_outer if i % 2 == 0 else r_inner
        a = i * step - math.pi / 2
        pts.append(f"{cx + math.cos(a) * r:.1f},{cy + math.sin(a) * r:.1f}")
    return " ".join(pts)


def flag_svg() -> str:
    stripe_h = 147.7  # 1920 / 13
    stripes = "\n".join(
        f'<rect x="0" y="{i * stripe_h:.1f}" width="1080" height="{stripe_h:.1f}" '
        f'fill="{"#9F1F2C" if i % 2 == 0 else "#F2EAD6"}" />'
        for i in range(13)
    )
    canton_h = stripe_h * 7
    stars: list[str] = []
    star_rows = 9
    canton_w = 480
    for r in range(star_rows):
        cols = 6 if r % 2 == 0 else 5
        for c in range(cols):
            x = ((0 if r % 2 == 0 else 0.5) + c) * (canton_w / 6) + 40
            y = (r + 0.5) * (canton_h / star_rows)
            stars.append(
                f'<polygon points="{_star_points(x, y, 18, 9, 5)}" fill="#ECE7DC" />'
            )

    return f"""
<svg viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <filter id="wave">
      <feTurbulence type="fractalNoise" baseFrequency="0.008 0.02" numOctaves="2" seed="3">
        <animate attributeName="baseFrequency" dur="14s" repeatCount="indefinite"
          values="0.008 0.02;0.012 0.024;0.008 0.02" />
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" scale="46" />
    </filter>
  </defs>
  <g filter="url(#wave)">
    {stripes}
    <rect x="0" y="0" width="{canton_w:.0f}" height="{canton_h:.1f}" fill="#10243F" />
    {"".join(stars)}
  </g>
</svg>
"""


# ---------------------------------------------------------------------------
# Reusable frame parts (Spotlight Stories v2 components, Python-rendered)
# ---------------------------------------------------------------------------
def state_badge(state: str, state_abbr: str, county: str) -> str:
    """Top-right STATE OF / [STATE] yellow stamp + small caption."""
    if county:
        # Strip trailing 'County' / 'Co.' / state suffix so we don't render 'COUNTY CO.'
        c = county.strip()
        c = re.sub(r"\s+(county|co\.?)\s*$", "", c, flags=re.IGNORECASE)
        c = re.sub(r"\s+ohio|\s+california|\s+texas|\s+florida|\s+kansas|\s+tennessee|\s+montana|\s+south carolina$", "", c, flags=re.IGNORECASE)
        c = c.strip()
        county_caption = f"{esc(state_abbr.upper())} · {esc(c.upper())} CO." if c else esc(state_abbr.upper())
    else:
        county_caption = esc(state_abbr.upper())
    return f"""
<div class="state-badge">
  <div class="sb-eyebrow">STATE OF</div>
  <div class="sb-stamp">{esc(state.upper())}</div>
  <div class="sb-caption">{county_caption}</div>
</div>
"""


def frame_tag(text: str) -> str:
    """JetBrains Mono top-left tag e.g. COURT ACTOR · EXPOSED."""
    return f'<div class="frame-tag">{esc(text)}</div>'


def actor_id_strip(first: str, last: str, role: str, state: str) -> str:
    """Bottom name + role/state strip above the MovementFoot."""
    name = " ".join(p for p in (first, last) if p).upper()
    return f"""
<div class="actor-id-strip">
  <div class="aid-name">{esc(name)}</div>
  <div class="aid-role">{esc(role)} · {esc(state)}</div>
</div>
"""


def movement_foot() -> str:
    """Very bottom: @STANDWITHMEG | STANDWITHMEG.COM."""
    return """
<div class="movement-foot">
  <div class="mf-handle">@STANDWITHMEG</div>
  <div class="mf-url">STANDWITHMEG.COM</div>
</div>
"""


def legal_foot() -> str:
    return '<div class="legal">Family-reported submissions · not court findings.</div>'


def frame_actions(num: int) -> str:
    return f"""
<div class="frame-actions" aria-label="Frame {num} actions">
  <button type="button" data-save="frame-{num:02d}">Save image</button>
  <button type="button" data-share="frame-{num:02d}">Share</button>
</div>
"""


# ---------------------------------------------------------------------------
# Six frame compositions — matches Spotlight Stories v2.html
# ---------------------------------------------------------------------------
def frame_1_who(actor: dict, role: str, court: str, state: str, state_abbr: str, county: str,
                actor_family_count: Any, state_family_count: Any, spec: dict, big_name_html: str,
                web_mode: bool = False) -> str:
    """Frame 1 cover — uses the actor's public family count, matching the card.

    When a real photo is wired, we add `has-real-photo` so the dossier overlays
    (grain, scanlines, vignette, top photo-overlay) dial back and the face stays clear.

    state_family_count is the statewide Registry total (e.g. 321 CA families).
    Rendered as a small caption below the actor count when present; hidden
    entirely when missing so we never show "0" or "Review" to the public.
    """
    has_photo = bool((spec.get("photo") or {}).get("exists"))
    extra_class = " has-real-photo" if has_photo else ""

    state_count_html = ""
    try:
        state_count_int = int(float(state_family_count)) if state_family_count not in (None, "") else 0
    except (TypeError, ValueError):
        state_count_int = 0
    if state_count_int > 0 and state_abbr:
        state_count_html = (
            f'<div class="f1-state-count">'
            f'<b>{state_count_int:,}</b> {esc(state_abbr.upper())} families in the Registry'
            f'</div>'
        )

    return f"""
<article class="frame f1{extra_class}" id="frame-01">
  {photo_block(spec, web_mode=web_mode)}
  <div class="flag-bg flag-bg--cover">{flag_svg()}</div>
  <div class="grain"></div>
  <div class="scanlines"></div>
  <div class="vignette"></div>
  {state_badge(state, state_abbr, county)}
  {frame_tag("COURT ACTOR · EXPOSED")}
  <div class="f1-headline">
    <div class="display xl">{big_name_html}</div>
    <div class="f1-role">{esc(role)}</div>
    <div class="f1-report-count">
      <b>{fmt_int(actor_family_count)}</b>
      <span>families named this person on the public record</span>
    </div>
    {state_count_html}
  </div>
  {movement_foot()}
  {legal_foot()}
</article>
"""


def frame_2_they_thought(state: str, state_abbr: str, county: str, first: str, last: str, role: str) -> str:
    return f"""
<article class="frame f2" id="frame-02">
  <div class="flag-bg">{flag_svg()}</div>
  <div class="grain"></div>
  <div class="scanlines"></div>
  <div class="vignette"></div>
  {state_badge(state, state_abbr, county)}
  {frame_tag("NOT ANY MORE")}
  <div class="f2-headline">
    <div class="display xl">
      THEY THOUGHT<br>
      THEY COULD<br>
      <span class="red-bar">KEEP US</span><br>
      <span class="gold">QUIET.</span>
    </div>
    <div class="not-any-more-stamp">Not any more!</div>
  </div>
  {actor_id_strip(first, last, role, state)}
  {movement_foot()}
  {legal_foot()}
</article>
"""


def frame_3_pull_quote(quotes: list[dict], state: str, state_abbr: str, county: str,
                      first: str, last: str, role: str) -> str:
    """Stacks up to 6 family quotes on Frame 3, each in italic Fraunces with a small
    crimson bullet and 'Anonymous parent · STATE' attribution."""
    if not quotes:
        # Fallback: single empathic placeholder so the frame still composes
        quotes = [{"body": "Families are adding their reports to the public record.", "kind": "placeholder"}]

    quote_blocks = []
    for q in quotes:
        body = q.get("body") or ""
        if not body:
            continue
        quote_blocks.append(
            f'<div class="f3-quote">'
            f'<span class="f3-dot"></span>'
            f'<p class="f3-text">{esc(body)}</p>'
            f'<p class="f3-attr">— Anonymous parent · {esc(state_abbr.upper())}</p>'
            f'</div>'
        )

    quotes_html = "".join(quote_blocks)
    quote_count_class = f" f3-count-{len(quote_blocks)}" if quote_blocks else ""

    return f"""
<article class="frame f3" id="frame-03">
  <div class="flag-bg flag-bg--faded">{flag_svg()}</div>
  <div class="grain"></div>
  <div class="scanlines"></div>
  <div class="vignette"></div>
  {state_badge(state, state_abbr, county)}
  {frame_tag("WHAT FAMILIES SAY")}
  <div class="f3-body{quote_count_class}">
    {quotes_html}
  </div>
  {actor_id_strip(first, last, role, state)}
  {movement_foot()}
  {legal_foot()}
</article>
"""


def frame_4_counted(state: str, state_abbr: str, county: str, first: str, last: str, role: str,
                   movement_total: Any) -> str:
    """Center content stacks as a flex column so each line gets its own
    vertical slot — no more overlap between the italic and the pattern."""
    return f"""
<article class="frame f4" id="frame-04">
  <div class="flag-bg">{flag_svg()}</div>
  <div class="grain"></div>
  <div class="scanlines"></div>
  <div class="vignette"></div>
  {state_badge(state, state_abbr, county)}
  {frame_tag("COUNTED · PUBLIC RECORD")}
  <div class="f4-stack">
    <div class="f4-mega-number">{fmt_int(movement_total)}</div>
    <div class="f4-mega-label">FAMILIES<br>NATIONWIDE</div>
    <div class="f4-italic">— and now global.</div>
    <div class="f4-pattern">
      Not an <span class="strike">ISOLATED</span> incident.<br>
      <span class="pattern-pill">A PATTERN.</span>
    </div>
  </div>
  {actor_id_strip(first, last, role, state)}
  {movement_foot()}
  {legal_foot()}
</article>
"""


def frame_5_exposing(state: str, state_abbr: str, county: str, stats: dict) -> str:
    burden = fmt_money(first_nonempty(stats.get("median_financial_loss"), stats.get("avg_financial_loss")))
    pro_se = fmt_pct(stats.get("pro_se_pct"))
    months = fmt_months(first_nonempty(stats.get("median_months_lost"), stats.get("avg_months_lost")))
    return f"""
<article class="frame f5" id="frame-05">
  <div class="flag-bg">{flag_svg()}</div>
  <div class="grain"></div>
  <div class="scanlines"></div>
  <div class="vignette"></div>
  {state_badge(state, state_abbr, county)}
  {frame_tag("EXPOSING THE PATTERN")}
  <div class="f5-headline">
    What the<br>
    <span class="gold">government</span><br>
    is doing to<br>
    our families.
  </div>
  <div class="f5-stats">
    <div class="f5-stats-label">STATE OF {esc(state.upper())} · LIVE STATS</div>
    <div class="stat-row">
      <span class="stat-n">{burden}</span>
      <span class="stat-l">MEDIAN FAMILY BURDEN</span>
    </div>
    <div class="stat-row">
      <span class="stat-n">{pro_se}</span>
      <span class="stat-l">PARENTS FORCED PRO SE</span>
    </div>
    <div class="stat-row">
      <span class="stat-n">{months}</span>
      <span class="stat-l">MEDIAN TIME LOST</span>
    </div>
  </div>
  {movement_foot()}
  {legal_foot()}
</article>
"""


def frame_6_stand_with_meg(state: str, state_abbr: str, county: str, movement_total: Any, cta: str) -> str:
    return f"""
<article class="frame f6" id="frame-06">
  <div class="flag-bg flag-bg--cover">{flag_svg()}</div>
  <div class="grain"></div>
  <div class="scanlines"></div>
  <div class="vignette"></div>
  {state_badge(state, state_abbr, county)}
  {frame_tag("JOIN THE MOVEMENT")}
  <div class="f6-headline">
    STAND<br>
    <span class="red-bar f6-with">WITH</span><br>
    <span class="gold">MEG.</span>
  </div>
  <div class="f6-cta-text">
    Join over <b class="f6-count">{fmt_int(movement_total)}</b><br>
    families nationwide &amp; global<br>
    exposing the truth.
  </div>
  <div class="f6-pill-stack">
    <div class="f6-visit">VISIT</div>
    <div class="url-pill"><span class="dot"></span>{esc(cta).replace(' ↗', '').replace('↗', '')}</div>
  </div>
  <div class="legal f6-legal">FAMILY-REPORTED · NOT COURT FINDINGS</div>
</article>
"""


# ---------------------------------------------------------------------------
# Main render
# ---------------------------------------------------------------------------
def render(spec: dict, web_mode: bool = False) -> str:
    actor = spec.get("actor") or {}
    stats = spec.get("state_stats") or {}
    supabase = spec.get("supabase") or {}

    first = (actor.get("first_name") or "").strip()
    last = (actor.get("last_name") or "").strip()
    title = (actor.get("title") or "").strip()
    display_name = actor.get("display_name") or " ".join(p for p in (first, last) if p).strip()
    role = expand_acronyms(actor.get("role") or "Public court actor")
    court = first_nonempty(actor.get("court_or_county"), actor.get("court"), actor.get("county")) or ""
    county = first_nonempty(actor.get("county"), actor.get("court_or_county")) or ""
    state = actor.get("state") or ""
    state_abbr = (actor.get("state_abbr") or "").upper()
    # actor.public_family_count is the value /api/survey/court-actors returns
    # for this actor — the same count the public card shows. Prefer it above
    # every locally-computed fallback so the share slide and the card cannot
    # disagree (Dianna Russell regression: spec had family_count=3 while the
    # API card showed 4 because of an alias-resolution gap in the local
    # mirror). The legacy fields stay as fallbacks for older specs that
    # predate the public_family_count writer.
    actor_family_count = first_nonempty(
        actor.get("public_family_count"),
        supabase.get("public_family_count"),
        actor.get("family_count"),
        supabase.get("family_count"),
        actor.get("actor_report_count"),
        supabase.get("actor_report_count"),
        supabase.get("report_count"),
        actor.get("mention_count"),
        0,
    )
    # Statewide Registry total — pulled live from spotlight_build's Supabase
    # resolver (state_stats.state_family_count, dashboard-matching value).
    # Falls back to total_submissions for backwards compatibility with older
    # specs. Rendered separately from the actor count so a small actor count
    # (e.g. 3 families named) sits alongside the much larger state total
    # (e.g. 321 CA families in the Registry) without confusion.
    state_family_count = first_nonempty(
        stats.get("state_family_count"),
        stats.get("total_submissions"),
    )
    movement_total = spec.get("movement_total")
    cta = (spec.get("cta") or "STANDWITHMEG.COM").replace("/SURVEY", "").replace("/survey", "")

    quote_text, quote_kind = story_quote(spec)   # legacy single-quote (kept for any callers)
    quotes_for_frame_3 = story_quotes(spec, n=6)

    # Big-name HTML — handle empty first gracefully
    if first and last:
        big_name_html = f"{esc(first.upper())}<br><span class=\"gold\">{esc(last.upper())}</span>"
    elif last:
        big_name_html = f"<span class=\"gold\">{esc(last.upper())}</span>"
    else:
        big_name_html = f"<span class=\"gold\">{esc(display_name.upper())}</span>"

    cards = [
        frame_1_who(actor, role, court, state, state_abbr, county, actor_family_count, state_family_count, spec, big_name_html, web_mode=web_mode),
        frame_2_they_thought(state, state_abbr, county, first, last, role),
        frame_3_pull_quote(quotes_for_frame_3, state, state_abbr, county, first, last, role),
        frame_4_counted(state, state_abbr, county, first, last, role, movement_total),
        frame_5_exposing(state, state_abbr, county, stats),
        frame_6_stand_with_meg(state, state_abbr, county, movement_total, cta),
    ]

    sections = "\n".join(
        f'<section class="phone-frame">{cards[i]}{frame_actions(i + 1)}</section>'
        for i in range(6)
    )

    unresolved = spec.get("unresolved") or []
    unresolved_html = "".join(f"<li>{esc(item)}</li>" for item in unresolved) or "<li>No unresolved fields recorded.</li>"
    spec_path_label = esc(spec.get("export_dir") or "")
    public_route = esc((spec.get("public_share") or {}).get("recommended_route", ""))

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(display_name)} · Stand With Meg · Story Spotlight</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@500;700&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet">
<!-- Frames are pre-rendered server-side; we just need JSZip to bundle the Save All download. -->
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
<style>
:root {{
  --navy:#0B1A2D; --navy-deep:#050A14; --gold:#C9A227; --gold-soft:#E0B93C;
  --crimson:#B91C1C; --crimson-hot:#EF4444; --cream:#F2EAD6; --white:#F5F5F5;
}}
* {{ box-sizing:border-box; margin:0; padding:0; }}
html,body {{ background:#06070A; color:var(--white); font-family:Inter,system-ui,sans-serif; min-height:100vh; }}
.topbar {{ position:sticky; top:0; z-index:50; padding:14px 16px; background:rgba(6,7,10,.9); border-bottom:1px solid rgba(201,162,39,.25); backdrop-filter:blur(14px); }}
.topbar b {{ display:block; font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:.24em; color:var(--gold); text-transform:uppercase; }}
.topbar span {{ display:block; margin-top:4px; color:rgba(245,245,245,.66); font-size:13px; line-height:1.4; }}
.share-scroll {{ width:min(100%,540px); margin:0 auto; padding:18px 12px 48px; }}

/* Bulk action bar — Save All / Share All buttons under the topbar */
.bulk-bar {{
  width:min(100%,540px); margin:18px auto 0; padding:0 12px;
  display:grid; grid-template-columns:1fr 1fr; gap:10px;
}}
.bulk-btn {{
  display:flex; align-items:center; justify-content:center; gap:10px;
  padding:14px 16px; border-radius:12px; cursor:pointer;
  font-family:'Oswald',sans-serif; font-weight:700; font-size:14px;
  letter-spacing:.14em; text-transform:uppercase;
  transition:transform .12s, opacity .12s;
}}
.bulk-btn:hover {{ transform:translateY(-1px); }}
.bulk-btn:active {{ transform:translateY(1px); }}
.bulk-btn:disabled {{ opacity:.65; cursor:wait; transform:none; }}
.bulk-save {{
  background:var(--gold); color:#0F1E30; border:none;
  box-shadow:0 8px 22px rgba(201,162,39,.35);
}}
.bulk-share {{
  background:var(--crimson); color:#fff; border:none;
  box-shadow:0 8px 22px rgba(185,28,28,.35);
}}
.bulk-icon {{ font-size:16px; }}
.bulk-progress {{
  width:min(100%,540px); margin:8px auto 0; padding:0 12px;
  font-family:'JetBrains Mono',monospace; font-size:11px;
  letter-spacing:.18em; color:var(--gold); text-transform:uppercase;
  text-align:center; min-height:14px;
}}
.phone-frame {{ margin:0 0 32px; }}

/* Story card — 9:16, rounded, deep navy gradient */
.frame {{
  position:relative; width:100%; aspect-ratio:9/16; overflow:hidden;
  border-radius:22px;
  background:linear-gradient(180deg,#0B1A2D 0%, #050A14 100%);
  box-shadow:0 28px 70px rgba(0,0,0,.62),0 0 0 1px rgba(255,255,255,.06);
  color:var(--white);
  font-family:Inter,sans-serif;
  isolation:isolate;
}}

/* Photo (Frame 1) */
.photo-bg {{
  position:absolute; inset:0; z-index:0;
  background-size:cover; background-position:center 25%;
}}
/* Real photo lifts above the flag (z:1) so stripes/stars don't print across the face,
   but stays below grain (z:5), scanlines (z:6), and vignette (z:7) so the photo still
   gets the dossier-style overlay treatment. */
.photo-bg.photo-real {{ z-index:2; }}
.photo-overlay {{
  position:absolute; inset:0;
  background:linear-gradient(180deg,rgba(11,26,45,.18) 0%, rgba(5,10,20,.78) 100%);
}}
/* When the face is a real photo, dial back the overlays so the actor is clear.
   Keep enough darkness at the bottom for the headline + label area to stay readable. */
.frame.has-real-photo .photo-overlay {{
  background:linear-gradient(180deg,
    rgba(11,26,45,0) 0%,
    rgba(11,26,45,0) 35%,
    rgba(5,10,20,.55) 70%,
    rgba(5,10,20,.92) 100%);
}}
.frame.has-real-photo .grain {{ opacity:.28; mix-blend-mode:soft-light; }}
.frame.has-real-photo .scanlines {{
  background:repeating-linear-gradient(to bottom, rgba(0,0,0,.07) 0 1px, transparent 1px 6px);
}}
.frame.has-real-photo .vignette {{
  background:radial-gradient(ellipse at center 38%, transparent 55%, rgba(0,0,0,.55) 100%);
}}
.frame.has-real-photo .flag-bg--cover {{ opacity:0; }}
.photo-placeholder {{
  background:radial-gradient(ellipse at 50% 35%, #4B5867 0%, #2A3B52 40%, #14253A 75%, #050A14 100%);
}}
.ph-silhouette {{
  position:absolute; left:50%; top:24%; transform:translateX(-50%);
  width:62%; height:36%;
  background:
    radial-gradient(ellipse 36% 26% at 50% 22%, rgba(245,235,210,.45) 0%, transparent 60%),
    radial-gradient(ellipse 44% 52% at 50% 70%, rgba(30,40,55,.8) 0%, transparent 75%);
  filter:blur(2px);
}}
.ph-overlay {{
  position:absolute; inset:0;
  background:linear-gradient(180deg, rgba(11,26,45,.32) 0%, rgba(11,26,45,.85) 100%);
}}
.ph-tag {{
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  font-family:'JetBrains Mono',monospace; font-size:clamp(8px,1.7cqw,11px);
  letter-spacing:.3em; color:rgba(201,162,39,.6); text-transform:uppercase;
  border:1.5px dashed rgba(201,162,39,.5); padding:8px 12px;
  text-align:center; max-width:80%;
}}

/* Flag wave layer */
.flag-bg {{ position:absolute; inset:0; z-index:1; opacity:.22; filter:blur(2px); }}
.flag-bg svg {{ width:100%; height:100%; }}
.flag-bg--cover {{ opacity:.32; filter:blur(2px); mix-blend-mode:screen; }}
.flag-bg--faded {{ opacity:.14; filter:blur(6px); }}

/* Grain + scanlines + vignette */
.grain {{
  position:absolute; inset:0; z-index:5; pointer-events:none;
  opacity:.7; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.7  0 0 0 0 0.7  0 0 0 0 0.7  0 0 0 0.22 0'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.6'/></svg>");
}}
.scanlines {{
  position:absolute; inset:0; z-index:6; pointer-events:none;
  background:repeating-linear-gradient(to bottom, rgba(0,0,0,.18) 0 1px, transparent 1px 5px);
  mix-blend-mode:multiply;
}}
.vignette {{
  position:absolute; inset:0; z-index:7; pointer-events:none;
  background:radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,.78) 100%);
}}

/* State badge top-right (the yellow OHIO stamp) */
.state-badge {{
  position:absolute; top:5%; right:5%; z-index:25;
  display:flex; flex-direction:column; align-items:flex-end; gap:6px;
}}
.sb-eyebrow {{
  font-family:'JetBrains Mono',monospace; letter-spacing:.3em;
  color:rgba(242,234,214,.6); text-transform:uppercase;
  font-size:clamp(8px,1.6cqw,11px);
}}
.sb-stamp {{
  display:inline-block; background:var(--gold); color:#0A0A0A;
  font-family:'Anton',sans-serif; letter-spacing:.02em; line-height:1;
  padding:6px 14px 4px; text-transform:uppercase;
  box-shadow:0 8px 24px rgba(0,0,0,.5);
  font-size:clamp(28px,6cqw,42px);
}}
.sb-caption {{
  font-family:'Oswald',sans-serif; font-weight:700; letter-spacing:.22em;
  color:#F5F5F5; text-transform:uppercase;
  font-size:clamp(9px,2cqw,13px);
}}

/* Top-left frame tag */
.frame-tag {{
  position:absolute; top:5%; left:5%; z-index:25;
  font-family:'JetBrains Mono',monospace; letter-spacing:.3em;
  color:var(--gold); text-transform:uppercase;
  font-size:clamp(8px,1.8cqw,13px);
}}

/* Display headlines */
.display {{
  font-family:'Anton',sans-serif; text-transform:uppercase; letter-spacing:-.02em;
  line-height:1.05; text-shadow:0 8px 0 rgba(0,0,0,.4);
}}
.display.xl {{ font-size:clamp(48px,15cqw,98px); }}
.display .gold {{ color:var(--gold); }}
.gold {{ color:var(--gold); }}

/* Frame 1 — cover */
.f1-headline {{
  position:absolute; left:5%; right:5%; bottom:18%; z-index:25;
}}
.f1-role {{
  margin-top:14px; font-family:'Fraunces',serif; font-style:italic;
  color:rgba(245,245,245,.92); line-height:1.25;
  font-size:clamp(14px,3.4cqw,22px);
}}
.f1-report-count {{
  margin-top:16px; display:flex; align-items:flex-end; gap:14px;
  border-top:2px solid rgba(201,162,39,.8); padding-top:12px;
}}
.f1-report-count b {{
  font-family:'Anton',sans-serif; color:var(--gold); line-height:.85;
  font-size:clamp(40px,11cqw,72px);
}}
.f1-report-count span {{
  font-family:'Oswald',sans-serif; letter-spacing:.16em;
  text-transform:uppercase; color:rgba(245,245,245,.82);
  font-size:clamp(10px,2.4cqw,15px); padding-bottom:6px;
}}
/* Statewide Registry total — small caption under the actor count.
   Sits inside f1-headline (bottom:18%) above movement-foot (bottom:5%),
   so it never collides with the state badge, quotes, or footer. */
.f1-state-count {{
  margin-top:10px;
  font-family:'Oswald',sans-serif; font-weight:600;
  letter-spacing:.18em; text-transform:uppercase;
  color:rgba(245,245,245,.7);
  font-size:clamp(10px,2.2cqw,13px);
}}
.f1-state-count b {{
  color:var(--gold); font-weight:700;
  font-family:'JetBrains Mono',monospace;
  letter-spacing:.04em;
}}

/* Frame 2 — they thought */
.f2-headline {{ position:absolute; left:5%; right:5%; top:22%; z-index:25; }}
.red-bar {{
  position:relative; display:inline-block; color:#F5F5F5;
  padding:0 .12em;
}}
.red-bar::before {{
  content:""; position:absolute; left:-6px; right:-6px; top:18%; bottom:18%;
  background:var(--crimson); transform:skewX(-6deg); z-index:-1;
}}
.not-any-more-stamp {{
  display:inline-block; margin-top:24px;
  background:var(--gold); color:#0A0A0A;
  font-family:'Anton',sans-serif; letter-spacing:.01em; text-transform:uppercase;
  padding:6px 22px 10px; line-height:1;
  box-shadow:8px 8px 0 rgba(0,0,0,.6);
  font-size:clamp(36px,10cqw,72px);
  transform:rotate(-3deg); transform-origin:left center;
}}

/* Frame 3 — stacked pull quotes (up to 3) */
.f3-body {{
  position:absolute; left:6%; right:6%; top:14%; bottom:28%; z-index:25;
  display:flex; flex-direction:column; justify-content:center;
  gap:clamp(14px,3cqw,26px);
}}
.f3-body.f3-count-4,
.f3-body.f3-count-5,
.f3-body.f3-count-6 {{
  top:12%;
  bottom:24%;
  justify-content:flex-start;
  gap:clamp(8px,1.8cqw,14px);
}}
.f3-quote {{
  position:relative; padding-left:clamp(14px,2.8cqw,22px);
  border-left:3px solid var(--gold);
}}
.f3-dot {{
  position:absolute; left:-8px; top:0;
  width:14px; height:14px; border-radius:50%;
  background:var(--crimson);
  box-shadow:0 0 0 4px var(--navy-deep);
}}
.f3-text {{
  font-family:'Fraunces',serif; font-weight:500; font-style:italic;
  line-height:1.22; color:var(--white);
  font-size:clamp(15px,4.2cqw,26px);
}}
.f3-attr {{
  margin-top:clamp(6px,1.6cqw,12px);
  font-family:'Oswald',sans-serif; font-weight:600; letter-spacing:.18em;
  color:rgba(245,245,245,.7);
  font-size:clamp(9px,2.2cqw,13px);
  text-transform:uppercase;
}}
/* When only one quote exists, bump it up to the original hero size */
.f3-body.f3-count-1 .f3-text {{
  font-size:clamp(22px,6cqw,42px); line-height:1.18;
}}
.f3-body.f3-count-1 .f3-attr {{
  font-size:clamp(11px,2.6cqw,15px); margin-top:clamp(18px,3cqw,28px);
}}
.f3-body.f3-count-4 .f3-text {{
  font-size:clamp(14px,3.4cqw,22px);
  line-height:1.16;
}}
.f3-body.f3-count-5 .f3-text {{
  font-size:clamp(13px,3.1cqw,20px);
  line-height:1.14;
}}
.f3-body.f3-count-6 .f3-text {{
  font-size:clamp(12px,2.8cqw,18px);
  line-height:1.12;
}}
.f3-body.f3-count-4 .f3-attr,
.f3-body.f3-count-5 .f3-attr,
.f3-body.f3-count-6 .f3-attr {{
  margin-top:clamp(4px,1.2cqw,8px);
  font-size:clamp(8px,1.8cqw,11px);
}}

/* Frame 4 — counted. Flex column inside an absolute wrapper so each line
   claims its own vertical slot. No more pattern colliding with the italic. */
.f4-stack {{
  position:absolute; left:5%; right:5%; top:14%; bottom:28%; z-index:25;
  display:flex; flex-direction:column; justify-content:center;
  gap:clamp(8px,2cqw,18px); text-align:center;
}}
.f4-mega-number {{
  font-family:'Anton',sans-serif; line-height:.82; letter-spacing:-.04em;
  color:var(--gold);
  font-size:clamp(110px,34cqw,240px);
  text-shadow:0 10px 0 rgba(0,0,0,.4), 0 24px 80px rgba(201,162,39,.35);
}}
.f4-mega-label {{
  font-family:'Anton',sans-serif; text-transform:uppercase;
  letter-spacing:-.01em; line-height:1.05; color:#F5F5F5;
  font-size:clamp(38px,10cqw,72px);
}}
.f4-italic {{
  font-family:'Fraunces',serif; font-style:italic;
  color:rgba(245,245,245,.8);
  font-size:clamp(14px,3.4cqw,22px);
  margin-bottom:clamp(8px,2cqw,16px);
}}
.f4-pattern {{
  font-family:'Anton',sans-serif; text-transform:uppercase;
  color:#F5F5F5; line-height:1.18;
  font-size:clamp(22px,6.2cqw,44px);
}}
.f4-pattern .strike {{
  text-decoration:line-through; text-decoration-color:var(--crimson);
  text-decoration-thickness:5px; color:rgba(245,245,245,.45);
}}
.f4-pattern .pattern-pill {{
  display:inline-block; background:var(--gold); color:#0A0A0A;
  padding:2px 14px; margin-top:6px;
}}

/* Frame 5 — exposing the pattern */
.f5-headline {{
  position:absolute; left:5%; right:5%; top:14%; z-index:25;
  font-family:'Anton',sans-serif; color:#F5F5F5; text-transform:uppercase;
  letter-spacing:-.02em; line-height:1.04;
  font-size:clamp(40px,11cqw,86px);
}}
.f5-stats {{
  position:absolute; left:5%; right:5%; bottom:24%; z-index:25;
  border-top:3px solid var(--gold); padding-top:14px;
  display:flex; flex-direction:column; gap:8px;
}}
.f5-stats-label {{
  font-family:'JetBrains Mono',monospace; letter-spacing:.26em;
  color:rgba(245,245,245,.55); text-transform:uppercase;
  margin-bottom:8px; font-size:clamp(8px,2cqw,12px);
}}
.stat-row {{
  display:flex; justify-content:space-between; align-items:baseline;
  border-bottom:1px solid rgba(245,245,245,.18); padding-bottom:8px;
}}
.stat-row .stat-n {{
  font-family:'Anton',sans-serif; color:var(--gold); line-height:1;
  font-size:clamp(28px,8cqw,52px);
}}
.stat-row .stat-l {{
  font-family:'Oswald',sans-serif; font-weight:600; letter-spacing:.14em;
  color:#F5F5F5; text-align:right; text-transform:uppercase;
  font-size:clamp(9px,2.2cqw,14px);
}}

/* Frame 6 — STAND WITH MEG */
.f6-headline {{
  position:absolute; left:5%; right:5%; top:14%; z-index:25;
  font-family:'Anton',sans-serif; text-transform:uppercase;
  letter-spacing:-.02em; line-height:1.05;
  color:#F5F5F5; text-align:center;
  font-size:clamp(70px,22cqw,160px);
}}
.f6-with {{ display:inline-block; }}
.f6-cta-text {{
  position:absolute; left:5%; right:5%; top:58%; z-index:25;
  font-family:'Fraunces',serif; font-style:italic;
  color:rgba(245,245,245,.9); text-align:center; line-height:1.25;
  font-size:clamp(15px,4cqw,30px);
}}
.f6-cta-text .f6-count {{
  color:var(--gold); font-weight:900; font-style:normal; font-family:'Anton',sans-serif;
}}
.f6-pill-stack {{
  position:absolute; left:0; right:0; bottom:14%; z-index:25;
  display:flex; flex-direction:column; align-items:center; gap:14px;
}}
.f6-visit {{
  font-family:'Oswald',sans-serif; font-weight:700; letter-spacing:.2em;
  color:rgba(245,245,245,.7); text-transform:uppercase;
  font-size:clamp(14px,3.4cqw,22px);
}}
.url-pill {{
  display:inline-flex; align-items:center; gap:12px;
  padding:14px 22px; border-radius:999px; background:#F5F5F5; color:#0B1A2D;
  font-family:'Oswald',sans-serif; font-weight:700; letter-spacing:.14em;
  text-transform:uppercase; box-shadow:0 12px 36px rgba(0,0,0,.55);
  font-size:clamp(18px,5.2cqw,32px);
}}
.url-pill .dot {{
  width:14px; height:14px; border-radius:50%; background:var(--crimson);
  animation:pulse 1.5s infinite;
}}
@keyframes pulse {{ 0%,100% {{ opacity:1; transform:scale(1);}} 50% {{ opacity:.4; transform:scale(.7);}} }}
.f6-legal {{
  position:absolute; left:5%; right:5%; bottom:5%; z-index:25;
  font-family:'JetBrains Mono',monospace; letter-spacing:.22em;
  color:rgba(245,245,245,.45); text-align:center; text-transform:uppercase;
  font-size:clamp(8px,1.7cqw,11px);
}}

/* Bottom strips (frames 2–5) */
.actor-id-strip {{
  position:absolute; left:5%; right:5%; bottom:14%; z-index:25;
  border-top:3px solid var(--gold); padding-top:12px;
}}
.aid-name {{
  font-family:'Oswald',sans-serif; font-weight:700; letter-spacing:.1em;
  color:#F5F5F5; text-transform:uppercase; line-height:1.1;
  font-size:clamp(16px,4.4cqw,28px);
}}
.aid-role {{
  margin-top:4px; font-family:'Fraunces',serif; font-style:italic;
  color:rgba(245,245,245,.8);
  font-size:clamp(12px,2.8cqw,18px);
}}

.movement-foot {{
  position:absolute; left:5%; right:5%; bottom:5%; z-index:25;
  display:flex; justify-content:space-between; align-items:center;
  border-top:1px solid rgba(245,245,245,.18); padding-top:12px;
}}
.mf-handle {{
  font-family:'Oswald',sans-serif; font-weight:600; letter-spacing:.18em;
  color:rgba(245,245,245,.7); text-transform:uppercase;
  font-size:clamp(10px,2.4cqw,16px);
}}
.mf-url {{
  font-family:'JetBrains Mono',monospace; letter-spacing:.24em;
  color:rgba(245,245,245,.55); text-transform:uppercase;
  font-size:clamp(10px,2.4cqw,16px);
}}

.legal {{
  position:absolute; left:5%; right:5%; bottom:1.5%; z-index:25;
  font-family:'JetBrains Mono',monospace; letter-spacing:.14em;
  color:rgba(245,245,245,.4); text-align:center; text-transform:uppercase;
  font-size:clamp(7px,1.5cqw,10px);
}}

/* Frame containers use container queries so cqw scales fonts to frame width */
.frame {{ container-type:inline-size; }}

/* Action buttons under each frame */
.frame-actions {{ display:flex; gap:10px; padding:10px 4px 0; }}
.frame-actions button {{
  flex:1; border:1px solid rgba(201,162,39,.35); border-radius:10px;
  padding:11px 10px; background:rgba(201,162,39,.12); color:var(--white);
  font-weight:800; font-size:13px; cursor:pointer;
}}

/* Audit notes drawer */
.review {{ width:min(100%,540px); margin:0 auto 48px; padding:0 12px; }}
.review details {{
  border:1px solid rgba(201,162,39,.25); border-radius:12px;
  padding:12px 14px; background:rgba(255,255,255,.035); color:rgba(245,245,245,.78);
}}
.review summary {{
  cursor:pointer; color:var(--gold);
  font-family:'JetBrains Mono',monospace; font-size:12px;
  letter-spacing:.16em; text-transform:uppercase;
}}
.review li {{ margin:8px 0; }}

@media (min-width:760px) {{ .share-scroll {{ padding-top:28px; }} }}
</style>
</head>
<body>
<header class="topbar">
  <b>Story-ready share draft · Stand With Meg v2</b>
  <span>{esc(display_name)} · {esc(state)} · review before posting. Suggested public route: {public_route}</span>
</header>
<div class="bulk-bar">
  <button type="button" id="save-all-btn" class="bulk-btn bulk-save">
    <span class="bulk-icon">⇩</span><span class="bulk-label">Save 6 images</span>
  </button>
  <button type="button" id="share-all-btn" class="bulk-btn bulk-share">
    <span class="bulk-icon">↗</span><span class="bulk-label">Share 6 images</span>
  </button>
</div>
<div class="bulk-progress" id="bulk-progress"></div>
<main class="share-scroll">
{sections}
</main>
<aside class="review">
  <details>
    <summary>Audit notes</summary>
    <p>Spec source: <code>{spec_path_label}</code></p>
    <ul>{unresolved_html}</ul>
  </details>
</aside>
<script>
// Frames are pre-rendered server-side by _scripts/prerender_frames.py (Playwright).
// We fetch the JPEGs directly — no client-side canvas, so iOS Safari can't taint anything.
async function frameToBlob(id) {{
  // frame-01.jpg ... frame-06.jpg live in the same folder as share.html
  const num = id.replace('frame-', '');
  const url = `frame-${{num}}.jpg`;
  const res = await fetch(url, {{ cache: 'reload' }});
  if (!res.ok) throw new Error(`Couldn't fetch ${{url}}: HTTP ${{res.status}}`);
  return await res.blob();
}}

async function saveFrame(id) {{
  const btn = document.querySelector(`[data-save="${{id}}"]`);
  const orig = btn ? btn.textContent : null;
  if (btn) btn.textContent = 'Saving…';
  try {{
    const blob = await frameToBlob(id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = id + '.jpg';
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    if (btn) btn.textContent = '✓ Saved';
  }} catch (e) {{
    console.error(e);
    alert('Save failed: ' + (e.message || e) +
          '\\nFallback: take a screenshot — Cmd+Shift+4 on Mac, Power+Vol-Up on phone.');
    if (btn && orig) btn.textContent = orig;
    return;
  }}
  setTimeout(() => {{ if (btn && orig) btn.textContent = orig; }}, 1800);
}}

async function shareFrame(id) {{
  const btn = document.querySelector(`[data-share="${{id}}"]`);
  const orig = btn ? btn.textContent : null;
  if (btn) btn.textContent = 'Preparing…';
  try {{
    const blob = await frameToBlob(id);
    const file = new File([blob], id + '.jpg', {{ type: 'image/jpeg' }});

    // Best path: share the IMAGE (Web Share API Level 2 — iOS Safari, Android Chrome).
    if (navigator.canShare && navigator.canShare({{ files: [file] }})) {{
      await navigator.share({{
        files: [file],
        title: document.title,
        text: 'Court actor on the public record. StandWithMeg.com',
      }});
      if (btn) btn.textContent = '✓ Shared';
    }} else if (navigator.share) {{
      // Fallback: share the page link
      await navigator.share({{
        title: document.title,
        text: 'StandWithMeg.com',
        url: location.href + '#' + id,
      }});
      if (btn) btn.textContent = '✓ Shared';
    }} else {{
      // Final fallback: copy URL to clipboard
      await navigator.clipboard.writeText(location.href + '#' + id);
      alert('Image sharing not supported here. Frame link copied to clipboard instead.');
      if (btn) btn.textContent = '✓ Link copied';
    }}
  }} catch (e) {{
    // User cancellation is normal — don't show an error for that
    if (e.name !== 'AbortError') {{
      console.error(e);
      alert('Share failed: ' + (e.message || e));
    }}
    if (btn && orig) btn.textContent = orig;
    return;
  }}
  setTimeout(() => {{ if (btn && orig) btn.textContent = orig; }}, 1800);
}}

document.addEventListener('click', (event) => {{
  const save = event.target.closest('[data-save]');
  const share = event.target.closest('[data-share]');
  if (save) {{ event.preventDefault(); saveFrame(save.dataset.save); }}
  if (share) {{ event.preventDefault(); shareFrame(share.dataset.share); }}
}});

// ============================================================
// Save All / Share All — capture every frame, bundle as zip,
// download or pass to Web Share API.
// ============================================================
const FRAME_IDS = ['frame-01','frame-02','frame-03','frame-04','frame-05','frame-06'];

function setProgress(text) {{
  const el = document.getElementById('bulk-progress');
  if (el) el.textContent = text || '';
}}

async function captureAllFrames(onProgress) {{
  const blobs = [];
  for (let i = 0; i < FRAME_IDS.length; i++) {{
    const id = FRAME_IDS[i];
    if (onProgress) onProgress(i, FRAME_IDS.length, id);
    const blob = await frameToBlob(id);
    blobs.push({{ id, blob }});
  }}
  return blobs;
}}

async function bundleAsZip(blobs, packName) {{
  if (!window.JSZip) throw new Error('JSZip failed to load');
  const zip = new JSZip();
  for (const {{ id, blob }} of blobs) {{
    zip.file(id + '.jpg', blob);
  }}
  return await zip.generateAsync({{ type: 'blob', compression: 'STORE' }});
}}

async function saveAllFrames() {{
  const btn = document.getElementById('save-all-btn');
  const orig = btn ? btn.querySelector('.bulk-label').textContent : null;
  if (btn) {{ btn.disabled = true; btn.querySelector('.bulk-label').textContent = 'Loading…'; }}

  // Build a tidy filename prefix so all 6 files clearly belong together
  // when they land in Downloads or Photos. e.g. "Magistrate_Blevins_frame-01.jpg".
  const baseName = (document.title || 'spotlight').split(' ·')[0].trim().replace(/[^A-Za-z0-9]+/g, '_');

  try {{
    const blobs = await captureAllFrames((i, total, id) => {{
      setProgress(`Loading ${{id}}  (${{i + 1}} of ${{total}})`);
      if (btn) btn.querySelector('.bulk-label').textContent = `Loading ${{i + 1}}/${{total}}…`;
    }});
    const files = blobs.map(({{ id, blob }}) => new File([blob], `${{baseName}}_${{id}}.jpg`, {{ type: 'image/jpeg' }}));

    // Only use the share sheet on PHONES — macOS desktop also supports
    // Web Share API but its share sheet doesn't have "Save to Photos",
    // just AirDrop/Messages. Users on desktop want a direct download.
    const isMobile =
      window.matchMedia('(pointer: coarse)').matches &&
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');

    // PHONES (iOS Safari, Android Chrome): Web Share API → share sheet →
    // user picks "Save 6 Images" to drop them into the Photo Library.
    if (isMobile && navigator.canShare && navigator.canShare({{ files }})) {{
      setProgress('Opening share sheet — pick "Save 6 Images"');
      if (btn) btn.querySelector('.bulk-label').textContent = 'Opening…';
      try {{
        await navigator.share({{
          files,
          title: document.title,
          text: 'Stand With Meg · Court actor spotlight',
        }});
        setProgress('✓ Done');
        if (btn) btn.querySelector('.bulk-label').textContent = '✓ Saved';
        return;
      }} catch (e) {{
        if (e.name === 'AbortError') {{
          setProgress('');
          if (btn && orig) btn.querySelector('.bulk-label').textContent = orig;
          return;
        }}
        console.warn('share sheet failed, falling back:', e);
      }}
    }}

    // DESKTOP: zip download. Chrome/Safari block multiple sequential downloads
    // after the first, so direct multi-download is unreliable. ONE zip is more
    // dependable, and macOS auto-extracts when you double-click it.
    setProgress('Bundling 6 images…');
    if (btn) btn.querySelector('.bulk-label').textContent = 'Bundling…';
    const zipBlob = await bundleAsZip(blobs, 'spotlight');
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.download = `${{baseName}}_6_frames.zip`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setProgress('✓ Saved as zip — double-click to extract');
    if (btn) btn.querySelector('.bulk-label').textContent = '✓ Saved zip';
  }} catch (e) {{
    console.error(e);
    setProgress('✗ ' + (e.message || e));
    alert('Save failed: ' + (e.message || e) + '\\nFallback: take a screenshot.');
    if (btn && orig) btn.querySelector('.bulk-label').textContent = orig;
  }} finally {{
    if (btn) {{
      btn.disabled = false;
      setTimeout(() => {{ if (orig) btn.querySelector('.bulk-label').textContent = orig; setProgress(''); }}, 2500);
    }}
  }}
}}

async function shareAllFrames() {{
  const btn = document.getElementById('share-all-btn');
  const orig = btn ? btn.querySelector('.bulk-label').textContent : null;
  if (btn) {{ btn.disabled = true; btn.querySelector('.bulk-label').textContent = 'Preparing…'; }}
  try {{
    const blobs = await captureAllFrames((i, total, id) => {{
      setProgress(`Capturing ${{id}}  (${{i + 1}} of ${{total}})`);
      if (btn) btn.querySelector('.bulk-label').textContent = `Capturing ${{i + 1}}/${{total}}…`;
    }});
    const files = blobs.map(({{ id, blob }}) => new File([blob], id + '.jpg', {{ type: 'image/jpeg' }}));

    // Best path: native multi-file share (iOS Safari, Android Chrome)
    if (navigator.canShare && navigator.canShare({{ files }})) {{
      setProgress('Opening share sheet…');
      await navigator.share({{
        files,
        title: document.title,
        text: 'Court actor on the public record. StandWithMeg.com',
      }});
      setProgress('✓ Shared');
      if (btn) btn.querySelector('.bulk-label').textContent = '✓ Shared';
    }} else {{
      // Fallback: bundle as zip + offer the zip via share or download
      setProgress('Bundling for share…');
      const zipBlob = await bundleAsZip(blobs, 'spotlight');
      const zipFile = new File([zipBlob], 'spotlight.zip', {{ type: 'application/zip' }});
      if (navigator.canShare && navigator.canShare({{ files: [zipFile] }})) {{
        await navigator.share({{ files: [zipFile], title: document.title, text: 'StandWithMeg.com' }});
        setProgress('✓ Shared as zip');
        if (btn) btn.querySelector('.bulk-label').textContent = '✓ Shared';
      }} else {{
        // Final fallback: download the zip locally
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.download = 'spotlight.zip'; link.href = url;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        setProgress('Share not supported here — zip downloaded instead');
        if (btn) btn.querySelector('.bulk-label').textContent = '✓ Zip downloaded';
      }}
    }}
  }} catch (e) {{
    if (e.name !== 'AbortError') {{
      console.error(e);
      setProgress('✗ ' + (e.message || e));
      alert('Share all failed: ' + (e.message || e));
    }} else {{
      setProgress('');
    }}
    if (btn && orig) btn.querySelector('.bulk-label').textContent = orig;
  }} finally {{
    if (btn) {{
      btn.disabled = false;
      setTimeout(() => {{ if (orig) btn.querySelector('.bulk-label').textContent = orig; setProgress(''); }}, 2500);
    }}
  }}
}}

document.getElementById('save-all-btn')?.addEventListener('click', saveAllFrames);
document.getElementById('share-all-btn')?.addEventListener('click', shareAllFrames);
</script>
</body>
</html>
"""


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Render the Spotlight Stories v2 share page for an actor.")
    parser.add_argument("slug", help="Actor slug, e.g. magistrate_blevins")
    parser.add_argument("--web", action="store_true",
                        help="Use relative photo URLs (image_1080.png) suitable for serving on the live website")
    parser.add_argument("--output", help="Override output path. Default: <export>/<slug>/share.html")
    args = parser.parse_args(argv)

    spec_path = EXPORT_ROOT / args.slug / "spec.json"
    if not spec_path.exists():
        sys.stderr.write(f"error: {spec_path.relative_to(PROJECT_ROOT)} not found. Run spotlight_build.py first.\n")
        return 1

    spec = json.loads(spec_path.read_text())
    html = render(spec, web_mode=args.web)

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(html)
        print(f"Wrote {out_path}")
    else:
        share_path = spec_path.parent / "share.html"
        spotlight_path = spec_path.parent / "spotlight.html"
        share_path.write_text(html)
        shutil.copyfile(share_path, spotlight_path)
        print(f"Wrote {share_path.relative_to(PROJECT_ROOT)}")
        print(f"Wrote {spotlight_path.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
