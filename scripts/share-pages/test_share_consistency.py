"""Exercise the consistency gate against real rendered HTML, without live data."""
from __future__ import annotations

import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import verify_share_consistency as gate


class ShareConsistencyTests(unittest.TestCase):
    def check_render(self, spec, transform=lambda text: text):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "spec.json").write_text(json.dumps(spec))
            rendered = gate.render_spotlight.render(spec, web_mode=True)
            (root / "share.html").write_text(transform(rendered))
            with patch.object(gate, "find_actor_export", return_value=root), patch.object(
                gate, "api_count_for_actor", return_value=(None, "test")
            ) as api:
                result = gate.check_actor({"slug": "test_actor", "state_abbr": "KS"}, asset_only=True)
            return result, api.call_count

    @staticmethod
    def selected(*bodies):
        return {"render": {"selected_quotes": [{"body": body, "kind": "comment"} for body in bodies]}}

    def test_split_quote_matches_rendered_continuations(self):
        spec = self.selected("The court refused to hear my evidence. " * 20)
        failures, _ = self.check_render(spec)
        self.assertEqual([], failures)

    def test_existing_excerpt_limit_matches_rendered_truncation_cue(self):
        spec = self.selected("The court refused to hear my evidence. " * 70)
        failures, _ = self.check_render(spec)
        self.assertEqual([], failures)

    def test_selected_quotes_override_legacy_sources(self):
        spec = self.selected("The court refused to hear my evidence.")
        spec["supabase"] = {
            "public_comments": [{"comment_text": "The hearing was postponed."}],
            "family_reports": [{"body": "The court refused to hear my evidence."}],
        }
        failures, _ = self.check_render(spec)
        self.assertEqual([], failures)

    def test_current_renderer_combines_sources_when_no_selection_exists(self):
        spec = {"supabase": {
            "public_comments": [{"comment_text": "The hearing was postponed."}],
            "family_reports": [{"body": "The court refused to hear my evidence."}],
        }}
        failures, _ = self.check_render(spec)
        self.assertEqual([], failures)

    def test_missing_altered_extra_and_reordered_quotes_fail(self):
        spec = self.selected("The hearing was postponed.", "The court refused to hear my evidence.")
        transforms = {
            "missing": lambda text: re.sub(r'<p class="f4-text">.*?</p>', '', text, count=1),
            "altered": lambda text: text.replace("The hearing was postponed.", "The hearing was cancelled."),
            "extra": lambda text: text + '<p class="f4-text">An unrelated family statement.</p>',
            "reordered": lambda text: text.replace("The hearing was postponed.", "__swap__").replace(
                "The court refused to hear my evidence.", "The hearing was postponed."
            ).replace("__swap__", "The court refused to hear my evidence."),
        }
        for name, transform in transforms.items():
            with self.subTest(name=name):
                failures, _ = self.check_render(spec, transform)
                self.assertTrue(any("WHAT FAMILIES SAY" in failure.field for failure in failures))

    def test_missing_continuation_fails(self):
        spec = self.selected("The court refused to hear my evidence. " * 20)
        failures, _ = self.check_render(spec, lambda text: re.sub(
            r'<p class="f4-text">.*?</p>', '', text, count=1
        ))
        self.assertTrue(any("WHAT FAMILIES SAY" in failure.field for failure in failures))

    def test_empty_quote_placeholder_passes(self):
        failures, _ = self.check_render({})
        self.assertEqual([], failures)

    def test_asset_only_never_calls_live_api(self):
        _, calls = self.check_render(self.selected("The hearing was postponed."))
        self.assertEqual(0, calls)


if __name__ == "__main__":
    unittest.main()
