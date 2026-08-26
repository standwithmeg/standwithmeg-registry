#!/usr/bin/env python3
"""Focused regression tests for the public state-report release contract."""
from __future__ import annotations

import re
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from generate_state_pdf import (
    ACTOR_PAGE_BUDGET_FIRST,
    ACTOR_PAGE_BUDGET_REST,
    _court_actor_card_weight,
    _paginate_court_actors,
    build_template_context,
    cover_image_for,
)
from verify_state_pdf_release import _actor_heading_present, _fragment_present, _normalized


def _row(location: str, created_at: str) -> list:
    row = [""] * 32
    row[1] = location
    row[17] = 2
    row[31] = created_at
    return row


def _actor(name: str, comments: list[str]) -> dict:
    return {
        "name": name,
        "role": "Judge",
        "court_or_county": "Example County",
        "count": 3,
        "submission_count": 3,
        "comments": [
            {"note": note, "court_or_county": "Example County"}
            for note in comments
        ],
        "complaint_packet_url": "https://my.standwithmeg.com/reports/actors/example/complaint-packet",
        "complaint_agency_name": None,
    }


def _normalized(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


class StatePdfReleaseTests(unittest.TestCase):
    def test_all_threshold_actors_reach_template_context(self) -> None:
        actors = [_actor(f"Actor {idx:02d}", ["Short family report."]) for idx in range(25)]
        ctx = build_template_context("KS", [_row("KS", "2026-08-26T07:54:49Z")], actors)
        rendered_names = [actor["name"] for page in ctx["actor_pages"] for actor in page]
        self.assertEqual(rendered_names, [actor["name"] for actor in actors])

    def test_oversized_actor_is_split_without_losing_comment_text(self) -> None:
        original_comments = [
            " ".join(["first-family-detail"] * 310),
            " ".join(["second-family-detail"] * 155),
            "Short final family report.",
        ]
        actor = _actor("Oversized Actor", original_comments)
        pages = _paginate_court_actors([actor])

        self.assertGreater(len(pages), 1)
        for page_index, page in enumerate(pages):
            budget = ACTOR_PAGE_BUDGET_FIRST if page_index == 0 else ACTOR_PAGE_BUDGET_REST
            self.assertLessEqual(sum(_court_actor_card_weight(item) for item in page), budget)

        rendered_comments: dict[int, list[str]] = {}
        for page in pages:
            for fragment in page:
                for comment in fragment.get("comments", []):
                    rendered_comments.setdefault(comment["source_comment_index"], []).append(comment["note"])

        reconstructed = [
            _normalized(" ".join(rendered_comments[index]))
            for index in range(len(original_comments))
        ]
        self.assertEqual(reconstructed, [_normalized(text) for text in original_comments])

    def test_data_as_of_uses_latest_source_submission(self) -> None:
        rows = [
            _row("Austria", "2026-08-25T23:00:00Z"),
            _row("Austria", "2026-08-26T07:54:49Z"),
        ]
        ctx = build_template_context("Austria", rows)
        self.assertEqual(ctx["data_as_of_date"], "August 26, 2026")
        self.assertLess(
            datetime.fromisoformat("2026-08-26T07:54:49+00:00"),
            datetime(2026, 8, 27, tzinfo=timezone.utc),
        )

    def test_austria_uses_austrian_flag_header_asset(self) -> None:
        self.assertEqual(cover_image_for("Austria"), "cover-austria.svg")

    def test_free_text_counties_never_claim_more_than_the_state_has(self) -> None:
        rows = []
        for index in range(60):
            row = _row("CA", "2026-08-26T07:54:49Z")
            row[30] = f"Submitted County Label {index}"
            rows.append(row)
        ctx = build_template_context("CA", rows)
        self.assertEqual(ctx["subdivision_label"], "County labels reported")
        self.assertEqual(ctx["subdivision_stat"], "60 submitted")

    def test_comment_gate_tolerates_chromium_apostrophe_extraction(self) -> None:
        source = "One phone call and hasn’t spoke to me since."
        extracted = _normalized("One phone call and hasnʼt spoke to me since.")
        self.assertTrue(_fragment_present(source, extracted))

    def test_comment_gate_tolerates_only_line_wrap_hyphenation(self) -> None:
        source = "I was there to fight for intervention and placement."
        extracted = _normalized("I was there to fight for inter- vention and placement.")
        self.assertTrue(_fragment_present(source, extracted))
        self.assertFalse(
            _fragment_present(
                "I was there to fight for intervention and placement.",
                _normalized("I was there to fight for placement."),
            )
        )

    def test_actor_heading_gate_rejects_url_only_and_midword_wraps(self) -> None:
        url = "https://my.standwithmeg.com/reports/actors/fl-joanne-berthier/complaint-packet"
        broken = "Joanne\nBerthi\ner\nSupervisor · 3 submissions"
        readable = "Joanne\nBerthier\nSupervisor · 3 submissions"
        readable_then_comment = f'{readable}\n"The family filed a complaint."'
        self.assertFalse(_actor_heading_present("Joanne Berthier", broken))
        self.assertFalse(_actor_heading_present("Joanne Berthier", url))
        self.assertTrue(_actor_heading_present("Joanne Berthier", readable))
        self.assertTrue(_actor_heading_present("Joanne Berthier", readable_then_comment))


if __name__ == "__main__":
    unittest.main()
