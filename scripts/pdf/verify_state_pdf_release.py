#!/usr/bin/env python3
"""Fail closed when a generated public state-report release is incomplete.

The verifier uses the same live Supabase loaders and generator functions as
the PDFs. It checks the complete 30-family report set, input-hash freshness,
the complete 3-family actor set (including family comments), page budgets,
headline totals, and PDF structure before GitHub Actions is allowed to commit.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

from pypdf import PdfReader

HERE = Path(__file__).resolve().parent
WEBSITE_ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

from generate_state_pdf import (  # noqa: E402
    ACTOR_PAGE_BUDGET_FIRST,
    ACTOR_PAGE_BUDGET_REST,
    PUBLIC_STATE_REPORTS_DIR,
    PDF_CACHE_PATH,
    _court_actor_card_weight,
    build_states,
    build_template_context,
    children_impact,
    normalize_report_location,
    pdf_template_version,
    report_location_name,
    state_input_hash,
)
from lib_supabase_rows import (  # noqa: E402
    PUBLIC_ACTOR_THRESHOLD,
    load_public_court_actors_from_supabase,
    load_rows_from_supabase,
    load_state_exclusive_sponsor,
)


def _load_local_env() -> None:
    env_path = WEBSITE_ROOT / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _normalized(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = re.sub(r"[^\w]+", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def _fragment_present(fragment: str, pdf_text: str) -> bool:
    """Tolerate renderer hyphenation while still detecting dropped text."""
    normalized = _normalized(fragment)
    if not normalized:
        return True
    if normalized in pdf_text:
        return True
    stop_words = {
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
        "he", "her", "his", "i", "in", "is", "it", "me", "my", "of", "on",
        "or", "she", "that", "the", "their", "they", "this", "to", "was",
        "were", "with", "you",
    }
    tokens = [token for token in normalized.split() if token not in stop_words]
    if not tokens:
        tokens = normalized.split()
    pdf_tokens = set(pdf_text.split())
    matched = sum(1 for token in tokens if token in pdf_tokens)
    required_ratio = 1.0 if len(tokens) <= 8 else 0.94
    return matched / len(tokens) >= required_ratio


def _read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def _pdf_stems(report_dir: Path) -> set[str]:
    return {
        path.stem
        for path in report_dir.glob("*.pdf")
        if re.fullmatch(r"(?:[A-Z]{2}|[A-Za-z][A-Za-z0-9 -]{1,80})", path.stem)
    }


def verify(expected_report_count: int | None = None, only_location: str | None = None) -> dict:
    _load_local_env()
    failures: list[str] = []
    only_location = normalize_report_location(only_location) if only_location else None

    rows = load_rows_from_supabase()
    by_location = build_states(rows)
    qualifying = {
        location: location_rows
        for location, location_rows in by_location.items()
        if len(location_rows) >= 30
    }
    if expected_report_count is not None and len(qualifying) != expected_report_count:
        failures.append(
            f"30-family set has {len(qualifying)} reports; expected {expected_report_count}"
        )
    if only_location and only_location not in qualifying:
        failures.append(f"requested location {only_location} is not in the live 30-family set")
    verify_locations = (
        {only_location: qualifying[only_location]}
        if only_location in qualifying
        else qualifying
    )

    actual_pdfs = _pdf_stems(PUBLIC_STATE_REPORTS_DIR)
    expected_pdfs = set(qualifying)
    missing_pdfs = sorted(expected_pdfs - actual_pdfs)
    extra_pdfs = sorted(actual_pdfs - expected_pdfs)
    if missing_pdfs:
        failures.append(f"missing 30-family PDFs: {', '.join(missing_pdfs)}")
    if extra_pdfs:
        failures.append(f"under-threshold/stale PDFs still public: {', '.join(extra_pdfs)}")

    index_path = PUBLIC_STATE_REPORTS_DIR / "index.json"
    index_rows = _read_json(index_path) if index_path.exists() else []
    index_map = {
        str(entry.get("state")): entry
        for entry in index_rows
        if isinstance(entry, dict) and entry.get("state")
    } if isinstance(index_rows, list) else {}
    if set(index_map) != expected_pdfs:
        failures.append(
            "index.json report set does not equal the live 30-family set "
            f"(index={len(index_map)}, live={len(expected_pdfs)})"
        )

    cache = _read_json(PDF_CACHE_PATH) if PDF_CACHE_PATH.exists() else {}
    if not isinstance(cache, dict):
        cache = {}
        failures.append(".regen-cache.json is not an object")

    actors_by_location = {
        normalize_report_location(str(location)): actors
        for location, actors in load_public_court_actors_from_supabase().items()
    }
    version_hash = pdf_template_version()
    results: dict[str, dict] = {}

    for location, location_rows in sorted(verify_locations.items()):
        state_name = report_location_name(location)
        actors = actors_by_location.get(location, [])
        sponsor = load_state_exclusive_sponsor(location)
        expected_hash = state_input_hash(
            location,
            location_rows,
            actors,
            version_hash,
            "supabase",
            sponsor,
        )
        cached = cache.get(location) if isinstance(cache.get(location), dict) else {}
        if cached.get("input_hash") != expected_hash:
            failures.append(f"{location}: stale input hash")
        if cached.get("template_version") != version_hash:
            failures.append(f"{location}: stale template version")

        index_entry = index_map.get(location, {})
        if int(index_entry.get("submissions") or -1) != len(location_rows):
            failures.append(
                f"{location}: index family total {index_entry.get('submissions')} "
                f"!= generator {len(location_rows)}"
            )

        ctx = build_template_context(location, location_rows, court_actors=actors, sponsor=sponsor)
        for page_index, actor_page in enumerate(ctx["actor_pages"]):
            budget = ACTOR_PAGE_BUDGET_FIRST if page_index == 0 else ACTOR_PAGE_BUDGET_REST
            page_weight = sum(_court_actor_card_weight(actor) for actor in actor_page)
            if page_weight > budget:
                failures.append(
                    f"{location}: actor page {page_index + 1} weight {page_weight} > {budget}"
                )

        for actor in actors:
            family_count = int(actor.get("count") or actor.get("submission_count") or 0)
            if family_count < PUBLIC_ACTOR_THRESHOLD:
                failures.append(
                    f"{location}: actor {actor.get('name')} is below {PUBLIC_ACTOR_THRESHOLD}-family threshold"
                )

        pdf_path = PUBLIC_STATE_REPORTS_DIR / f"{location}.pdf"
        if not pdf_path.exists():
            continue
        try:
            reader = PdfReader(str(pdf_path), strict=True)
        except Exception as exc:
            failures.append(f"{location}: PDF cannot be opened: {exc}")
            continue
        expected_pages = int(ctx["total_pages"])
        if len(reader.pages) != expected_pages:
            failures.append(
                f"{location}: PDF has {len(reader.pages)} pages; generator expects {expected_pages}"
            )

        cover_text = _normalized(reader.pages[0].extract_text() or "") if reader.pages else ""
        children_total = children_impact(location_rows)["total_children"]
        for expected_text, label in (
            (f"{state_name} families on record", "family headline"),
            (f"{children_total} children impacted", "children headline"),
            (f"data as of {ctx['data_as_of_date']}", "data-as-of date"),
        ):
            if _normalized(expected_text) not in cover_text:
                failures.append(f"{location}: PDF cover missing {label}")

        actor_page_count = int(ctx["actor_page_count"])
        # Extract the full document so a renderer-created overflow page cannot
        # hide a missing actor from this content gate. The strict physical page
        # count check above still fails that overflow separately.
        actor_text = _normalized(
            " ".join((page.extract_text() or "") for page in reader.pages)
        )
        for actor in actors:
            name = str(actor.get("name") or "")
            if _normalized(name) not in actor_text:
                failures.append(f"{location}: PDF missing threshold actor {name}")

        for actor_page in ctx["actor_pages"]:
            for fragment in actor_page:
                for comment in fragment.get("comments", []) or []:
                    note = str(comment.get("note") or "")
                    if note and not _fragment_present(note, actor_text):
                        failures.append(
                            f"{location}: PDF missing family comment fragment for {fragment.get('name')}"
                        )

        results[location] = {
            "families": len(location_rows),
            "children": children_total,
            "actors": len(actors),
            "actor_pages": actor_page_count,
            "pdf_pages": len(reader.pages),
            "input_hash": expected_hash,
            "data_as_of": ctx["data_as_of_date"],
        }

    if not only_location or only_location == "KS":
        ks_names = {_normalized(actor.get("name")) for actor in actors_by_location.get("KS", [])}
        for required_name in ("Jennifer M. Berger", "Ashlyn L. Yarnell"):
            if _normalized(required_name) not in ks_names:
                failures.append(f"KS: live 3-family actor set missing {required_name}")
    if not only_location or only_location == "FL":
        fl_names = {_normalized(actor.get("name")) for actor in actors_by_location.get("FL", [])}
        if _normalized("Joanne Berthier") not in fl_names:
            failures.append("FL: live 3-family actor set missing Joanne Berthier")
        if _normalized("Joanne") in fl_names:
            failures.append("FL: bare Joanne remains in the live 3-family actor set")

    summary = {
        "reports": len(qualifying),
        "verified_reports": len(verify_locations),
        "families": sum(len(location_rows) for location_rows in qualifying.values()),
        "actors": sum(len(actors_by_location.get(location, [])) for location in qualifying),
        "template_version": version_hash,
        "locations": results,
        "failures": failures,
    }
    if failures:
        raise RuntimeError("State PDF release verification failed:\n- " + "\n- ".join(failures))
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-report-count", type=int)
    parser.add_argument("--state", help="verify one qualifying location while still checking the global report set")
    parser.add_argument("--json-output", type=Path)
    args = parser.parse_args()

    try:
        summary = verify(args.expected_report_count, args.state)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    payload = json.dumps(summary, indent=2, ensure_ascii=False)
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(payload + "\n", encoding="utf-8")
    print(
        f"Verified {summary['verified_reports']} of {summary['reports']} reports · {summary['families']} families · "
        f"{summary['actors']} threshold actors · zero stale hashes/overflows."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
