"""Public report generation must honor moderation without altering originals."""
import copy
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lib_supabase_rows as rows


class SubmissionModerationTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"NEXT_PUBLIC_SUPABASE_URL": "https://example.invalid", "SUPABASE_SERVICE_ROLE_KEY": "test"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def actors(self):
        return [{"id": f"row-{i}", "submission_id": f"sub-{i}", "name": "Example Judge",
                 "role": "Judge", "state_code": "KS", "location_key": "KS",
                 "court_or_county": "Example County", "notes": f"Family statement {i}",
                 "created_at": "2026-10-01", "survey_submissions": {
                     "email": f"family{i}@example.invalid", "permission_to_share": "anonymous", "approved": True,
                     "state_of_occurrence": "KS", "created_at": "2026-10-01"}} for i in range(4)]

    def test_hidden_actor_excluded_and_tainted_merge_cannot_restore_note(self):
        source = self.actors()
        before = copy.deepcopy(source)
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value.range.return_value.execute.return_value = SimpleNamespace(data=source)
        with patch.object(rows, "create_client", return_value=client), \
             patch.object(rows, "_load_court_actor_alias_resolver", return_value={}), \
             patch.object(rows, "_load_court_actor_row_review_map", return_value={}), \
             patch.object(rows, "_load_hidden_submission_ids", return_value={"sub-3"}), \
             patch.object(rows, "_load_court_actor_comment_merge_map", return_value=({"row-0": "RETIRED TEXT"}, {"row-0": ["row-0", "row-3"]})):
            actor = rows.load_public_court_actors_from_supabase("KS")["KS"][0]
        self.assertEqual(actor["count"], 3)
        self.assertNotIn("Family statement 3", str(actor))
        self.assertNotIn("RETIRED TEXT", str(actor))
        self.assertIn("Family statement 0", str(actor))
        self.assertEqual(source, before)

    def test_hidden_survey_excluded_before_report_statistics_and_quotes(self):
        source = [{"id": "hidden", "email": "one@example.invalid", "state_of_occurrence": "KS", "impact_quote": "PRIVATE"},
                  {"id": "visible", "email": "two@example.invalid", "state_of_occurrence": "KS"}]
        before = copy.deepcopy(source)
        with patch.object(rows, "create_client"), \
             patch.object(rows, "_paginated_select", side_effect=lambda sb, table, *args, **kwargs: source if table == "survey_submissions" else []), \
             patch.object(rows, "_load_hidden_submission_ids", return_value={"hidden"}), \
             patch.object(rows, "_load_count_separately_keys", return_value=set()), \
             patch.object(rows, "_row_tuple", side_effect=lambda row: row):
            result = rows.load_rows_from_supabase()
        self.assertEqual([row["id"] for row in result], ["visible"])
        self.assertEqual(source, before)

    def test_only_exclusion_decisions_hide_and_lookup_failure_stops_generation(self):
        reviews = [{"source_id": "a", "decision": "delete"}, {"source_id": "b", "decision": "superseded"},
                   {"source_id": "c", "decision": "count_separately"}]
        with patch.object(rows, "_paginated_select", return_value=reviews):
            self.assertEqual(rows._load_hidden_submission_ids(MagicMock()), {"a", "b"})
        with patch.object(rows, "_paginated_select", side_effect=RuntimeError("review unavailable")):
            with self.assertRaisesRegex(RuntimeError, "review unavailable"):
                rows._load_hidden_submission_ids(MagicMock())


if __name__ == "__main__":
    unittest.main()
