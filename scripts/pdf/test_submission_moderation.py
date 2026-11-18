"""Public report generation must honor moderation without altering originals."""
import copy
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, call, patch

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

    def load_actors(self, source, state="KS", aliases=None, reviews=None):
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = SimpleNamespace(data=source)
        with patch.object(rows, "create_client", return_value=client), \
             patch.object(rows, "_load_court_actor_alias_resolver", return_value=aliases or {}), \
             patch.object(rows, "_load_court_actor_row_review_map", return_value=reviews or {}), \
             patch.object(rows, "_load_hidden_submission_ids", return_value=set()), \
             patch.object(rows, "_load_court_actor_comment_merge_map", return_value=({}, {})):
            return rows.load_public_court_actors_from_supabase(state)

    def test_quote_approval_does_not_remove_a_valid_submission_from_counts(self):
        source = self.actors()
        source[2]["survey_submissions"]["approved"] = False
        source[2]["notes"] = "UNAPPROVED WORDS MUST STAY PRIVATE"
        source[3]["survey_submissions"].update(permission_to_share="data_only", approved=False)
        source[3]["notes"] = "DATA ONLY WORDS MUST STAY PRIVATE"
        before = copy.deepcopy(source)
        actor = self.load_actors(source)["KS"][0]
        self.assertEqual((actor["count"], actor["submission_count"]), (4, 4))
        self.assertEqual(len(actor["comments"]), 2)
        self.assertNotIn("MUST STAY PRIVATE", str(actor))
        self.assertEqual(source, before)

    def test_unknown_consent_and_review_exclusions_do_not_count(self):
        source = self.actors()
        for value in [None, "", "private", "unknown"]:
            source[3]["survey_submissions"]["permission_to_share"] = value
            self.assertEqual(self.load_actors(source)["KS"][0]["submission_count"], 3)
        source[3]["survey_submissions"].update(permission_to_share="anonymous", approved=False)
        for decision in ["duplicate", "submitter_hidden"]:
            self.assertEqual(self.load_actors(source, reviews={"row-3": decision})["KS"][0]["submission_count"], 3)

    def test_family_gate_and_submission_total_remain_separate(self):
        source = self.actors()
        source[3]["survey_submissions"]["email"] = source[0]["survey_submissions"]["email"]
        source.append({**copy.deepcopy(source[0]), "id": "same-submission-other-role", "role": "GAL"})
        actor = self.load_actors(source)["KS"][0]
        self.assertEqual((actor["count"], actor["submission_count"]), (3, 4))
        source[2]["survey_submissions"]["email"] = source[0]["survey_submissions"]["email"]
        self.assertEqual(self.load_actors(source), {})

    def test_name_keys_preserve_doubles_and_resolve_reviewed_aliases(self):
        self.assertEqual(rows._actor_name_key("Mary Mattivi"), "mary mattivi")
        self.assertEqual(rows._actor_name_key("Allison Maxwell Hibler"), "allison maxwell hibler")
        self.assertEqual(rows._actor_name_key("Elizabeth Sweeney-Reeder"), "elizabeth sweeney-reeder")
        self.assertNotEqual(rows._actor_name_key("Pat Patterson"), rows._actor_name_key("Pat Paterson"))
        decisions = [{"location_key": "KS", "canonical_name": "Mary Mattivi", "name_keys": ["mary mattivi", "may mattivi"]}]
        with patch.object(rows, "_paginated_select", return_value=decisions):
            aliases = rows._load_court_actor_alias_resolver(MagicMock())
        source = self.actors()
        for index, row in enumerate(source): row["name"] = "May Mattivi" if index == 3 else "Mary Mattivi"
        self.assertEqual(self.load_actors(source, aliases=aliases)["KS"][0]["submission_count"], 4)

    def test_reviewed_cross_state_identity_merges_before_state_filter(self):
        source = self.actors()[:3]
        for index, row in enumerate(source):
            row["name"] = ["Bud Dale", "Mildred Dale", 'Milfred "Bud" Dale'][index]
            row["location_key"] = "TX" if index == 2 else "KS"
            row["state_code"] = row["location_key"]
        actor = self.load_actors(source)["KS"][0]
        self.assertEqual(actor["name"], 'Milfred "Bud" Dale')
        self.assertEqual((actor["count"], actor["submission_count"]), (3, 3))
        self.assertEqual(actor["court_or_county"], "Reports from KS and TX")
        self.assertIsNone(rows._reviewed_actor_identity("Bud Dale", "CA"))
        source[2]["survey_submissions"]["email"] = source[0]["survey_submissions"]["email"]
        self.assertEqual(self.load_actors(source), {})

    def test_role_only_names_do_not_create_public_actor_entries(self):
        for name in ["GAL", "Unknown Judge", "Guardian ad Litem"]:
            source = self.actors()
            for row in source: row["name"] = name
            self.assertEqual(self.load_actors(source), {})

    def test_hidden_actor_excluded_and_tainted_merge_cannot_restore_note(self):
        source = self.actors()
        before = copy.deepcopy(source)
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = SimpleNamespace(data=source)
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

    def test_actor_pagination_orders_every_page_by_unique_id(self):
        source = self.actors()
        client = MagicMock()
        filtered = client.table.return_value.select.return_value.eq.return_value
        query = filtered.order.return_value
        query.range.return_value.execute.side_effect = [
            SimpleNamespace(data=[{}] * 998 + source[:2]),
            SimpleNamespace(data=source[2:]),
        ]
        with patch.object(rows, "create_client", return_value=client), \
             patch.object(rows, "_load_court_actor_alias_resolver", return_value={}), \
             patch.object(rows, "_load_court_actor_row_review_map", return_value={}), \
             patch.object(rows, "_load_hidden_submission_ids", return_value=set()), \
             patch.object(rows, "_load_court_actor_comment_merge_map", return_value=({}, {})):
            actor = rows.load_public_court_actors_from_supabase("KS")["KS"][0]
        self.assertEqual(filtered.order.call_args_list, [call("id"), call("id")])
        self.assertEqual(query.range.call_args_list, [call(0, 999), call(1000, 1999)])
        self.assertEqual(actor["count"], 4)

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
