#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import re
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("render_spotlight.py")
SPEC = importlib.util.spec_from_file_location("render_spotlight", MODULE_PATH)
assert SPEC and SPEC.loader
render_spotlight = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(render_spotlight)


NAOMI_QUOTE = (
    "It is deeply upsetting to revisit and update my survey to include Naomi "
    "Cataudeulla as one of the court actors in my case. She was the first "
    "supervisor assigned to me after my children were taken on January 29, "
    "2024, and my experience with her was confusing, distressing, and "
    "ultimately devastating. During our meetings, she gave me constantly "
    "shifting and conflicting rules about how I was allowed to behave. I was "
    "told I could not cry in front of my children—even though they had just "
    "been taken from me without the chance to say goodbye—and that if I did, "
    "they would be removed from the visit and I would not be allowed to see "
    "them again for two weeks. I was also instructed not to talk about their "
    "pets, not to express that I missed them, and to avoid anything that "
    "reflected normal, loving emotions between a mother and her children. "
    "Before what was supposed to be my final session—just one step away from "
    "finally seeing my kids—I asked if I could write down the rules so I "
    "could review them with my therapist and ensure I followed everything "
    "correctly. She refused to let me have a pen and paper, took my phone so "
    "I could not even make notes, and then became upset when I tried to "
    "clarify what I had been told. She denied ever saying those things, "
    "despite having clearly stated them before. Without warning, she told me "
    "she would no longer serve as my supervisor. I begged her to reconsider, "
    "explaining that I was so close to being able to see my children, but she "
    "refused. I left that meeting in tears, completely broken. That moment "
    "was not just an isolated incident—it was the beginning of a pattern that "
    "has kept me separated from my children for over two years."
)


def select(text: str | None, budget: int = 112) -> str:
    return render_spotlight.select_best_quote(text, char_budget=budget)


def test_naomi_quote_skips_preamble_for_specific_event() -> None:
    quote = select(NAOMI_QUOTE, 112)

    assert "It is deeply upsetting" not in quote
    assert (
        "refused" in quote.lower()
        or "pen and paper" in quote.lower()
        or "could not cry" in quote.lower()
        or "couldn't cry" in quote.lower()
    )


def test_short_factual_quote_stays_whole() -> None:
    assert select("Met with me 1 time for 1 hour.") == "Met with me 1 time for 1 hour."


def test_runon_rescue_surfaces_buried_event_over_contentless_lead() -> None:
    # Real Jennifer DeCastro Tunnard comment. The opening sentence ("this judge
    # came in New.") is a contentless fragment; the strongest line — a ruling
    # being torn down with no new evidence — is buried inside a run-on. The
    # selector must skip the empty lead and surface the conduct event.
    raw = (
        "After already 10 years, this judge came in New. It was my contempt "
        "hearing for ongoing non-payment of child support and alimony. No new "
        "exhibits no new information and literally dismantled a six-figure "
        "judgment and Order stating that my ex must not have any money and "
        "doesn't need to pay except for small monthly payments over the course "
        "of many many years in the future."
    )
    quote = select(raw, 140)
    lower = quote.lower()
    assert "came in new" not in lower, f"contentless lead surfaced: {quote!r}"
    assert "dismantled" in lower and "judgment" in lower, f"buried event missed: {quote!r}"


def test_naked_character_attack_is_rejected() -> None:
    assert select("She hates women.") == ""


def test_family_event_wins_over_character_attack() -> None:
    quote = select("She is corrupt. She denied my motion without reading the evidence.", 112)
    assert quote == "She denied my motion without reading the evidence."


def test_preferred_quote_clause_can_choose_second_sentence() -> None:
    raw = (
        "Extremely unqualified. Dr. Touma was unable to detect a severe mental disorder "
        "that every other therapist detected immediately. Either that or he was turning "
        "a blind eye to obvious facts and evidence that was presented"
    )
    quote = render_spotlight.select_best_quote(
        raw,
        char_budget=150,
        prefer_substrings=["turning a blind eye"],
    )
    assert quote == "Either that or he was turning a blind eye to obvious facts and evidence that was presented"


def test_leading_share_clause_does_not_win() -> None:
    quote = select("I'd like to share that the judge denied my DRVO without reading the file.")

    assert quote == "The judge denied my DRVO without reading the file."


def test_already_short_enough_is_not_truncated() -> None:
    quote = "Denied the request and ignored the evidence."

    assert select(quote) == quote


def test_empty_or_null_quote_returns_empty_string() -> None:
    assert select("") == ""
    assert select(None) == ""


def test_story_quotes_dedupes_same_first_ten_words() -> None:
    repeated_start = "I want to share that the judge denied my DRVO without reading the file in court"
    spec = {
        "supabase": {
            "family_reports": [
                {"body": f"{repeated_start} on Monday."},
                {"body": f"{repeated_start} after I filed evidence."},
                {"body": "The GAL ignored evidence and withheld the report."},
            ]
        }
    }

    quotes = render_spotlight.story_quotes(spec, n=3)

    assert [q["body"] for q in quotes] == [
        "The judge denied my DRVO without reading the file in court on Monday.",
        "The GAL ignored evidence and withheld the report.",
    ]


# ---------------------------------------------------------------------------
# Bug 1 — cross-reference junk preambles must be stripped
# ---------------------------------------------------------------------------
def test_strips_same_has_previously_listed_crossref() -> None:
    raw = (
        'Same has previously listed "Ronald Kowalski" Played favorites and '
        "hated even hearing from pro se- allowed violations of court orders "
        "for years with no concern for the children"
    )
    quote = select(raw, 112)

    assert "Same has previously listed" not in quote
    assert "Ronald Kowalski" not in quote
    # The crossref identifier must be gone and a real statement must surface.
    # Either the "Played favorites …" lead or the (stronger, complete) buried
    # event clause the run-on rescue now extracts is an acceptable pick — both
    # are family-voiced conduct, neither is the crossref junk.
    assert quote.startswith("Played favorites") or quote.startswith(
        "Allowed violations of court orders"
    )


def test_strips_same_judge_as_crossref_with_lowercase_name() -> None:
    raw = (
        "Same judge as Ronald kowalksi Denied motions continuously with no "
        "explanation and denied my right to even speak at hearings leading to "
        "bankruptcy for myself and my children"
    )
    # The reference clause is stripped before the statement is scored; the
    # lowercase/misspelled name ("kowalksi") must also be dropped.
    quote = select(raw, 168)

    assert "Same judge as" not in quote
    assert "kowalksi" not in quote.lower()
    assert quote.startswith("Denied motions continuously")

    # The junk identifier text must never survive, regardless of char budget.
    tight = select(raw, 112)
    assert "Same judge as" not in tight
    assert "kowalksi" not in tight.lower()


def test_strips_i_already_added_this_crossref() -> None:
    raw = (
        "I already added this Said she couldn't use the evaluators report "
        "due to the other parent objecting"
    )
    quote = select(raw, 168)

    assert "I already added this" not in quote
    assert quote.startswith("Said she couldn't use the evaluators report")


def test_strips_as_noted_previously_crossref() -> None:
    quote = select("As noted previously, the judge ignored the evidence.", 112)

    assert "As noted previously" not in quote
    assert "ignored the evidence" in quote.lower()


# ---------------------------------------------------------------------------
# Bug 2 — tiny non-statements (no verb) must be rejected
# ---------------------------------------------------------------------------
def test_bare_noun_phrase_is_rejected() -> None:
    assert select("My children", 112) == ""


def test_short_complete_statements_are_kept() -> None:
    # Short but complete: they have a verb and a real meaning. Keep them.
    assert select("Ignored evidence.", 112) == "Ignored evidence."
    assert select("Lied on stand.", 112) == "Lied on stand."
    assert select("Doesn't follow laws!", 112) == "Doesn't follow laws!"
    assert select("Judged on hearsay", 112) == "Judged on hearsay"


def test_story_quotes_skips_verbless_scrap() -> None:
    spec = {
        "supabase": {
            "family_reports": [
                {"body": "My children"},
                {"body": "Denied the request and ignored the evidence."},
            ]
        }
    }

    quotes = render_spotlight.story_quotes(spec, n=3)

    assert [q["body"] for q in quotes] == [
        "Denied the request and ignored the evidence."
    ]


# ---------------------------------------------------------------------------
# Bug 3 — two statements stitched without punctuation must be split
# ---------------------------------------------------------------------------
def test_stitched_statements_split_on_sentence_start() -> None:
    raw = "Not for families He's a biased lying judge who is against families"
    candidates = render_spotlight._quote_candidates(raw, 168)

    joined = " || ".join(candidates)
    # The run-on must not survive intact.
    assert raw not in candidates
    assert any(c.startswith("Not for families") for c in candidates)
    assert not any("biased lying judge" in c.lower() for c in candidates)


def test_proper_noun_does_not_trigger_split() -> None:
    # Names like "Megan Beck" / "Monica Rawlins" must NOT cause a split.
    for name in ("Megan Beck", "Monica Rawlins"):
        raw = f"The evaluator was {name} who ignored my evidence."
        broken = render_spotlight._insert_sentence_breaks(raw)
        assert "." not in broken[:-1], f"unexpected split on name: {name}"


# ---------------------------------------------------------------------------
# Bug 4 — overlapping / contained quotes must be deduped
# ---------------------------------------------------------------------------
def test_story_quotes_dedupes_substring_overlap() -> None:
    spec = {
        "supabase": {
            "public_comments": [
                {
                    "comment_text": "Not for families. He's a biased lying "
                    "judge who is against families"
                },
                {
                    "comment_text": "He's a biased lying judge who is against "
                    "families"
                },
                {"comment_text": "Doesn't follow laws!"},
            ]
        }
    }

    quotes = render_spotlight.story_quotes(spec, n=6)
    bodies = [q["body"] for q in quotes]

    # The contained duplicate must be dropped.
    assert len(bodies) == len(set(bodies))
    lowered = [b.lower() for b in bodies]
    for i, a in enumerate(lowered):
        for b in lowered[i + 1 :]:
            assert a not in b and b not in a


# ---------------------------------------------------------------------------
# Bug 5 — pasted court-filing boilerplate must never be chosen as a quote
# ---------------------------------------------------------------------------
def test_rejects_parties_plaintiff_boilerplate() -> None:
    # The exact bad quote seen on the Amanda Heitmueller slide.
    raw = (
        "PARTIES Plaintiff is an adult resident citizen of Lamar County, "
        "Mississippi and the biological mother of three minor children."
    )
    assert select(raw, 112) == ""


def test_rejects_full_pasted_complaint() -> None:
    raw = (
        "COMPLAINT COMES NOW the Plaintiff, Jessica L. Henderson, proceeding "
        "pro se, and files this Complaint against Defendant Amanda Heitmueller, "
        "LCSW. JURISDICTION AND VENUE This Court has subject matter "
        "jurisdiction pursuant to Article 6. Plaintiff seeks all compensatory "
        "damages permitted by law. JURY DEMAND Plaintiff demands trial by jury."
    )
    assert select(raw, 168) == ""


def test_rejects_see_my_complaint_pointer() -> None:
    # A "see my <doc>" pointer is a cross-reference, not the parent's statement.
    # This is the lead-in of the pasted Amanda Heitmueller complaint comment.
    raw = (
        "See my Forrest/ Lamar Complaint..I. PARTIES Plaintiff is an adult "
        "resident citizen of Lamar County, Mississippi and the biological "
        "mother of three minor children."
    )
    assert select(raw, 168) == ""


def test_see_reference_does_not_reject_normal_statement() -> None:
    # "the judge ignored my motion" is a real statement, not a pointer — keep it.
    quote = select("The judge ignored my motion and denied a hearing.", 112)
    assert quote.lower().startswith("the judge ignored my motion")


def test_real_family_voice_wins_over_boilerplate_in_same_text() -> None:
    raw = (
        "PARTIES Plaintiff is an adult resident citizen of Lamar County. "
        "She denied my evidence and ignored the report."
    )
    quote = select(raw, 112)
    assert "Plaintiff" not in quote
    assert quote.lower().startswith("she denied my evidence")


def test_story_quotes_drops_boilerplate_keeps_family_quotes() -> None:
    spec = {
        "supabase": {
            "public_comments": [
                {
                    "comment_text": "Did not advocate for child with court as "
                    "she assured the child, mother, & attorney that she would."
                },
                {
                    "comment_text": "PARTIES Plaintiff is an adult resident "
                    "citizen of Lamar County, Mississippi."
                },
                {"comment_text": "Ignored evidence."},
            ]
        }
    }

    quotes = render_spotlight.story_quotes(spec, n=6)
    bodies = [q["body"] for q in quotes]

    assert not any("Plaintiff" in b for b in bodies)
    assert any(b.startswith("Did not advocate") for b in bodies)
    assert "Ignored evidence." in bodies


def test_court_in_family_voice_is_not_boilerplate() -> None:
    # "court"/"the judge" are normal family words and must still pass.
    assert select("The judge denied my motion in court without a hearing.", 112)
    assert select("She lied to the court about my visitation.", 112)


def test_insult_only_quote_is_dropped() -> None:
    assert select("He's a dirty shit head.", 112) == ""
    assert select("He is a piece of garbage.", 112) == ""


def test_story_quotes_can_return_all_public_comments_for_pagination() -> None:
    spec = {
        "supabase": {
            "public_comments": [
                {"comment_text": f"Denied motion number {i} without a hearing."}
                for i in range(1, 14)
            ]
        }
    }

    quotes = render_spotlight.story_quotes(spec, n=None)
    pages = render_spotlight.chunk_quote_pages(quotes, per_page=6)

    assert len(quotes) == 13
    assert [len(page) for page in pages] == [6, 6, 1]


def test_render_adds_second_quote_slide_for_ten_public_comments() -> None:
    spec = {
        "actor": {
            "first_name": "Test",
            "last_name": "Actor",
            "display_name": "Test Actor",
            "role": "Judge",
            "state": "Connecticut",
            "state_abbr": "CT",
            "public_family_count": 10,
        },
        "state_stats": {"state_family_count": 20},
        "movement_total": 1000,
        "supabase": {
            "public_comments": [
                {"comment_text": f"Denied motion number {i} without a hearing."}
                for i in range(1, 11)
            ]
        },
    }

    html = render_spotlight.render(spec, web_mode=True)
    quote_tags = re.findall(r'<div class="frame-tag">(WHAT FAMILIES SAY[^<]*)</div>', html)
    quote_count = len(re.findall(r'<p class="f4-text">', html))

    assert quote_tags == ["WHAT FAMILIES SAY · 1/2", "WHAT FAMILIES SAY · 2/2"]
    assert quote_count == 10


def test_extraction_marker_quote_is_dropped() -> None:
    # "[extracted_ai] ..." / "[extracted_regex] ..." are internal provenance
    # tags on auto-extracted rows (admin-only until promoted). They must never
    # surface on a public slide.
    assert render_spotlight.select_best_quote("[extracted_ai] Amy", 98) == ""
    assert (
        render_spotlight.select_best_quote(
            "[extracted_regex] He refused my evidence in court.", 98
        )
        == ""
    )


def test_story_quotes_drops_extraction_marker_keeps_real_quote() -> None:
    spec = {
        "supabase": {
            "family_reports": [
                {"body": "[extracted_ai] Amy"},
                {"body": "They then have an insane waitlist."},
            ]
        }
    }
    quotes = render_spotlight.story_quotes(spec, n=3)
    assert [q["body"] for q in quotes] == ["They then have an insane waitlist."]


def test_lead_sentence_wins_over_weaker_tail() -> None:
    # The tail "...3 yrs later..." only edged ahead on a generic digit bonus.
    # The decaying lead bonus must put the family's stronger opening line first.
    raw = (
        "Useless. They only help if you have an OP and or criminal case. "
        "They then have an insane waitlist. They called me 3 yrs later and "
        "said they could take my case."
    )
    assert (
        render_spotlight.select_best_quote(raw, 98)
        == "Useless. They only help if you have an OP and or criminal case. They then have an insane waitlist."
    )


def test_kelly_bernstein_lead_conduct_beats_took_sides_fragment() -> None:
    raw = (
        "Led me on for more than a year with absolutely zero effort in "
        "actually reuniting my children and I. Was not lacking in billing me "
        "immediately for everything she possibly could bill for. Kept telling "
        "me to admit to something I didn't do. Took the mother's side just "
        "like everyone else involved in the reunification process."
    )

    assert (
        render_spotlight.select_best_quote(raw, 112)
        == "Led me on for more than a year with absolutely zero effort in actually reuniting my children and I."
    )


def test_kelly_bernstein_short_context_sentences_stay_together() -> None:
    raw = (
        "Being manipulated by mother. Easy manipulated. She is part of the "
        "problem and not the solution. Unclear what her role is and overstep "
        "boundaries all the time. Takes sides"
    )

    assert (
        render_spotlight.select_best_quote(raw, 112)
        == "Being manipulated by mother. Easy manipulated. She is part of the problem and not the solution."
    )


def test_speaker_benefit_positive_outcome_is_not_chosen() -> None:
    # "...allowed me to ... reunification therapy with my kids" credits the
    # actor (positive). It must not win over a real conduct statement.
    raw = (
        "During my year long trial my lawyer and myself begged for reunification "
        "therapy for me and my children. Prior to trial I had already been "
        "alienated for almost a year. Following the trial, I waited seven "
        "additional months for a trial decision. The decision allowed me to "
        "being reunification therapy with my kids."
    )
    chosen = render_spotlight.select_best_quote(raw, 112)
    assert "allowed me to being" not in chosen
    assert chosen


def test_allowed_third_party_stays_damning() -> None:
    # The speaker-benefit penalty must be narrow: "allowed the abuser ..." is a
    # conduct claim, not praise, and must remain selectable.
    raw = "He allowed the abuser unsupervised visits with my children."
    assert render_spotlight.select_best_quote(raw, 112) == raw


def test_strips_trailing_self_signature_short_initial() -> None:
    # Slides attribute every quote as "Anonymous parent" — a self-signed
    # trailing name must never reach the public slide.
    raw = "Ordered to pay hourly for supervised visits and got nothing -Kylie T"
    quote = render_spotlight.select_best_quote(raw, 112)
    assert "Kylie" not in quote
    assert "got nothing" in quote


def test_strips_trailing_signature_em_dash_full_name() -> None:
    raw = "They took my kids without a hearing and nobody would listen. — Maria Lopez"
    quote = render_spotlight.select_best_quote(raw, 168)
    assert "Maria" not in quote
    assert "Lopez" not in quote
    assert "nobody would listen" in quote


def test_keeps_dash_clause_that_is_not_a_signature() -> None:
    # A lowercase continuation after a dash is part of the sentence, not a
    # signature, and must survive sanitization.
    raw = "I paid for every visit - he never showed up once."
    quote = render_spotlight.select_best_quote(raw, 112)
    assert "never showed up" in quote


# ---------------------------------------------------------------------------
# Tammy Smith (NC) regression — excerpts must not orphan a gendered pronoun
# ---------------------------------------------------------------------------
TAMMY_TEXTING_QUOTE = (
    "She was texting the judge from a personal number during the hearing "
    "about the hearing itself. He would check his phone after every single "
    "text she sent in the court room. And they would lock eyes and nod."
)


def test_mid_comment_he_excerpt_is_rejected_when_antecedent_is_cut() -> None:
    # "She" is the (female) attorney, "He" is the judge. Excerpting the middle
    # sentence alone published "He would check his phone ..." on her slide,
    # which read as if the attorney were a man. Any budget that cannot hold
    # the sentence naming both people must never surface the bare "He ..." line.
    for budget in (86, 98, 112, 140, 168):
        quote = render_spotlight.select_best_quote(TAMMY_TEXTING_QUOTE, budget)
        assert not quote.lower().startswith("he "), (
            f"dangling 'He' excerpt at budget {budget}: {quote!r}"
        )


def test_mixed_pronoun_comment_renders_whole_with_wide_budget() -> None:
    # With room for the full comment (tammy_smith quote_char_budget override),
    # the whole three-sentence quote survives — including the "And they ..."
    # closing line, which is a continuation, not an incomplete head.
    quote = render_spotlight.select_best_quote(
        TAMMY_TEXTING_QUOTE, 210, prefer_substrings=["lock eyes and nod"]
    )
    assert quote == TAMMY_TEXTING_QUOTE


def test_same_pronoun_chain_excerpt_is_still_allowed() -> None:
    # A comment that only ever says "She ..." has one referent (the actor) —
    # excerpting a later "She ..." sentence stays unambiguous and allowed.
    quote = render_spotlight.select_best_quote(
        "She is corrupt. She denied my motion without reading the evidence.", 112
    )
    assert quote == "She denied my motion without reading the evidence."


def test_no_sentence_break_after_preposition_before_capitalized_my() -> None:
    # Families capitalize "My" mid-sentence; "about My spouse" / "subpoena My
    # spouse" must not be shredded into fake sentences ("about. My spouse").
    raw = (
        "Refused to make copies (in the chambers) of evidence that the trial "
        "judge Rose asked, continued to question myself about My spouse but "
        "would not subpoena My spouse to ask the questions."
    )
    broken = render_spotlight._insert_sentence_breaks(raw)
    assert broken == raw
    assert render_spotlight.select_best_quote(raw, 210) == raw


def test_invalid_actor_comment_falls_back_to_real_survey_quote() -> None:
    """Andrew Ellis regression: a non-statement actor note must not suppress
    the family's publishable survey impact quote and force a placeholder."""
    family_quote = (
        "Boise CPS made tons of false allegations without investigation, "
        "leading to job loss and attorney fees."
    )
    spec = {
        "supabase": {
            "public_comments": [{"comment_text": "Still on case"}],
            "family_reports": [{"body": family_quote}],
        }
    }

    quotes = render_spotlight.story_quotes(spec, n=None)

    assert len(quotes) == 1
    assert quotes[0]["kind"] == "family_report"
    assert "false allegations" in quotes[0]["body"].lower()
    assert render_spotlight.story_quote(spec)[1] == "family_report"


def test_valid_actor_comments_are_combined_with_permissioned_family_quotes() -> None:
    spec = {
        "supabase": {
            "public_comments": [{"comment_text": "Ignored evidence during the hearing."}],
            "family_reports": [{"body": "The whole system changed our lives."}],
        }
    }

    quotes = render_spotlight.story_quotes(spec, n=None)

    assert quotes == [
        {"body": "Ignored evidence during the hearing.", "kind": "comment"},
        {"body": "The whole system changed our lives.", "kind": "family_report"},
    ]


def test_allison_regression_keeps_both_public_family_reports_with_actor_comment() -> None:
    spec = {
        "supabase": {
            "public_comments": [{"comment_text": "Lacks initiative to end delay tactics."}],
            "family_reports": [
                {"body": "My custody time was decreased due to lack of investigative efforts."},
                {"body": "The system retraumatized me repeatedly and harmed my family."},
            ],
        }
    }

    quotes = render_spotlight.story_quotes(spec, n=None)

    assert [quote["kind"] for quote in quotes] == [
        "comment",
        "family_report",
        "family_report",
    ]


def test_render_metadata_records_exact_selected_quotes() -> None:
    spec = {
        "supabase": {
            "public_comments": [{"comment_text": "Still on case"}],
            "family_reports": [{"body": "The court ignored evidence during the hearing."}],
        }
    }

    selected = render_spotlight.record_rendered_quote_metadata(spec)

    assert selected == [{"body": "The court ignored evidence during the hearing.", "kind": "family_report"}]
    assert spec["render"]["selected_quotes"] == selected
    assert spec["render"]["quote_page_count"] == 1


if __name__ == "__main__":
    import traceback

    tests = sorted(
        (name, obj)
        for name, obj in list(globals().items())
        if name.startswith("test_") and callable(obj)
    )
    passed = 0
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS  {name}")
            passed += 1
        except Exception:  # noqa: BLE001 - test runner surfaces all failures
            print(f"FAIL  {name}")
            traceback.print_exc()
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
