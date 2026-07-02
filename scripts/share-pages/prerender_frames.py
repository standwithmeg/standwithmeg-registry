#!/usr/bin/env python3
"""Pre-render each spotlight frame as 1080x1920 JPEGs via Playwright."""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

SCRIPT_DIR = Path(__file__).resolve().parent
WEBSITE_ROOT = SCRIPT_DIR.parent.parent
PROJECT_ROOT = Path(os.environ.get("SWM_SHARE_WORKDIR", WEBSITE_ROOT / ".share-pages-work")).resolve()
EXPORT_ROOT = PROJECT_ROOT / "New Final Post and Capcut template" / "export"

FRAME_W = 540
FRAME_H = 960
DEVICE_SCALE_FACTOR = 2


def frame_ids_from_html(share_path: Path) -> list[str]:
    html = share_path.read_text(errors="ignore")
    ids = re.findall(r'<article\s+class="[^"]*\bframe\b[^"]*"\s+id="(frame-\d{2})"', html)
    seen: list[str] = []
    for frame_id in ids:
        if frame_id not in seen:
            seen.append(frame_id)
    return seen or [f"frame-{i:02d}" for i in range(1, 8)]


def missing_local_frame_sources(share_path: Path) -> list[str]:
    html = share_path.read_text(errors="ignore")
    missing: list[str] = []
    for article_match in re.finditer(
        r'<article\s+class="[^"]*\bframe\b[^"]*"\s+id="(?P<id>frame-\d{2})"[^>]*>(?P<body>[\s\S]*?)</article>',
        html,
    ):
        img_match = re.search(r'<img\s+[^>]*src="(?P<src>frame-\d{2}\.jpg)"', article_match.group("body"))
        if not img_match:
            continue
        src = img_match.group("src")
        if not (share_path.parent / src).exists():
            missing.append(f"{article_match.group('id')} requires missing local image {src}")
    return missing


def prerender_one(slug: str, page) -> tuple[bool, str]:
    actor_dir = EXPORT_ROOT / slug
    share_path = actor_dir / "share.html"
    if not share_path.exists():
        return False, f"share.html not found for {slug}"
    missing_sources = missing_local_frame_sources(share_path)
    if missing_sources:
        return False, "; ".join(missing_sources)

    page.goto(share_path.as_uri(), wait_until="networkidle", timeout=30000)
    page.wait_for_function("document.fonts && document.fonts.ready.then(() => true)", timeout=15000)
    page.wait_for_timeout(300)

    frame_ids = frame_ids_from_html(share_path)
    saved = 0
    for frame_id in frame_ids:
        try:
            locator = page.locator(f"#{frame_id}")
            if locator.count() == 0:
                continue
            locator.screenshot(path=str(actor_dir / f"{frame_id}.jpg"), type="jpeg", quality=88)
            saved += 1
        except PlaywrightError as e:
            return False, f"frame {frame_id} screenshot failed: {e}"

    # Generate feed-safe social frames (1080x1350 4:5) so FB/IG feed does not add blurred side-fill.
    # These are separate from vertical story frames. Content is cropped/scaled to fill the canvas.
    try:
        from PIL import Image
        TARGET_W, TARGET_H = 1080, 1350
        for frame_id in frame_ids:
            src = actor_dir / f"{frame_id}.jpg"
            if src.exists():
                im = Image.open(src)
                # Scale to cover target (fill without letterbox)
                scale = max(TARGET_W / im.width, TARGET_H / im.height)
                new_w = int(im.width * scale)
                new_h = int(im.height * scale)
                im = im.resize((new_w, new_h), Image.LANCZOS)
                # Center crop to exact target
                left = (new_w - TARGET_W) // 2
                top = (new_h - TARGET_H) // 2
                im = im.crop((left, top, left + TARGET_W, top + TARGET_H))
                social_path = actor_dir / f"social-{frame_id}.jpg"
                im.save(social_path, "JPEG", quality=88)
    except Exception:
        # PIL optional for social frames; vertical frames are always produced
        pass

    return True, f"{saved}/{len(frame_ids)} frame(s) rendered (+ social feed versions if PIL available)"


def all_built_slugs() -> list[str]:
    if not EXPORT_ROOT.exists():
        return []
    return sorted(
        d.name for d in EXPORT_ROOT.iterdir()
        if d.is_dir() and not d.name.startswith("_") and (d / "spec.json").exists()
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slug", nargs="?", help="Actor slug. Omit and use --all to render everyone.")
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args(argv)
    if not args.slug and not args.all:
        parser.error("pass a slug or --all")
    targets = all_built_slugs() if args.all else [args.slug]
    if not targets:
        print("no actors to render")
        return 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        context = browser.new_context(
            viewport={"width": FRAME_W, "height": FRAME_H},
            device_scale_factor=DEVICE_SCALE_FACTOR,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        )
        page = context.new_page()
        success = 0
        for slug in targets:
            ok, msg = prerender_one(slug, page)
            print(f"  {'✓' if ok else '✗'} {slug}: {msg}")
            if ok:
                success += 1
        browser.close()
    print(f"\n{success}/{len(targets)} actors pre-rendered")
    return 0 if success == len(targets) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
