#!/usr/bin/env python3
"""Pre-render each spotlight frame as 1080x1920 JPEGs via Playwright."""
from __future__ import annotations

import argparse
import os
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


def prerender_one(slug: str, page) -> tuple[bool, str]:
    actor_dir = EXPORT_ROOT / slug
    share_path = actor_dir / "share.html"
    if not share_path.exists():
        return False, f"share.html not found for {slug}"

    page.goto(share_path.as_uri(), wait_until="networkidle", timeout=30000)
    page.wait_for_function("document.fonts && document.fonts.ready.then(() => true)", timeout=15000)
    page.wait_for_timeout(300)

    saved = 0
    for i in range(1, 7):
        frame_id = f"frame-{i:02d}"
        try:
            locator = page.locator(f"#{frame_id}")
            if locator.count() == 0:
                continue
            locator.screenshot(path=str(actor_dir / f"{frame_id}.jpg"), type="jpeg", quality=88)
            saved += 1
        except PlaywrightError as e:
            return False, f"frame {frame_id} screenshot failed: {e}"
    return True, f"{saved} frame(s) rendered"


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
