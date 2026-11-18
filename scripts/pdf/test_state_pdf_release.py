#!/usr/bin/env python3
"""Focused regression tests for the public state-report release contract."""
from __future__ import annotations

import re
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from generate_state_pdf import (
    ACTOR_PAGE_BUDGET_FIRST,
    ACTOR_PAGE_BUDGET_REST,
    _court_actor_card_weight,
    _paginate_court_actors,
    build_template_context,
    cover_image_for,
    state_input_hash,
    _paginate_measured_actors,
)
from actor_slides import _match_actor, _attach_slide
import verify_state_pdf_release as release
from verify_state_pdf_release import _actor_heading_present, _cover_failures, _fragment_present


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
    def test_measured_layout_keeps_all_comments_on_one_page_when_they_fit(self) -> None:
        actor = {**_actor("Example Actor", ["Family experience. " * 20 for _ in range(8)]),
                 "artwork_uri": "data:image/jpeg;base64,TEST"}
        self.assertGreater(_court_actor_card_weight(actor), 2800)
        def measure(card):
            return 200 + sum(len(c["note"]) for c in card["comments"]) / 10
        pages = _paginate_measured_actors([actor], measure, 700, 800)
        self.assertEqual(len(pages), 1)
        self.assertEqual(len(pages[0][0]["comments"]), 8)
        self.assertEqual(pages[0][0]["continuation_total"], 1)

    def test_measured_layout_moves_whole_actor_instead_of_splitting_at_page_end(self) -> None:
        actors = [_actor("First Actor", ["First comment"]), _actor("Second Actor", ["Second comment"])]
        pages = _paginate_measured_actors(actors, lambda actor: 400, 700, 800)
        self.assertEqual([[a["name"] for a in page] for page in pages], [["First Actor"], ["Second Actor"]])
        self.assertTrue(all(a["continuation_total"] == 1 for page in pages for a in page))

    def test_statistics_lead_with_or_without_actors(self) -> None:
        for actors in ([], [_actor("Example Actor", ["Family report."]) ]):
            ctx = build_template_context("KS", [_row("KS", "2026-11-18")], actors, registry_total=6603,
                                         rebuilt_at=datetime(2026, 11, 18, tzinfo=timezone.utc))
            self.assertEqual([ctx[key] for key in ("glance_page_number", "financial_page_number", "who_page_number")], [2, 3, 4])
            self.assertEqual(ctx["actor_start_page"], 5 if actors else None)
            self.assertEqual(ctx["registry_total"], 6603)
            self.assertEqual(ctx["report_date"], "November 18, 2026")

    def test_artwork_pagination_preserves_long_comments_within_budget(self) -> None:
        actor = {**_actor("Photo Actor", ["Family report detail. " * 200]), "artwork_uri": "data:image/jpeg;base64,TEST"}
        pages = _paginate_court_actors([actor])
        for page in pages:
            self.assertLessEqual(sum(_court_actor_card_weight(fragment) for fragment in page), ACTOR_PAGE_BUDGET_FIRST)
        notes = [c["note"] for page in pages for fragment in page for c in fragment["comments"]]
        self.assertEqual(_normalized(" ".join(notes)), _normalized(actor["comments"][0]["note"]))

    def test_artwork_changes_invalidate_cache_without_local_file_paths(self) -> None:
        actor = _actor("Example Actor", [])
        old = state_input_hash("KS", [], [{**actor, "artwork_sha256": "old"}], "v1", "supabase")
        new = state_input_hash("KS", [], [{**actor, "artwork_sha256": "new"}], "v1", "supabase")
        self.assertNotEqual(old, new)

    def test_slide_matches_existing_bucket_alias_but_not_another_state(self) -> None:
        entry = {"state_abbr": "KS", "slug": "bud_dale", "display_name": 'Milfred "Bud" Dale', "actor_bucket_key": "bud dale|KS"}
        self.assertEqual(_match_actor({"name": "Bud Dale"}, "KS", [entry]), entry)
        self.assertIsNone(_match_actor({"name": "Bud Dale"}, "MO", [entry]))
        self.assertIsNone(_match_actor({"name": "Bud Daly"}, "KS", [entry]))

    def test_retired_slide_uses_public_portrait(self) -> None:
        from urllib.error import HTTPError
        entry = {"state_abbr": "KS", "slug": "example_actor", "display_name": "Example Actor", "photo_url": "/public/photo.png"}
        with patch("actor_slides._download", side_effect=[HTTPError("url", 410, "Gone", {}, None), (b"photo", "image/png")]):
            actor = _attach_slide({"name": "Example Actor"}, "KS", [entry])
        self.assertEqual(actor["artwork_kind"], "portrait")
        self.assertTrue(actor["artwork_url"].endswith("/example_actor/image_1080.png"))

    def test_alias_versions_choose_latest_publication_not_highest_count(self) -> None:
        old = {"state_abbr": "MO", "slug": "sue_m_crane", "display_name": "Sue Crane", "family_count": 50}
        new = {"state_abbr": "MO", "slug": "sue_crane", "display_name": "Sue Crane", "family_count": 3}
        with patch("actor_slides._published_timestamp", side_effect=[100, 200]):
            self.assertEqual(_match_actor({"name": "Sue Crane"}, "MO", [old, new]), new)
        with patch("actor_slides._published_timestamp", return_value=0):
            with self.assertRaises(ValueError):
                _match_actor({"name": "Sue Crane"}, "MO", [old, new])

    def test_cover_gate_checks_registry_total_and_actual_rebuild_date(self) -> None:
        text = "295 Kansas families on record 538 children impacted Registry snapshot 6,603 total surveys across the registry Report rebuilt November 18, 2026 Data as of November 16, 2026"
        self.assertEqual(_cover_failures(text, "Kansas", 295, 538, "November 16, 2026", 6603, "November 18, 2026"), [])
        self.assertEqual(_cover_failures(text, "Kansas", 295, 538, "November 16, 2026", 6604, "November 17, 2026"), ["PDF cover missing registry survey total", "PDF cover missing rebuild date"])

    def test_cover_gate_accepts_letter_spacing_from_pypdf(self) -> None:
        text = (
            "283 KANSAS FAM ILIES ON R EC OR D · 520\nC HILDR EN IM PAC TED\n"
            "DA TA A S OF\nOCTOBER 16, 2026"
        )
        self.assertEqual(_cover_failures(text, "Kansas", 283, 520, "October 16, 2026"), [])
        self.assertEqual(
            _cover_failures(text, "Kansas", 83, 20, "October 15, 2026"),
            ["PDF cover missing family headline", "PDF cover missing children headline",
             "PDF cover missing data-as-of date"],
        )

    def test_cover_gate_rejects_missing_words_and_changed_digits(self) -> None:
        text = "30 Kansas families on record · 50 children impacted · Data as of October 16, 2026"
        for damaged in (
            text.replace("families on record", "families"),
            text.replace("30 Kansas", "130 Kansas"),
            text.replace("50 children", "150 children"),
            text.replace("2026", "20260"),
        ):
            with self.subTest(damaged=damaged):
                self.assertTrue(_cover_failures(damaged, "Kansas", 30, 50, "October 16, 2026"))

    def test_release_uses_current_eligible_actor_set_after_moderation(self) -> None:
        # No historical actor is mandatory when the live source no longer
        # qualifies them. Missing PDFs must still fail the release.
        rows = [_row("FL", "2026-10-16T00:00:00Z") for _ in range(30)]
        with tempfile.TemporaryDirectory() as temp, \
                patch.object(release, "_load_local_env"), \
                patch.object(release, "PUBLIC_STATE_REPORTS_DIR", Path(temp)), \
                patch.object(release, "PDF_CACHE_PATH", Path(temp) / ".regen-cache.json"), \
                patch.object(release, "load_rows_from_supabase", return_value=rows), \
                patch.object(release, "load_public_court_actors_from_supabase", return_value={}), \
                patch.object(release, "load_state_exclusive_sponsor", return_value=None):
            with self.assertRaises(RuntimeError) as raised:
                release.verify()
        self.assertIn("missing 30-family PDFs: FL", str(raised.exception))
        self.assertNotIn("live 3-family actor set missing", str(raised.exception))

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

    def test_actor_heading_gate_accepts_adjacent_continuation_badge(self) -> None:
        text = "Example ActorCONTINUED 1 / 2 Judge · 3 submissions"
        self.assertTrue(_actor_heading_present("Example Actor", text))
        self.assertFalse(_actor_heading_present("Example Different", text))


if __name__ == "__main__":
    unittest.main()
