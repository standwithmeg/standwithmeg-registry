"""Rebuild PDF actor covers with the same design used by public share pages."""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import re
import tempfile
from functools import lru_cache
from pathlib import Path

SHARE_RENDERER = Path(__file__).resolve().parents[1] / "share-pages" / "render_spotlight.py"


@lru_cache(maxsize=1)
def _renderer():
    spec = importlib.util.spec_from_file_location("pdf_share_renderer", SHARE_RENDERER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _cover_html(actor: dict, state: str, pending: dict, photo_path: Path | None) -> str:
    renderer = _renderer()
    from generate_state_pdf import report_location_name
    from lib_supabase_rows import _actor_name_key

    name = actor["name"]
    # Preserve the matched website slide's full name and title, including
    # approved aliases/middle names, while refreshing the submission count.
    published = pending.get("spec", {}).get("actor") or {}
    known_names = {_actor_name_key(value) for value in [name, *(actor.get("name_aliases") or [])]}
    if _actor_name_key(published.get("display_name") or "") in known_names:
        name = published["display_name"]
    else:
        published = {}
    first, last = published.get("first_name", ""), published.get("last_name", "")
    if " ".join(f"{first} {last}".split()).casefold() != name.casefold():
        first, _, last = name.rpartition(" ")
    title = (renderer.esc(first.upper()) + "<br>" if first else "")
    title += f'<span class="gold">{renderer.esc(last.upper())}</span>'
    raw_role = str(published.get("role") or actor.get("role") or "").strip()
    role = renderer.expand_acronyms("Public court actor" if not raw_role or raw_role.casefold() == "other" else raw_role)
    county = actor.get("court_or_county") or ""
    state_name = report_location_name(state)
    spec = {
        "actor": {"display_name": name, "first_name": first, "last_name": last,
                  "role": role, "state": state_name, "state_abbr": state, "slug": "pdf-cover"},
        "photo": {"exists": photo_path is not None, "path": str(photo_path) if photo_path else None},
    }
    # Reuse the website's actual CSS and cover component, not a second design.
    source = renderer.render(spec, web_mode=True)
    style = re.search(r"<style>(.*?)</style>", source, re.S).group(1)
    font_link = re.search(r'<link href="https://fonts.googleapis.com/[^\"]+" rel="stylesheet">', source).group(0)
    cover = renderer.frame_1_who(
        spec["actor"], role, county, state_name, state, county,
        actor["submission_count"], pending.get("state_total"), spec, title, web_mode=True,
    )
    cover = cover.replace("families named this person on the public record",
                          "submissions naming this person")
    # A person without an approved photo still gets a full named slide, without
    # exposing the share renderer's internal image-path placeholder.
    cover = re.sub(r'<div class="ph-tag">.*?</div>', '<div class="ph-tag">Photo not available</div>', cover)
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{font_link}<style>{style}</style></head><body>{cover}</body></html>'


def render_pending_covers(actors: list[dict], state: str) -> list[dict]:
    pending_actors = [actor for actor in actors if "_cover_pending" in actor]
    if not pending_actors:
        return actors
    from playwright.sync_api import sync_playwright

    with tempfile.TemporaryDirectory(prefix="swm-pdf-covers-") as directory, sync_playwright() as pw:
        browser = pw.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": 540, "height": 960}, device_scale_factor=2)
            for index, actor in enumerate(pending_actors):
                pending = actor["_cover_pending"]
                photo_path = None
                portrait = pending.get("portrait")
                if portrait:
                    body, mime = portrait
                    suffix = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}[mime]
                    photo_path = Path(directory) / f"portrait-{index}{suffix}"
                    photo_path.write_bytes(body)
                page.set_content(_cover_html(actor, state, pending, photo_path), wait_until="networkidle")
                # Playwright's animations="disabled" does not freeze SVG SMIL.
                # Keep the website's waving flag at a fixed frame so identical
                # rebuild inputs produce identical artwork/cache hashes.
                page.evaluate("""() => document.querySelectorAll('svg').forEach(svg => {
                  svg.pauseAnimations(); svg.setCurrentTime(0);
                })""")
                fonts_loaded = page.evaluate("""async () => {
                  const families = ['Anton', 'Fraunces', 'Oswald', 'JetBrains Mono'];
                  await Promise.all(families.map(name => document.fonts.load(`16px "${name}"`)));
                  await document.fonts.ready;
                  return families.every(name => [...document.fonts].some(font => font.family.replaceAll('"', '') === name && font.status === 'loaded'));
                }""")
                if not fonts_loaded:
                    raise ValueError(f"Actor cover fonts failed to load: {actor['name']}")
                if portrait:
                    page.evaluate("""async () => {
                      const value = getComputedStyle(document.querySelector('.photo-real')).backgroundImage;
                      const image = new Image(); image.src = value.slice(5, -2);
                      await image.decode();
                    }""")
                # Fit long canonical names within the same website headline.
                page.evaluate("""() => {
                  const title = document.querySelector('.f1-headline .display');
                  let size = parseFloat(getComputedStyle(title).fontSize);
                  while (title.scrollWidth > title.clientWidth + 1 && size > 40) {
                    title.style.fontSize = `${--size}px`;
                  }
                }""")
                problems = page.evaluate("""() => {
                  const frame = document.querySelector('#frame-01').getBoundingClientRect();
                  const walker = document.createTreeWalker(document.querySelector('#frame-01'), NodeFilter.SHOW_TEXT);
                  const bad = [];
                  while (walker.nextNode()) {
                    const node = walker.currentNode;
                    if (!node.textContent.trim() || node.parentElement.closest('svg')) continue;
                    const range = document.createRange(); range.selectNodeContents(node);
                    for (const box of range.getClientRects()) {
                      if (box.width && box.height && (box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1)) bad.push(node.textContent);
                    }
                  }
                  return bad;
                }""")
                if problems:
                    raise ValueError(f"Actor cover text overflows for {actor['name']}: {problems}")
                body = page.locator("#frame-01").screenshot(type="jpeg", quality=88, animations="disabled")
                actor.update({
                    "artwork_uri": "data:image/jpeg;base64," + base64.b64encode(body).decode("ascii"),
                    "artwork_sha256": hashlib.sha256(body).hexdigest(),
                    "artwork_kind": "slide", "artwork_source": "rebuilt",
                    "artwork_photo_sha256": hashlib.sha256(portrait[0]).hexdigest() if portrait else None,
                    "artwork_photo_url": pending.get("portrait_url"),
                    "artwork_submission_count": actor["submission_count"],
                })
                del actor["_cover_pending"]
        finally:
            browser.close()
    return actors
