#!/usr/bin/env python3
"""
Render a per-actor Court Actor Spotlight share page from spec.json.

Implements the Spotlight Stories v2 design vocabulary
(see `New Final Post and Capcut template/Spotlight Stories v2.html`):
 - Visible waving flag SVG background (displacement filter)
 - STATE OF [state] yellow stamp top-right on every frame
 - JetBrains Mono top-left frame tags
 - Anton huge headlines, Fraunces italic serif accents
 - Frame 2 Meg journalist intro image
 - Frame 3 "KEEP US" red highlight bar + rotated "NOT ANY MORE!" stamp
 - Frame 4 stacked family quotes
 - ActorIDStrip + MovementFoot at the bottom of every frame

Reads:
    New Final Post and Capcut template/export/<slug>/spec.json
Writes:
    New Final Post and Capcut template/export/<slug>/share.html
    New Final Post and Capcut template/export/<slug>/spotlight.html (alias)
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if SCRIPT_DIR.name == "share-pages":
    WEBSITE_ROOT = SCRIPT_DIR.parent.parent
    PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent / ".share-pages-work"
    PROJECT_ROOT = Path(os.environ.get("SWM_SHARE_WORKDIR", PROJECT_ROOT)).resolve()
    PHOTO_ROOT = Path(os.environ.get("SWM_PHOTO_ROOT", WEBSITE_ROOT)).resolve()
else:
    WEBSITE_ROOT = PROJECT_ROOT = SCRIPT_DIR.parent
    PHOTO_ROOT = PROJECT_ROOT
NEW_TEMPLATE_ROOT = PROJECT_ROOT / "New Final Post and Capcut template"
EXPORT_ROOT = NEW_TEMPLATE_ROOT / "export"


# ---------------------------------------------------------------------------
# Acronym + role helpers (unchanged from prior renderer)
# ---------------------------------------------------------------------------
ACRONYMS: dict[str, str] = {
    "GAL": "Guardian ad Litem",
    "CPS": "Child Protective Services",
    "DCF": "Department of Children and Families",
    "DCFS": "Department of Children and Family Services",
    "DSS": "Department of Social Services",
    "DHS": "Department of Human Services",
    "CASA": "Court Appointed Special Advocate",
    "AAG": "Assistant Attorney General",
    "ADA": "Assistant District Attorney",
    "DA": "District Attorney",
    "JFS": "Job and Family Services",
}


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def expand_acronyms(text: str) -> str:
    if not text:
        return text

    def repl(match: "re.Match[str]") -> str:
        token = match.group(0)
        full = ACRONYMS.get(token.upper())
        return f"{full} ({token})" if full else token

    return re.sub(r"\b(" + "|".join(ACRONYMS.keys()) + r")\b", repl, text)


def fmt_int(value: Any) -> str:
    try:
        return f"{int(float(value)):,}"
    except (TypeError, ValueError):
        return "—"


def fmt_money(value: Any) -> str:
    try:
        return f"${int(round(float(value))):,}"
    except (TypeError, ValueError):
        return "Review"


def fmt_months(value: Any) -> str:
    try:
        months = float(value)
    except (TypeError, ValueError):
        return "Review"
    if not 0 < months <= 240:
        return "Review"
    return f"{months:.0f} mo"


def fmt_pct(value: Any) -> str:
    try:
        return f"{float(value):.1f}%"
    except (TypeError, ValueError):
        return "Review"


def first_nonempty(*values: Any) -> Any:
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return None


def first_positive(*values: Any) -> Any:
    """Like first_nonempty, but also skips 0 so a transient zero count never
    masks a real fallback count."""
    for value in values:
        if value not in (None, "", [], {}, 0):
            return value
    return None


def story_quote(spec: dict) -> tuple[str, str]:
    """Returns (quote_text, source_kind). source_kind = 'comment' | 'family_report' | 'fallback'.

    Order: admin-curated public_comments (court_actors.notes) FIRST so the
    same quotes that appear in the state PDF appear on the share slide.
    Then survey_submissions.impact_quote family_reports as the secondary
    source for actors whose admin-curated comments are short or missing.
    """
    quotes = story_quotes(spec, n=1)
    if quotes:
        return (quotes[0]["body"], quotes[0]["kind"])
    return (
        "Families are adding their reports to the public record.",
        "fallback",
    )


# ---------------------------------------------------------------------------
# Multi-quote selection — prefers 4-6 short snippets for the quote frame
# ---------------------------------------------------------------------------
# Internal provenance markers stamped by the extraction pipeline (e.g.
# "[extracted_ai] Amy", "[extracted_regex] ..."). A quote tagged this way was
# auto-extracted, not written by the family, so it is admin-only until promoted
# and must never surface on a public slide. Drop the whole candidate.
_EXTRACTION_MARKER = re.compile(r"\[extracted[\w-]*\]", re.IGNORECASE)

# A family member sometimes signs their submission ("...got nothing -Kylie T").
# Every slide attributes quotes as "Anonymous parent", so a trailing signature
# both contradicts that label and publicly names the submitter. Strip a
# terminal "-Name", "— Jane D.", or "~ Maria Lopez": a dash/tilde followed by
# 1-3 name-shaped tokens (Capitalized word or initial) at the very end.
_TRAILING_SIGNATURE = re.compile(
    r"\s*[-–—~]+\s*[A-Z](?:[a-z'’]{1,15})?\.?(?:\s+[A-Z](?:[a-z'’]{1,15})?\.?){0,2}\s*$"
)


def _sanitize_quote_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    if _EXTRACTION_MARKER.search(text):
        return ""
    # Strip obvious PII patterns just in case
    text = re.sub(r"\b\d{2}-?\d{4,}\b", "[case #]", text)            # case numbers
    text = re.sub(r"\b\S+@\S+\.\S+\b", "[email]", text)              # email
    text = re.sub(r"\b\d{3}-\d{3}-\d{4}\b", "[phone]", text)        # phone
    text = _TRAILING_SIGNATURE.sub("", text).strip()                 # self-signed name
    return text


def _quote_char_budget(target_count: int) -> int:
    """Per-quote character budget by how many quotes share the frame.

    Few quotes → each gets far more room so the slide doesn't sit mostly
    empty (a lone approved comment fills the card with its strongest
    passage). As more approved quotes arrive, every quote automatically
    shrinks back to its most compelling part on the next regen.
    """
    if target_count >= 6:
        return 86
    if target_count == 5:
        return 98
    if target_count == 4:
        return 112
    if target_count == 3:
        return 168
    if target_count == 2:
        return 250
    return 460


PREAMBLE_STARTS = (
    "it is upsetting",
    "it is deeply upsetting",
    "it is hard",
    "i want to share",
    "i would like to",
    "i'd like to",
    "let me tell",
    "let me start",
    "before i begin",
    "to begin",
    "for context",
    "as background",
    "i'm writing",
    "i am writing",
    "this is my",
    "this is a",
    "i wanted to add",
    "i need to revisit",
    "i need to update",
    "to revisit",
    "thank you for",
    "i appreciate",
)

ACTION_VERBS = (
    "refused",
    "denied",
    "ignored",
    "lied",
    "took",
    "threatened",
    "stripped",
    "hand-picked",
    "forced",
    "removed",
    "ordered",
    "vacated",
    "blocked",
    "silenced",
    "mocked",
    "falsified",
    "conspired",
    "coerced",
    "withheld",
    "dismissed",
    "overruled",
    "bypassed",
    "intimidated",
    "retaliated",
    "separated",
    "allowed",
    "used",
    "gave",
    "led",
    "billed",
    "billing",
    "manipulated",
    "overstepped",
    "called",
    "help",
    "helped",
    "reunited",
    "reuniting",
    # Ruling/decision conduct verbs — families describe a judge tearing down or
    # rewriting an order in plain words. Without these the strongest line in a
    # comment ("literally dismantled a six-figure judgment") reads as verbless
    # filler and loses to a contentless lead sentence.
    "dismantled",
    "reversed",
    "overturned",
    "voided",
    "gutted",
    "disregarded",
    "fabricated",
    "weaponized",
    "rubber-stamped",
    "sanctioned",
)

# Nouns that mark a real court outcome. A clause that names one is reporting
# conduct ("dismantled a six-figure judgment", "changed custody"), so it earns
# a small bonus over a vague sentence that only happens to fit the frame.
RULING_NOUNS = (
    "judgment",
    "judgement",
    "ruling",
    "custody",
    "verdict",
    "sentence",
    "alimony",
    "child support",
    "restraining order",
    "protective order",
)

JUDGMENT_PHRASES = (
    "i feel",
    "i believe",
    "in my opinion",
    "personally",
)

LEGAL_PROCEDURES = (
    "drvo",
    "fam code 3044",
    "ex parte",
    "tro",
    "rooker-feldman",
    "due process",
)

CONSEQUENCE_PHRASES = (
    "so that",
    "which resulted in",
    "and then",
    "without warning",
)

DIRECT_ATTRIBUTION_PHRASES = (
    "told me",
    "told my",
    "said to me",
)

# "Allowed/permitted me (to) ..." credits the actor with letting the family do
# something — almost always a positive outcome ("the decision allowed me to ...
# reunification therapy with my kids"). On an exposure slide that reads as
# praise, so such a sentence must not win on the strength of its (otherwise
# damning) verb. Narrowly scoped to the first-person beneficiary so that
# "allowed the abuser unsupervised visits" stays a damning statement.
_SPEAKER_BENEFIT = re.compile(r"\b(?:allowed|permitted)\s+(?:me|us)\b", re.IGNORECASE)

# Legal-filing boilerplate. Families speak in the first person ("I", "my
# children", "she", "the judge"). Pasted court-complaint text speaks in the
# third person ("Plaintiff", "Defendant") and uses section headers ("PARTIES",
# "JURISDICTION AND VENUE", "COUNT I"). That text is never the parent's
# authentic voice, so it must never be chosen as a slide quote — even when it
# is short, grammatical, and names a place. We reject these candidates outright
# so the selector falls through to a real family statement (or drops the item).
_LEGAL_BOILERPLATE_TERMS = (
    "plaintiff",
    "defendant",
    "petitioner",
    "respondent",
    "comes now",
    "pursuant to",
    "subject matter jurisdiction",
    "jurisdiction and venue",
    "adult resident citizen",
    "prayer for relief",
    "compensatory damages",
    "proximate cause",
    "proximate result",
    "quasi-judicial immunity",
    "demands trial by jury",
)

# Section headers families never write but legal filings always do. Matched at
# the start of a candidate sentence only.
_LEGAL_HEADER_START = re.compile(
    r"^\s*(?:"
    r"parties|jurisdiction|venue|damages|factual\s+allegations|"
    r"jury\s+demand|prayer\s+for\s+relief|count\s+[ivxlcdm]+\b"
    r")\b",
    re.IGNORECASE,
)

# Unsupported character labels do not belong on the quote slide by themselves.
# The public post should surface family-reported events or impacts, not publish
# naked attacks about a named person's character or intent.
_UNSUPPORTED_CHARACTER_ATTACK_TERMS = (
    "hates women",
    "hates men",
    "hates mothers",
    "hates fathers",
    "biased lying",
    "lying judge",
    "corrupt",
    "evil",
    "narcissist",
    "sociopath",
    "psychopath",
    # Naked health/substance claims with no conduct are not publishable
    # ("And has a drug problem").
    "drug problem",
    "drug addict",
    "alcoholic",
)

_INSULT_ONLY_TERMS = (
    "shit head",
    "shithead",
    "piece of shit",
    "piece of garbage",
    "garbage person",
    "dirty head",
)


def _is_insult_only(sentence: str) -> bool:
    """Reject short name-calling fragments that contain no publishable event.

    Longer comments that include a concrete court action still flow through
    normal candidate scoring; this guard is for stand-alone insults like
    "He's a dirty shit head."
    """
    lower = sentence.lower()
    if not any(term in lower for term in _INSULT_ONLY_TERMS):
        return False
    word_count = len(re.findall(r"[A-Za-z']+", sentence))
    return word_count <= 10 and not _has_action_verb(lower) and not _has_specific_time(sentence)

# A "see my/the … complaint/filing/…" pointer is a cross-reference to another
# document, not a statement about the actor. Anchored at the start so a real
# statement that merely mentions a motion ("the judge ignored my motion") is
# untouched.
_SEE_REFERENCE_START = re.compile(
    r"^\s*see\s+(?:my|the|attached|above|below|also|prior|previous|enclosed)\b",
    re.IGNORECASE,
)

INCOMPLETE_HEAD_PATTERNS = (
    "i did,",
    "and ",
    "but ",
    "or ",
    "so ",
    "because ",
    "despite ",
    "if ",
)

INCOMPLETE_TAIL_WORDS = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "because",
    "before",
    "despite",
    "for",
    "from",
    "if",
    "in",
    "into",
    "of",
    "or",
    "so",
    "that",
    "the",
    "to",
    "was",
    "were",
    "when",
    "while",
    "with",
    "without",
}


def _truncate_quote(text: str, char_budget: int) -> str:
    if len(text) <= char_budget:
        return text
    if char_budget <= 1:
        return "…"
    trimmed = text[: max(1, char_budget - 1)].rstrip(" ,;:-")
    last_space = trimmed.rfind(" ")
    if last_space > 0:
        trimmed = trimmed[:last_space].rstrip(" ,;:-")
    return f"{trimmed}…"


def _strip_leading_preamble_clause(sentence: str) -> str:
    """Drop a leading share/setup clause when the evidence follows it."""
    patterns = (
        r"^i(?: would|\'d)? like to share that\s+",
        r"^i want to share that\s+",
        r"^i am writing(?: to say)? that\s+",
        r"^i\'m writing(?: to say)? that\s+",
        r"^i wanted to add that\s+",
        r"^it is deeply upsetting to revisit and update my survey to include\s+[^.?!]+[.?!]\s+",
        r"^it is upsetting to revisit and update my survey to include\s+[^.?!]+[.?!]\s+",
        r"^since my ex got a new attorney over a year ago,\s+",
    )
    for pattern in patterns:
        cleaned = re.sub(pattern, "", sentence, count=1, flags=re.IGNORECASE)
        if cleaned != sentence:
            return cleaned[:1].upper() + cleaned[1:]

    cleaned = _strip_leading_crossref_clause(sentence)
    if cleaned != sentence:
        return cleaned
    return sentence


# Cross-reference junk that families type to link one actor to another. This
# identifier text must never appear in a public quote. We strip the leading
# reference clause up to where the real statement begins (a capitalized action
# word). Be conservative: only strip a clearly-junk leading clause.
#
# Patterns where a NAME follows the reference clause before the real statement.
_CROSSREF_NAMED_PATTERNS = (
    # Same judge/person/magistrate as <name(s)>
    r"^same\s+(?:judge|person|magistrate)\s+as\s+",
    # Same has/as previously listed/reported "<name>"  (quotes optional)
    r"^same\s+(?:has|as)\s+previously\s+(?:listed|reported)\s+",
    # I already added this <name?>
    r"^i\s+already\s+(?:added|reported|submitted)\s+(?:this|him|her|them)\b\s*",
)

# Patterns that are a self-contained junk clause delimited by punctuation; the
# real statement follows directly after, no intervening name.
_CROSSREF_CLAUSE_PATTERNS = (
    # See also / see above
    r"^see\s+(?:also|above)\b[\s,.:;-]*",
    # As noted/mentioned/stated previously/above/before
    r"^as\s+(?:noted|mentioned|stated)\s+(?:previously|above|before)\b[\s,.:;-]*",
)

# A capitalized action word marks where the real family statement begins.
_CROSSREF_STATEMENT_START = re.compile(
    r"[A-Z][a-z]+",
)

# Capitalized words that plausibly open a real family statement. Combines the
# scoring ACTION_VERBS with the common past-tense/present openers families use.
_CROSSREF_STATEMENT_VERBS = frozenset(ACTION_VERBS) | {
    "played",
    "said",
    "kept",
    "made",
    "let",
    "would",
    "did",
    "does",
    "doesn't",
    "didn't",
    "never",
    "always",
    "refuses",
    "refused",
    "denies",
    "denied",
    "ignores",
    "ignored",
    "lies",
    "lied",
    "treated",
    "called",
    "claimed",
    "told",
    "granted",
    "awarded",
    "labeled",
    "accused",
    "called",
    "gave",
    "delayed",
}


def _strip_leading_crossref_clause(sentence: str) -> str:
    """Strip a leading 'same judge as <name>' style cross-reference clause.

    The reference clause is followed by a name (which may contain lowercase or
    misspelled tokens) and then the real family statement, which starts with a
    capitalized action word. We scan word-by-word and cut at the first token
    that is both capitalized and a known statement-opening verb.
    """
    # Clause patterns: punctuation-delimited junk with the statement right after.
    for pattern in _CROSSREF_CLAUSE_PATTERNS:
        match = re.match(pattern, sentence, flags=re.IGNORECASE)
        if not match:
            continue
        remainder = sentence[match.end():].strip(" \t\r\n\"“”'’,.:;-")
        if remainder and len(remainder) >= 12:
            return remainder[:1].upper() + remainder[1:]
        return sentence

    # Named patterns: a name sits between the reference clause and the statement.
    for pattern in _CROSSREF_NAMED_PATTERNS:
        match = re.match(pattern, sentence, flags=re.IGNORECASE)
        if not match:
            continue
        remainder = sentence[match.end():].lstrip(" \t\r\n\"“”'’,.:;-")
        if not remainder:
            return sentence

        tokens = list(re.finditer(r"\S+", remainder))
        cut_at: int | None = None
        for i, tok in enumerate(tokens):
            word = tok.group(0).strip("\"“”'’,.:;-")
            bare = re.sub(r"[^A-Za-z']", "", word).lower()
            if not bare:
                continue
            is_cap = word[:1].isupper()
            # The real statement opens with a capitalized action verb.
            if is_cap and bare in _CROSSREF_STATEMENT_VERBS:
                cut_at = tok.start()
                break
            # Names sit between the reference clause and the statement; allow
            # at most a short run of name-like tokens before giving up.
            if i >= 6:
                break

        if cut_at is None:
            return sentence
        statement = remainder[cut_at:].strip(" \t\r\n\"“”'’,.:;-")
        if not statement or not _CROSSREF_STATEMENT_START.match(statement):
            return sentence
        return statement[:1].upper() + statement[1:]
    return sentence


def _normalize_quote_candidate(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip(" \t\r\n,;:-—")
    if not text:
        return ""
    return text[:1].upper() + text[1:]


def _has_incomplete_tail(text: str) -> bool:
    if "…" in text:
        return True
    words = re.findall(r"[A-Za-z']+", text)
    if not words:
        return True
    return words[-1].lower() in INCOMPLETE_TAIL_WORDS


def _has_incomplete_head(text: str) -> bool:
    lower = text.strip().lower()
    return any(lower.startswith(pattern) for pattern in INCOMPLETE_HEAD_PATTERNS)


def _split_quote_clauses(sentence: str) -> list[str]:
    """Create displayable clause candidates without cutting off mid-thought."""
    sentence = _strip_leading_preamble_clause(sentence.strip())
    candidates: list[str] = []

    def add(value: str, *, add_period: bool = False) -> None:
        value = _normalize_quote_candidate(value)
        if not value:
            return
        if add_period and value[-1] not in ".!?":
            value = f"{value}."
        if value not in candidates:
            candidates.append(value)

    add(sentence)

    split_patterns = (
        r"\s+and then\s+",
        r"\s+so that\s+",
        r"\s+which resulted in\s+",
        r"\s+even though\s+",
        r"\s+despite\s+",
        r"\s+because\s+",
        r"\s+if\s+",
        r"\s+without\s+",
        r"\s+but\s+",
        r"\s+and\s+(?=(?:she|he|they|i|my|the)\b)",
        r"\s*[;:]\s*",
        r"\s+—\s+",
        r"—(?=(?:and|even|despite|because)\b)",
        r",\s+(?=(?:despite|because|after|when|while|without|but)\b)",
    )
    for pattern in split_patterns:
        parts = re.split(pattern, sentence, maxsplit=1, flags=re.IGNORECASE)
        if len(parts) != 2:
            continue
        add(parts[0], add_period=True)
        add(parts[1])

    action_match = re.search(
        r"\b(she|he|they|this judge|the judge|the therapist|naomi|coreen)\s+"
        r"(?:refused|denied|ignored|lied|took|threatened|stripped|forced|removed|ordered|"
        r"vacated|blocked|silenced|mocked|falsified|coerced|withheld|dismissed|"
        r"overruled|bypassed|intimidated|retaliated|separated|allowed|used)\b.*",
        sentence,
        flags=re.IGNORECASE,
    )
    if action_match:
        add(action_match.group(0))

    return candidates


# Optional adverbs families stack in front of a conduct verb in run-on writing.
_EVENT_LEAD_ADVERBS = r"(?:literally|completely|basically|just|then|simply|essentially|actually)\s+"
# Where an extracted event clause should stop: the next coordinating "and"/"but",
# a hard stop, or a comma that begins a new clause.
_EVENT_CLAUSE_BOUNDARY = re.compile(r"\s+and\s+|\s+but\s+|[;:.]|,\s+(?=\w)", re.IGNORECASE)
# Verbs that take an infinitive complement ("allowed X TO do Y"). Pulled out of
# a run-on they fragment into a bare "Allowed opposing counsel" — incomplete and
# confusing — unless the "to …" survives. Require the complement before keeping.
_COMPLEMENT_VERBS = frozenset({
    "allowed", "permitted", "forced", "told", "asked", "got", "led", "used",
    "helped", "help", "gave", "ordered", "coerced", "threatened",
})


def _event_clause_candidates(sentence: str, char_budget: int) -> list[str]:
    """Pull bounded conduct clauses out of a run-on sentence.

    Family comments often chain events onto bare "and"s with no subject pronoun
    ("no new information and literally dismantled a six-figure judgment and
    Order stating ..."). _split_quote_clauses' pronoun-gated "and" split misses
    those, so the strongest event stays trapped inside an over-budget sentence
    and gets dropped. For each (optionally adverb-led) conduct verb, take the
    words from the verb up to the next clause boundary as its own candidate."""
    verb_alt = "|".join(re.escape(v) for v in ACTION_VERBS)
    pattern = re.compile(rf"(?:{_EVENT_LEAD_ADVERBS})?\b(?:{verb_alt})\b", re.IGNORECASE)
    out: list[str] = []
    for match in pattern.finditer(sentence):
        rest = sentence[match.start():]
        boundary = _EVENT_CLAUSE_BOUNDARY.search(rest, 1)
        clause = (rest[: boundary.start()] if boundary else rest).strip(" ,;:.—-")
        clause = _normalize_quote_candidate(clause)
        if not clause or not (24 <= len(clause) <= char_budget):
            continue
        # Drop fragments of complement-taking verbs that lost their "to …"
        # ("Allowed opposing counsel" cut before "to characterize my concerns").
        clause_lower = clause.lower()
        lead_words = re.sub(_EVENT_LEAD_ADVERBS, "", clause_lower, count=1).split()
        lead_verb = lead_words[0] if lead_words else ""
        if lead_verb in _COMPLEMENT_VERBS and " to " not in clause_lower:
            continue
        out.append(clause)
    return out


def _fit_quote_sentence(sentence: str, char_budget: int) -> str:
    """Prefer a clean event clause over an ellipsis when a sentence is long."""
    sentence = _strip_leading_preamble_clause(sentence.strip())
    if len(sentence) <= char_budget and not _has_incomplete_tail(sentence):
        return sentence

    for candidate in _split_quote_clauses(sentence):
        if (
            24 <= len(candidate) <= char_budget
            and not _has_incomplete_tail(candidate)
            and not _is_dangling_pronoun_excerpt(candidate, sentence)
        ):
            return candidate

    return sentence


def _is_safe_quote_sentence(sentence: str, *, is_continuation: bool = False) -> bool:
    sentence = _normalize_quote_candidate(_strip_leading_preamble_clause(sentence))
    if not sentence:
        return False
    lower = sentence.lower()
    if any(lower.startswith(phrase) for phrase in PREAMBLE_STARTS):
        return False
    # A head like "And …" only disqualifies a sentence that would OPEN a quote.
    # Inside a multi-sentence passage the previous sentence anchors it ("… in
    # the court room. And they would lock eyes and nod."), so the passage can
    # keep the family's full thought instead of dropping its closing line.
    if not is_continuation and _has_incomplete_head(sentence):
        return False
    return not (
        _has_incomplete_tail(sentence)
        or _is_legal_boilerplate(sentence)
        or _is_insult_only(sentence)
        or _is_unsupported_character_attack(sentence)
        or _is_pure_crossref(sentence)
    )


def _quote_passage_candidates(sentences: list[str], char_budget: int) -> list[str]:
    """Return adjacent-sentence quote candidates that preserve context.

    Many family comments are a few short sentences where the first line is the
    emotional frame ("Useless.", "Being manipulated by mother.") and the next
    line is the factual claim. The old selector scored each sentence alone,
    which stripped off that context and surfaced weaker fragments. Combine up
    to three adjacent safe sentences when the passage still fits the frame.
    """
    candidates: list[str] = []
    seen: set[str] = set()

    # A roomy budget (few quotes on the frame) can hold far more than three
    # sentences — widen the window so a lone long comment can fill the card.
    max_span = 3 if char_budget <= 200 else 8

    for start in range(len(sentences)):
        parts: list[str] = []
        start_passages: list[str] = []
        for sentence in sentences[start:start + max_span]:
            cleaned = _normalize_quote_candidate(_strip_leading_preamble_clause(sentence))
            # Continuation heads ("And they would lock eyes and nod.") are only
            # safe inside a passage that opens where the family opened — a
            # mid-comment window has no anchor for the connective.
            if not _is_safe_quote_sentence(
                cleaned, is_continuation=bool(parts) and start == 0
            ):
                break
            parts.append(cleaned)
            if len(parts) < 2:
                continue
            passage = " ".join(parts).strip()
            if len(passage) > char_budget:
                break
            if not _has_any_verb(passage):
                continue
            start_passages.append(passage)
        for passage in sorted(start_passages, key=len, reverse=True):
            key = passage.lower()
            if key not in seen:
                seen.add(key)
                candidates.append(passage)
    return candidates


# Words/contractions that, when capitalized and following a lowercase word,
# reliably signal the start of a NEW sentence the family wrote without
# punctuation between the two. Kept conservative: only sentence-opening
# pronouns/determiners, never proper nouns, so names ("Megan Beck",
# "Monica Rawlins") do not trigger a false split.
# Note: the pronoun "I" is deliberately excluded — unlike other pronouns it is
# ALWAYS capitalized in English, so it appears mid-sentence constantly and is
# not a reliable new-sentence signal.
_SENTENCE_START_TOKENS = (
    "He",
    "She",
    "They",
    "It",
    "We",
    "My",
    "His",
    "Her",
    "Their",
    "This",
    "These",
    "There",
    "He's",
    "She's",
    "They're",
    "It's",
    "Doesn't",
    "Didn't",
    "Don't",
    "Won't",
    "Can't",
    "Wouldn't",
    "Couldn't",
    "Wasn't",
    "Never",
    "Always",
)

# "The judge"/"The court" style two-word openers handled separately so we do
# not split on a bare capitalized "The" that may begin a noun phrase mid-clause.
_SENTENCE_START_PHRASES = (
    "The judge",
    "The court",
    "The magistrate",
)

# Words that cannot END an English sentence. When one sits right before a
# capitalized sentence-start token, the capital is the family's mid-sentence
# styling ("question myself about My spouse", "would not subpoena My spouse"),
# NOT a new statement — inserting a break there shreds the quote.
_NON_SENTENCE_FINAL_WORDS = INCOMPLETE_TAIL_WORDS | {
    "about",
    "against",
    "between",
    "but",
    "during",
    "her",
    "his",
    "like",
    "my",
    "our",
    "over",
    "regarding",
    "subpoena",
    "than",
    "their",
    "toward",
    "towards",
    "under",
    "your",
}


def _insert_sentence_breaks(text: str) -> str:
    """Insert a period before a clear new-sentence start that the family typed
    without any punctuation between two statements.

    Example: "Not for families He's a biased lying judge" becomes
    "Not for families. He's a biased lying judge".
    """
    contraction = "(?:['’](?:s|re|t|ll|ve|d))?"

    def break_unless_object(match: re.Match) -> str:
        # The word before the token must be able to END a sentence; a
        # preposition/possessive lead-in ("about My …") means the capitalized
        # token is that word's object, not a new statement.
        prev = match.group(1)
        if prev.lower().strip("'’") in _NON_SENTENCE_FINAL_WORDS:
            return match.group(0)
        return f"{prev}.{match.group(2)}{match.group(3)}"

    # Two-word phrase openers ("The judge ...") following a lowercase word.
    for phrase in _SENTENCE_START_PHRASES:
        first, second = phrase.split(" ", 1)
        text = re.sub(
            rf"\b([A-Za-z'’]*[a-z])(\s+)({re.escape(first)}\s+{re.escape(second)})\b",
            break_unless_object,
            text,
        )

    for token in _SENTENCE_START_TOKENS:
        base = token.split("'")[0]
        # Only break when the preceding word ends in a lowercase letter (i.e.
        # mid-text, no existing sentence punctuation), and the token is a
        # standalone word followed by another word.
        text = re.sub(
            rf"\b([A-Za-z'’]*[a-z])(\s+)({re.escape(base)}{contraction})(?=\s+[A-Za-z])",
            break_unless_object,
            text,
        )
    return text


# Gendered third-person pronouns, used to detect excerpts that lost their
# referent. "they" is excluded: it carries no gender, so an excerpted
# "They …" cannot misgender anyone.
_MASCULINE_REF = re.compile(r"\b(?:he|him|his)\b", re.IGNORECASE)
_FEMININE_REF = re.compile(r"\b(?:she|her|hers)\b", re.IGNORECASE)
_GENDERED_LEAD_PRONOUN = re.compile(r"^(?:he|she|him|her|his|hers)\b", re.IGNORECASE)


def _is_dangling_pronoun_excerpt(candidate: str, source_text: str) -> bool:
    """True when an excerpt opens with a gendered pronoun whose antecedent was
    cut away.

    A comment can talk about more than one person (the actor AND the judge).
    Excerpting a mid-comment sentence that opens with a bare "He …"/"She …"
    drops the earlier sentence that said who that is. When that dropped text
    referred to someone of the OTHER gender, the excerpt's pronoun reads as
    describing the wrong person — a female attorney's slide quoting "He would
    check his phone …" (the judge) made the attorney sound male. An excerpt
    whose cut-away lead-in only ever used the same gender (or no pronoun at
    all) keeps a single plausible referent and stays allowed.
    """
    match = _GENDERED_LEAD_PRONOUN.match(candidate)
    if not match:
        return False
    lower_source = _normalize_quote_candidate(source_text).lower()
    head = candidate.lower().rstrip(".!?…").strip()
    at = lower_source.find(head)
    if at < 0:
        # Normalization (preamble strip, added period) kept us from locating
        # the excerpt — try its opening words before giving up.
        at = lower_source.find(head[:30])
    if at < 0:
        # Cannot prove the lead-in is safe; keep the pronoun excerpt out.
        return bool(
            _MASCULINE_REF.search(lower_source) and _FEMININE_REF.search(lower_source)
        )
    preceding = lower_source[:at]
    is_masculine_lead = bool(_MASCULINE_REF.match(match.group(0)))
    opposite = _FEMININE_REF if is_masculine_lead else _MASCULINE_REF
    return bool(opposite.search(preceding))


def _quote_candidates(text: str, char_budget: int) -> list[str]:
    text = _insert_sentence_breaks(text)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    if not sentences:
        sentences = [text]

    candidates: list[str] = []
    seen: set[str] = set()
    for candidate in _quote_passage_candidates(sentences, char_budget):
        key = candidate.lower()
        if key in seen:
            continue
        seen.add(key)
        candidates.append(candidate)

    for sentence in sentences:
        # Reject the whole sentence if it is court-filing boilerplate. Checking
        # before the clause split matters: splitting on "and" can shed the
        # "Plaintiff" marker and leak a filing fragment ("the biological mother
        # of three minor children") that no per-clause check would catch.
        if _is_legal_boilerplate(sentence):
            continue
        sentence_clauses = _split_quote_clauses(sentence)
        # Run-on rescue: an over-budget sentence never surfaces as a clause, so
        # mine its buried conduct events ("dismantled a six-figure judgment").
        if len(sentence) > char_budget:
            sentence_clauses = sentence_clauses + _event_clause_candidates(sentence, char_budget)
        for candidate in sentence_clauses:
            if (
                len(candidate) > char_budget
                or _has_incomplete_tail(candidate)
                or _has_incomplete_head(candidate)
                or _is_legal_boilerplate(candidate)
                or _is_insult_only(candidate)
                or _is_unsupported_character_attack(candidate)
            ):
                continue
            key = candidate.lower()
            if key in seen:
                continue
            seen.add(key)
            candidates.append(candidate)
    return [c for c in candidates if not _is_dangling_pronoun_excerpt(c, text)]


def _has_action_verb(sentence_lower: str) -> bool:
    return any(re.search(rf"\b{re.escape(verb)}\b", sentence_lower) for verb in ACTION_VERBS)


def _is_legal_boilerplate(sentence: str) -> bool:
    """True when a candidate is pasted court-filing text rather than a family's
    own words (third-person "Plaintiff"/"Defendant", section headers, etc.)."""
    lower = sentence.lower()
    if any(term in lower for term in _LEGAL_BOILERPLATE_TERMS):
        return True
    if _SEE_REFERENCE_START.match(sentence):
        return True
    return bool(_LEGAL_HEADER_START.match(sentence))


def _is_unsupported_character_attack(sentence: str) -> bool:
    lower = sentence.lower()
    if not any(term in lower for term in _UNSUPPORTED_CHARACTER_ATTACK_TERMS):
        return False
    return not _has_action_verb(lower) and not _has_specific_time(sentence)


# Common verbs (and auxiliaries) used to confirm a quote is a real statement
# rather than a bare noun phrase ("My children"). Past-tense -ed words are
# detected separately by regex.
_COMMON_VERBS = frozenset(
    {
        "is", "are", "was", "were", "be", "been", "being", "am",
        "has", "have", "had",
        "do", "does", "did", "doesn't", "didn't", "don't",
        "doesnt", "didnt", "dont",
        "will", "would", "wont", "won't", "can", "can't", "cant",
        "could", "couldn't", "couldnt", "should", "shouldn't",
        "lied", "lies", "lie", "lying",
        "said", "says", "say", "saying",
        "told", "tells", "tell", "telling",
        "ignored", "ignores", "ignore", "ignoring",
        "denied", "denies", "deny", "denying",
        "refused", "refuses", "refuse", "refusing",
        "allowed", "allows", "allow", "allowing",
        "took", "takes", "take", "taking", "taken",
        "gave", "gives", "give", "giving", "given",
        "made", "makes", "make", "making",
        "kept", "keeps", "keep", "keeping",
        "let", "lets", "letting",
        "went", "goes", "go", "going", "gone",
        "ruled", "rules", "rule", "ruling",
        "judged", "judges", "judge", "judging",
        "follow", "follows", "followed", "following",
        "hates", "hate", "hated", "hating",
        "appeared", "appears", "appear",
        "removed", "removes", "remove", "removing",
        "withheld", "withholds", "withhold", "withholding",
        "destroyed", "destroys", "destroy",
        "needs", "need", "needed",
        "met", "meets", "meet",
        "played", "plays", "play",
        "led", "leads", "lead", "leading",
        "billed", "bills", "bill", "billing",
        "manipulated", "manipulates", "manipulate", "manipulating",
        "overstepped", "oversteps", "overstep", "overstepping",
        "called", "calls", "call", "calling",
        "helped", "helps", "help", "helping",
        "reunited", "reunites", "reunite", "reuniting",
    }
)


def _has_any_verb(text: str) -> bool:
    """Heuristic: does the text contain at least one verb (a real statement)?

    Used to reject bare noun-phrase scraps like "My children" while keeping
    short but complete statements like "Ignored evidence." or "Lied on stand."
    """
    words = re.findall(r"[A-Za-z']+", text.lower())
    for word in words:
        if word in _COMMON_VERBS:
            return True
        # Regular past tense / gerund forms (e.g. "ignored", "rescheduled",
        # "judging"). Require a reasonable length to avoid false positives.
        if len(word) >= 5 and (word.endswith("ed") or word.endswith("ing")):
            return True
    return False


def _has_proper_noun(sentence: str) -> bool:
    for match in re.finditer(r"\b[A-Z][a-z][A-Za-z'-]*\b", sentence):
        if match.start() == 0:
            continue
        return True
    return False


def _has_specific_time(sentence: str) -> bool:
    month = (
        r"January|February|March|April|May|June|July|August|September|"
        r"October|November|December"
    )
    number_word = r"\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve"
    return bool(
        re.search(rf"\bfor\s+(?:{number_word})\s+(?:minutes?|hours?|days?|weeks?|months?|years?)\b", sentence, re.I)
        or re.search(rf"\b(?:{month})\s+\d{{1,2}},\s+\d{{4}}\b", sentence)
        or re.search(r"\bin\s+\d{4}\b", sentence, re.I)
    )


def _score_quote_sentence(sentence: str, char_budget: int) -> int:
    sentence = _fit_quote_sentence(sentence.strip(), char_budget)
    lower = sentence.lower()
    score = 0

    for phrase in PREAMBLE_STARTS:
        if lower.startswith(phrase):
            score -= 20

    words = re.findall(r"\b[\w'-]+\b", sentence)
    if len(words) < 8 and not _has_action_verb(lower):
        score -= 10
    if any(phrase in lower for phrase in JUDGMENT_PHRASES):
        score -= 10

    action_matches = sum(
        1 for verb in ACTION_VERBS if re.search(rf"\b{re.escape(verb)}\b", lower)
    )
    score += min(action_matches * 5, 15)

    # A speaker-benefit sentence ("allowed me to ...") reads as praise of the
    # actor — push it well below any real conduct statement.
    if _SPEAKER_BENEFIT.search(lower):
        score -= 12

    if _has_proper_noun(sentence):
        score += 3
    if _has_specific_time(sentence):
        score += 3
    if re.search(r"\b\d+\b", sentence):
        score += 3
    if any(proc in lower for proc in LEGAL_PROCEDURES):
        score += 3

    names_outcome = any(noun in lower for noun in RULING_NOUNS)
    if names_outcome:
        score += 3
    # A conduct verb acting on a court outcome ("dismantled a six-figure
    # judgment", "reversed the custody order") is the most concrete, on-message
    # quote a family can give. Reward the pairing so it beats a vague lead that
    # merely fits the frame or a passage that only mentions the outcome in
    # passing.
    if action_matches and names_outcome:
        score += 5

    # When the frame has room to spare (1-2 quotes → generous budget), favor
    # the candidate that actually uses it: a fuller passage beats an equally
    # strong fragment so the slide fills instead of floating one short line.
    # Capped at +6 so conduct/outcome signals still dominate the ranking.
    if char_budget >= 220:
        score += min(len(sentence) * 6 // char_budget, 6)

    # Demote a candidate that conveys no conduct, consequence, attribution, or
    # court outcome anywhere — it only fits the frame on incidental signals (a
    # digit, a capitalized word). A bare "this judge came in New." must not beat
    # a real event clause on those generic bonuses alone. (Authentic emotional
    # frames like "Useless." survive because their factual follow-on carries a
    # conduct verb, so the whole candidate still conveys conduct.)
    conveys_conduct = (
        action_matches
        or names_outcome
        or any(phrase in lower for phrase in CONSEQUENCE_PHRASES)
        or any(phrase in lower for phrase in DIRECT_ATTRIBUTION_PHRASES)
        or any(proc in lower for proc in LEGAL_PROCEDURES)
    )
    if not conveys_conduct:
        score -= 6

    if any(phrase in lower for phrase in CONSEQUENCE_PHRASES):
        score += 2
    if any(phrase in lower for phrase in DIRECT_ATTRIBUTION_PHRASES):
        score += 2
    if "pen and paper" in lower or "could not cry" in lower:
        score += 4

    if len(sentence) <= char_budget:
        score += 5
    else:
        score -= 2
    if len(sentence) > 2 * char_budget:
        score -= 8

    return score


# A comment whose ENTIRE text is just a cross-reference clause (e.g. the family
# wrote only "I already added this" with no real statement after it) is pure
# junk and must never display.
_PURE_CROSSREF = re.compile(
    r"^(?:"
    r"i\s+already\s+(?:added|reported|submitted)\s+(?:this|him|her|them)|"
    r"same\s+(?:judge|person|magistrate)?\s*(?:as|has)?\s*(?:previously\s+)?"
    r"(?:listed|reported)?|"
    r"see\s+(?:also|above)|"
    r"as\s+(?:noted|mentioned|stated)\s+(?:previously|above|before)"
    r")[\s\"“”'’.,:;-]*$",
    re.IGNORECASE,
)


def _is_pure_crossref(quote: str) -> bool:
    """True when the text is nothing but a cross-reference identifier clause."""
    return bool(_PURE_CROSSREF.match(quote.strip()))


def _is_real_statement(quote: str) -> bool:
    """A displayed quote must be a real statement: it has a verb, OR it is long
    enough that it is clearly a full thought even if our verb list missed it.

    Short noun-phrase scraps ("My children") are rejected; short but complete
    statements ("Ignored evidence.", "Lied on stand.") are kept. Pure
    cross-reference junk ("I already added this") is always rejected.
    """
    if not quote:
        return False
    if _is_pure_crossref(quote):
        return False
    word_count = len(re.findall(r"[A-Za-z']+", quote))
    if _has_any_verb(quote):
        return True
    # No verb detected: only allow it through if it is not a tiny fragment.
    return word_count >= 5


# How strongly to favor a comment's opening sentences (see use in
# select_best_quote). Index 0 → +4, 1 → +3, … 0 after the 4th candidate.
_LEAD_BONUS_CAP = 4


def select_best_quote(
    text: str,
    char_budget: int = 140,
    prefer_substrings: list[str] | None = None,
) -> str:
    """Return the strongest deterministic sentence within the display budget."""
    text = _sanitize_quote_text(text)
    if not text:
        return ""

    prefer_needles = [
        s.lower().strip()
        for s in (prefer_substrings or [])
        if isinstance(s, str) and s.strip()
    ]
    scored: list[tuple[int, int, str]] = []
    for index, candidate in enumerate(_quote_candidates(text, char_budget)):
        score = _score_quote_sentence(candidate, char_budget)
        lower = candidate.lower()
        if prefer_needles and any(needle in lower for needle in prefer_needles):
            score += 100
        # Favor how the family actually opened: a small decaying bonus (index 0
        # → +4, 1 → +3, … 0 after the 4th candidate) so the lead line wins ties
        # and near-ties against a weaker later sentence that only edged ahead on
        # a generic bonus (e.g. a "3 yrs" digit match). Kept small on purpose —
        # preambles and verbless scraps already carry large negative scores, so
        # the lead bonus cannot resurrect junk; it only breaks close calls.
        score += max(0, _LEAD_BONUS_CAP - index)
        scored.append((score, index, candidate))

    chosen = ""
    if scored:
        ranked = sorted(scored, key=lambda item: (-item[0], item[1]))
        chosen = ranked[0][2]
        for score, _, sentence in ranked:
            if score > 0:
                chosen = sentence
                break
    elif "…" not in text:
        fitted = _fit_quote_sentence(text, char_budget)
        if _is_legal_boilerplate(fitted):
            chosen = ""
        elif _is_insult_only(fitted):
            chosen = ""
        elif _is_unsupported_character_attack(fitted):
            chosen = ""
        elif len(fitted) <= char_budget and not _has_incomplete_tail(fitted):
            chosen = fitted
        else:
            chosen = _truncate_quote(fitted, char_budget)

    # Reject scraps with no verb that are too short to be a real statement.
    if chosen and not _is_real_statement(chosen):
        return ""
    if chosen and _is_insult_only(chosen):
        return ""
    return chosen


def _quote_dedupe_keys(body: str) -> tuple[str, str]:
    full = re.sub(r"\s+", " ", body).strip().lower()
    words = re.findall(r"\b\w+\b", full)
    prefix = " ".join(words[:10])
    return full, prefix
# NOTE: near-duplicate (token-overlap) dedup deliberately does NOT live here.
# At render time family attribution is gone, and two genuinely different
# families can phrase near-identical experiences ("Denied motion number 3
# without a hearing" / "... number 7 ..."). Family-aware merging happens
# upstream where reporter identity is known: scripts/pdf/lib_supabase_rows.py
# (one merged comment per family) and spotlight_build.py (one merged note per
# submission on the raw-notes fallback path).


def story_quotes(spec: dict, n: int | None = 3) -> list[dict]:
    """Returns {body, kind} dicts for the quote frame(s).

    Precedence — strict, EXCLUSIVE sources after validation:
      1. spec.supabase.public_comments  (admin-curated court_actors.notes —
         the actor-SPECIFIC family quotes the state PDF shows for this
         exact actor). If any produce a valid rendered quote, the slide uses
         ONLY these.
      2. spec.supabase.family_reports   (survey_submissions.impact_quote —
         broad survey responses from submissions that mentioned this
         actor; not actor-specific). Used when there are zero public_comments
         OR every public_comment is rejected as empty/junk/non-statement.
         We do not mix the two: a top-up from
         family_reports would put broad survey text alongside the PDF's
         actor-specific text on the same slide.

    Each raw body is then routed through select_best_quote so long
    quotes truncate cleanly to the per-frame char budget. Pass n=None when
    rendering the public share page so every publishable actor-specific
    comment is paginated instead of silently capped at one frame.
    """
    sb = spec.get("supabase") or {}
    comments = sb.get("public_comments") or []
    reports = sb.get("family_reports") or []

    def _select(source_items: list[dict], raw_field: str, kind: str) -> list[dict]:
        raw_items = [
            {"raw": str(item.get(raw_field) or "").strip(), "kind": kind}
            for item in source_items
            if str(item.get(raw_field) or "").strip()
        ]

        # Budget follows the REAL number of quotes that will share a page —
        # 1 approved quote gets the whole card (460 chars), 8 get 86 each.
        if n is None:
            page_count = min(len(raw_items), QUOTES_PER_PAGE)
        else:
            page_count = min(len(raw_items), n)
        char_budget = _quote_char_budget(page_count or 3)

        override_budget = (spec.get("render") or {}).get("quote_char_budget")
        if isinstance(override_budget, int) and override_budget > 0:
            char_budget = override_budget

        out: list[dict] = []
        seen_full_keys: set[str] = set()
        seen_prefix_keys: set[str] = set()
        accepted_bodies: list[str] = []
        for item in raw_items:
            body = select_best_quote(
                item["raw"],
                char_budget=char_budget,
                prefer_substrings=(spec.get("render") or {}).get("prefer_quote_substrings"),
            )
            if not body:
                continue
            full_key, prefix_key = _quote_dedupe_keys(body)
            if full_key in seen_full_keys or (prefix_key and prefix_key in seen_prefix_keys):
                continue
            if any(full_key in accepted or accepted in full_key for accepted in accepted_bodies):
                continue
            seen_full_keys.add(full_key)
            if prefix_key:
                seen_prefix_keys.add(prefix_key)
            accepted_bodies.append(full_key)
            out.append({"body": body, "kind": item["kind"]})
            if n is not None and len(out) >= n:
                break
        return out

    selected_comments = _select(comments, "comment_text", "comment")
    if selected_comments:
        return selected_comments
    return _select(reports, "body", "family_report")


# Max family quotes stacked on a single "What families say" frame before a
# second page is started. The 9:16 card fits 8 short (≤14-word) quotes legibly;
# the f4-count-* CSS rules shrink the type as the count rises so nothing
# overflows. Actors with more than this paginate (e.g. 12 -> 8 + 4).
QUOTES_PER_PAGE = 8


def chunk_quote_pages(quotes: list[dict], per_page: int = QUOTES_PER_PAGE) -> list[list[dict]]:
    if not quotes:
        return [[]]
    return [quotes[i:i + per_page] for i in range(0, len(quotes), per_page)]


def record_rendered_quote_metadata(spec: dict) -> list[dict]:
    """Record exactly what the quote frame renderer selected.

    The rebuild admin and Blotato preview read this generated spec. Persisting
    the final selected text keeps their readiness status honest without
    reimplementing this renderer's filtering/scoring rules in TypeScript.
    """
    quotes = story_quotes(spec, n=None)
    render_meta = dict(spec.get("render") or {})
    render_meta["selected_quotes"] = quotes
    render_meta["quote_page_count"] = len(chunk_quote_pages(quotes))
    spec["render"] = render_meta
    return quotes


# ---------------------------------------------------------------------------
# Photo handling
# ---------------------------------------------------------------------------
def photo_block(spec: dict, web_mode: bool = False) -> str:
    """Render either the actor photo with a 60% navy overlay, or a placeholder.

    Real photos render ABOVE the flag layer so the flag doesn't bleed across
    the actor's face. Placeholder mode keeps the flag visible behind the
    gradient because the placeholder has no photo content to obscure.

    web_mode=True embeds the photo as a base64 data URL directly in the HTML.
    This avoids the iOS Safari canvas-tainting bug where html2canvas can't
    read a canvas that touched a non-data-URL image (even same-origin), which
    surfaces as "Save failed: The operation is insecure" when the Save/Share
    buttons try toBlob() on the rendered canvas. Data URLs are part of the
    document, so the canvas stays CORS-clean.

    Local file:// mode keeps the file:// URL with a cache-busting query so
    Chrome refetches when the photo is updated.
    """
    import base64

    photo = spec.get("photo") or {}
    rel = photo.get("path")
    if photo.get("exists") and rel:
        rel_path = Path(rel)
        full = (rel_path if rel_path.is_absolute() else (PHOTO_ROOT / rel_path)).resolve()
        try:
            cache_bust = f"?v={int(full.stat().st_mtime)}" if full.exists() else ""
        except OSError:
            cache_bust = ""

        if web_mode:
            # Embed as data URL — bulletproof against canvas tainting on iOS.
            try:
                data = full.read_bytes()
                mime = {
                    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                    ".webp": "image/webp", ".gif": "image/gif",
                }.get(full.suffix.lower(), "image/png")
                b64 = base64.b64encode(data).decode("ascii")
                url = f"data:{mime};base64,{b64}"
            except OSError:
                url = f"image_1080.png{cache_bust}"   # fallback to relative path
        else:
            url = f"file://{full}{cache_bust}"
        return (
            f'<div class="photo-bg photo-real" style="background-image:url(\'{url}\');">'
            f'<div class="photo-overlay"></div>'
            f"</div>"
        )
    return (
        '<div class="photo-bg photo-placeholder">'
        '<div class="ph-silhouette"></div>'
        '<div class="ph-overlay"></div>'
        '<div class="ph-tag">{{ACTOR.IMAGE_URL}} · 1080×1920 · pad-don\'t-crop</div>'
        "</div>"
    )


# ---------------------------------------------------------------------------
# Waving flag SVG (matches src/flag.jsx + Spotlight Stories v2)
# ---------------------------------------------------------------------------
def _star_points(cx: float, cy: float, r_outer: float, r_inner: float, n: int = 5) -> str:
    step = math.pi / n
    pts = []
    for i in range(n * 2):
        r = r_outer if i % 2 == 0 else r_inner
        a = i * step - math.pi / 2
        pts.append(f"{cx + math.cos(a) * r:.1f},{cy + math.sin(a) * r:.1f}")
    return " ".join(pts)


def flag_svg() -> str:
    stripe_h = 147.7  # 1920 / 13
    stripes = "\n".join(
        f'<rect x="0" y="{i * stripe_h:.1f}" width="1080" height="{stripe_h:.1f}" '
        f'fill="{"#9F1F2C" if i % 2 == 0 else "#F2EAD6"}" />'
        for i in range(13)
    )
    canton_h = stripe_h * 7
    stars: list[str] = []
    star_rows = 9
    canton_w = 480
    for r in range(star_rows):
        cols = 6 if r % 2 == 0 else 5
        for c in range(cols):
            x = ((0 if r % 2 == 0 else 0.5) + c) * (canton_w / 6) + 40
            y = (r + 0.5) * (canton_h / star_rows)
            stars.append(
                f'<polygon points="{_star_points(x, y, 18, 9, 5)}" fill="#ECE7DC" />'
            )

    return f"""
<svg viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <filter id="wave">
      <feTurbulence type="fractalNoise" baseFrequency="0.008 0.02" numOctaves="2" seed="3">
        <animate attributeName="baseFrequency" dur="14s" repeatCount="indefinite"
          values="0.008 0.02;0.012 0.024;0.008 0.02" />
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" scale="46" />
    </filter>
  </defs>
  <g filter="url(#wave)">
    {stripes}
    <rect x="0" y="0" width="{canton_w:.0f}" height="{canton_h:.1f}" fill="#10243F" />
    {"".join(stars)}
  </g>
</svg>
"""


# ---------------------------------------------------------------------------
# Reusable frame parts (Spotlight Stories v2 components, Python-rendered)
# ---------------------------------------------------------------------------
def state_badge(state: str, state_abbr: str, county: str) -> str:
    """Top-right STATE OF / [STATE] yellow stamp + small caption."""
    if county:
        # Strip trailing 'County' / 'Co.' / state suffix so we don't render 'COUNTY CO.'
        c = county.strip()
        c = re.sub(r"\s+(county|co\.?)\s*$", "", c, flags=re.IGNORECASE)
        c = re.sub(r"\s+ohio|\s+california|\s+texas|\s+florida|\s+kansas|\s+tennessee|\s+montana|\s+south carolina$", "", c, flags=re.IGNORECASE)
        c = c.strip()
        county_caption = f"{esc(state_abbr.upper())} · {esc(c.upper())} CO." if c else esc(state_abbr.upper())
    else:
        county_caption = esc(state_abbr.upper())
    return f"""
<div class="state-badge">
  <div class="sb-eyebrow">STATE OF</div>
  <div class="sb-stamp">{esc(state.upper())}</div>
  <div class="sb-caption">{county_caption}</div>
</div>
"""


def frame_tag(text: str) -> str:
    """JetBrains Mono top-left tag e.g. COURT ACTOR · EXPOSED."""
    return f'<div class="frame-tag">{esc(text)}</div>'


def actor_id_strip(first: str, last: str, role: str, state: str) -> str:
    """Bottom name + role/state strip above the MovementFoot."""
    name = " ".join(p for p in (first, last) if p).upper()
    return f"""
<div class="actor-id-strip">
  <div class="aid-name">{esc(name)}</div>
  <div class="aid-role">{esc(role)} · {esc(state)}</div>
</div>
"""


def movement_foot() -> str:
    """Very bottom: @STANDWITHMEG | STANDWITHMEG.COM."""
    return """
<div class="movement-foot">
  <div class="mf-handle">@STANDWITHMEG</div>
  <div class="mf-url">STANDWITHMEG.COM</div>
</div>
"""


def legal_foot() -> str:
    # Canonical legal footer (brand signoff.md, 2026-06-05): the
    # "· not court findings" tail is retired — never append it.
    return '<div class="legal">Family-reported submissions.</div>'


def frame_actions(num: int) -> str:
    return f"""
<div class="frame-actions" aria-label="Frame {num} actions">
  <button type="button" data-save="frame-{num:02d}">Save image</button>
  <button type="button" data-share="frame-{num:02d}">Share</button>
</div>
"""


# ---------------------------------------------------------------------------
# Seven frame compositions — matches Spotlight Stories v2.html
# ---------------------------------------------------------------------------
def frame_1_who(actor: dict, role: str, court: str, state: str, state_abbr: str, county: str,
                actor_submission_count: Any, state_family_count: Any, spec: dict, big_name_html: str,
                web_mode: bool = False, frame_id: str = "frame-01") -> str:
    """Frame 1 cover — uses the actor's survey-submission count, matching the card.

    When a real photo is wired, we add `has-real-photo` so the dossier overlays
    (grain, scanlines, vignette, top photo-overlay) dial back and the face stays clear.

    state_family_count is the statewide Registry total (e.g. 321 CA families).
    Rendered as a small caption below the actor count when present; hidden
    entirely when missing so we never show "0" or "Review" to the public.
    """
    has_photo = bool((spec.get("photo") or {}).get("exists"))
    extra_class = " has-real-photo" if has_photo else ""

    state_count_html = ""
    try:
        state_count_int = int(float(state_family_count)) if state_family_count not in (None, "") else 0
    except (TypeError, ValueError):
        state_count_int = 0
    if state_count_int > 0 and state_abbr:
        state_count_html = (
            f'<div class="f1-state-count">'
            f'<b>{state_count_int:,}</b> {esc(state_abbr.upper())} families in the Registry'
            f'</div>'
        )

    return f"""
<article class="frame f1{extra_class}" id="{frame_id}">
  {photo_block(spec, web_mode=web_mode)}
  <div class="flag-bg flag-bg--cover">{flag_svg()}</div>
  <div class="grain"></div>
  <div class="scanlines"></div>
  <div class="vignette"></div>
  {state_badge(state, state_abbr, county)}
  {frame_tag("COURT ACTOR · EXPOSED")}
  <div class="f1-headline">
    <div class="display xl">{big_name_html}</div>
    <div class="f1-role">{esc(role)}</div>
    <div class="f1-report-count">
      <b>{fmt_int(actor_submission_count)}</b>
      <span>survey submissions named this person on the public record</span>
    </div>
    {state_count_html}
  </div>
  {movement_foot()}
  {legal_foot()}
</article>
"""


def frame_2_meg_intro(frame_id: str = "frame-02") -> str:
    return f"""
<article class="frame f2" id="{frame_id}">
  <img class="f2-meg-img" src="{frame_id}.jpg" alt="">
</article>
"""


def image_frame(frame_id: str, display_name: str, index: int, total: int, version: str = "") -> str:
    """Visible website frame: display the approved prerendered JPEG directly.

    `version` is a content hash of the JPEG, appended as a cache-busting query
    so browsers/CDNs fetch the new slide the moment a regeneration deploys
    (the JPEG filenames never change, so without this an updated slide can
    keep serving from cache).
    """
    suffix = f"?v={version}" if version else ""
    return f"""
<article class="frame frame-image" id="{frame_id}">
  <img class="frame-img" src="{frame_id}.jpg{suffix}" alt="{esc(display_name)} share slide {index} of {total}">
</article>
"""


def hidden_render_metadata(cards: list[str]) -> str:
    """Keep rendered text available for consistency checks without showing it."""
    source = "\n".join(card.replace(' id="frame-', ' data-source-id="frame-') for card in cards)
    return f"""
<div class="render-metadata" hidden aria-hidden="true">
{source}
</div>
"""


def frame_3_they_thought(state: str, state_abbr: str, county: str, first: str, last: str, role: str,
                         frame_id: str = "frame-03") -> str:
    return f"""
<article class="frame f3" id="{frame_id}">
  <div class="flag-bg">{flag_svg()}</div>
  <div class="grain"></div>
  <div class="scanlines"></div>
  <div class="vignette"></div>
  {state_badge(state, state_abbr, county)}
  {frame_tag("NOT ANY MORE")}
  <div class="f3-headline">
    <div class="display xl">
      THEY THOUGHT<br>
      THEY COULD<br>
      <span class="red-bar">KEEP US</span><br>
      <span class="gold">QUIET.</span>
    </div>
    <div class="not-any-more-stamp">Not any more!</div>
  </div>
  {actor_id_strip(first, last, role, state)}
  {movement_foot()}
  {legal_foot()}
</article>
"""


def frame_4_pull_quote(quotes: list[dict], state: str, state_abbr: str, county: str,
                      first: str, last: str, role: str, frame_id: str = "frame-04",
                      page_number: int = 1, page_total: int = 1) -> str:
    """Stacks up to 8 family quotes per page, each in italic Fraunces with a small
    crimson bullet and 'Anonymous parent · STATE' attribution."""
    if not quotes:
        # Fallback: single empathic placeholder so the frame still composes
        quotes = [{"body": "Families are adding their reports to the public record.", "kind": "placeholder"}]

    quote_blocks = []
    for q in quotes:
        body = q.get("body") or ""
        if not body:
            continue
        quote_blocks.append(
            f'<div class="f4-quote">'
            f'<span class="f4-dot"></span>'
            f'<p class="f4-text">{esc(body)}</p>'
            f'<p class="f4-attr">— Anonymous parent · {esc(state_abbr.upper())}</p>'
            f'</div>'
        )

    quotes_html = "".join(quote_blocks)
    quote_count_class = f" f4-count-{len(quote_blocks)}" if quote_blocks else ""
    # A lone quote may now carry a full passage (up to ~460 chars). The hero
    # 42px size only suits short lines — step down for longer passages so the
    # text fills the card without overflowing it.
    if len(quote_blocks) == 1:
        body_len = len(quotes[0].get("body") or "")
        if body_len > 220:
            quote_count_class += " f4-solo--long"
        elif body_len > 120:
            quote_count_class += " f4-solo--mid"

    return f"""
<article class="frame f4" id="{frame_id}">
  <div class="flag-bg flag-bg--faded">{flag_svg()}</div>
  <div class="grain"></div>
  <div class="scanlines"></div>
  <div class="vignette"></div>
  {state_badge(state, state_abbr, county)}
  {frame_tag("WHAT FAMILIES SAY" if page_total <= 1 else f"WHAT FAMILIES SAY · {page_number}/{page_total}")}
  <div class="f4-body{quote_count_class}">
    {quotes_html}
  </div>
  {actor_id_strip(first, last, role, state)}
  {movement_foot()}
  {legal_foot()}
</article>
"""


def frame_5_counted(state: str, state_abbr: str, county: str, first: str, last: str, role: str,
                   movement_total: Any, frame_id: str = "frame-05") -> str:
    """Center content stacks as a flex column so each line gets its own
    vertical slot — no more overlap between the italic and the pattern."""
    return f"""
<article class="frame f5" id="{frame_id}">
  <div class="flag-bg">{flag_svg()}</div>
  <div class="grain"></div>
  <div class="scanlines"></div>
  <div class="vignette"></div>
  {state_badge(state, state_abbr, county)}
  {frame_tag("COUNTED · PUBLIC RECORD")}
  <div class="f5-stack">
    <div class="f5-mega-number">{fmt_int(movement_total)}</div>
    <div class="f5-mega-label">FAMILIES<br>NATIONWIDE</div>
    <div class="f5-italic">— and now global.</div>
    <div class="f5-pattern">
      Not an <span class="strike">ISOLATED</span> incident.<br>
      <span class="pattern-pill">A PATTERN.</span>
    </div>
  </div>
  {actor_id_strip(first, last, role, state)}
  {movement_foot()}
  {legal_foot()}
</article>
"""


def frame_6_exposing(state: str, state_abbr: str, county: str, stats: dict,
                     frame_id: str = "frame-06") -> str:
    burden = fmt_money(first_nonempty(stats.get("median_financial_loss"), stats.get("avg_financial_loss")))
    pro_se = fmt_pct(stats.get("pro_se_pct"))
    months = fmt_months(first_nonempty(stats.get("median_months_lost"), stats.get("avg_months_lost")))
    family_count_raw = stats.get("state_family_count")
    try:
        n_families = int(family_count_raw) if family_count_raw is not None else 0
    except (TypeError, ValueError):
        n_families = 0
    hero_html = ""
    if n_families > 0:
        hero_html = f"""    <div class="f6-hero-stat">
      <div class="f6-hero-n">{n_families:,}</div>
      <div class="f6-hero-l">FAMILIES IN<br>THE REGISTRY</div>
    </div>
"""
    return f"""
<article class="frame f6" id="{frame_id}">
  <div class="flag-bg">{flag_svg()}</div>
  <div class="grain"></div>
  <div class="scanlines"></div>
  <div class="vignette"></div>
  {state_badge(state, state_abbr, county)}
  {frame_tag("EXPOSING THE PATTERN")}
  <div class="f6-headline">
    What the<br>
    <span class="gold">government</span><br>
    is doing to<br>
    our families.
  </div>
  <div class="f6-stats">
    <div class="f6-stats-label">STATE OF {esc(state.upper())} · LIVE STATS</div>
{hero_html}    <div class="stat-row">
      <span class="stat-n">{burden}</span>
      <span class="stat-l">MEDIAN FAMILY BURDEN</span>
    </div>
    <div class="stat-row">
      <span class="stat-n">{pro_se}</span>
      <span class="stat-l">PARENTS FORCED PRO SE</span>
    </div>
    <div class="stat-row">
      <span class="stat-n">{months}</span>
      <span class="stat-l">MEDIAN TIME LOST</span>
    </div>
  </div>
  {movement_foot()}
  {legal_foot()}
</article>
"""


def frame_7_stand_with_meg(state: str, state_abbr: str, county: str, movement_total: Any, cta: str,
                           frame_id: str = "frame-07") -> str:
    return f"""
<article class="frame f7" id="{frame_id}">
  <div class="flag-bg flag-bg--cover">{flag_svg()}</div>
  <div class="grain"></div>
  <div class="scanlines"></div>
  <div class="vignette"></div>
  {state_badge(state, state_abbr, county)}
  {frame_tag("JOIN THE MOVEMENT")}
  <div class="f7-headline">
    STAND<br>
    <span class="red-bar f7-with">WITH</span><br>
    <span class="gold">MEG.</span>
  </div>
  <div class="f7-cta-text">
    Join over <b class="f7-count">{fmt_int(movement_total)}</b><br>
    families nationwide &amp; global<br>
    exposing the truth.
  </div>
  <div class="f7-pill-stack">
    <div class="f7-visit">VISIT</div>
    <div class="url-pill"><span class="dot"></span>{esc(cta).replace(' ↗', '').replace('↗', '')}</div>
  </div>
  <div class="legal f7-legal">FAMILY-REPORTED SUBMISSIONS.</div>
</article>
"""


# ---------------------------------------------------------------------------
# Main render
# ---------------------------------------------------------------------------
def render(spec: dict, web_mode: bool = False, image_mode: bool = False) -> str:
    actor = spec.get("actor") or {}
    stats = spec.get("state_stats") or {}
    supabase = spec.get("supabase") or {}

    first = (actor.get("first_name") or "").strip()
    last = (actor.get("last_name") or "").strip()
    title = (actor.get("title") or "").strip()
    display_name = actor.get("display_name") or " ".join(p for p in (first, last) if p).strip()
    role = expand_acronyms(actor.get("role") or "Public court actor")
    court = first_nonempty(actor.get("court_or_county"), actor.get("court"), actor.get("county")) or ""
    county = first_nonempty(actor.get("county"), actor.get("court_or_county")) or ""
    state = actor.get("state") or ""
    state_abbr = (actor.get("state_abbr") or "").upper()
    # The public card now displays the number of survey submissions that named
    # this actor. Use the submission/report count first, falling back to the
    # legacy family count only for older specs that do not have a submission
    # count written yet.
    actor_submission_count = first_positive(
        actor.get("actor_report_count"),
        supabase.get("actor_report_count"),
        actor.get("mention_count"),
        actor.get("public_family_count"),
        supabase.get("public_family_count"),
        actor.get("family_count"),
        supabase.get("family_count"),
        supabase.get("report_count"),
        0,
    )
    # Statewide Registry total — pulled live from spotlight_build's Supabase
    # resolver (state_stats.state_family_count, dashboard-matching value).
    # Falls back to total_submissions for backwards compatibility with older
    # specs. Rendered separately from the actor count so a small actor count
    # (e.g. 3 families named) sits alongside the much larger state total
    # (e.g. 321 CA families in the Registry) without confusion.
    state_family_count = first_nonempty(
        stats.get("state_family_count"),
        stats.get("total_submissions"),
    )
    movement_total = spec.get("movement_total")
    cta = (spec.get("cta") or "STANDWITHMEG.COM").replace("/SURVEY", "").replace("/survey", "")

    quote_text, quote_kind = story_quote(spec)   # legacy single-quote (kept for any callers)
    all_quote_frames = chunk_quote_pages(story_quotes(spec, n=None), per_page=QUOTES_PER_PAGE)

    # Big-name HTML — handle empty first gracefully
    if first and last:
        big_name_html = f"{esc(first.upper())}<br><span class=\"gold\">{esc(last.upper())}</span>"
    elif last:
        big_name_html = f"<span class=\"gold\">{esc(last.upper())}</span>"
    else:
        big_name_html = f"<span class=\"gold\">{esc(display_name.upper())}</span>"

    source_cards: list[str] = []

    def next_frame_id() -> str:
        return f"frame-{len(source_cards) + 1:02d}"

    source_cards.append(frame_1_who(
        actor, role, court, state, state_abbr, county, actor_submission_count,
        state_family_count, spec, big_name_html, web_mode=web_mode,
        frame_id=next_frame_id(),
    ))
    quote_page_total = len(all_quote_frames)
    for quote_page_number, quote_page in enumerate(all_quote_frames, start=1):
        source_cards.append(frame_4_pull_quote(
            quote_page, state, state_abbr, county, first, last, role,
            frame_id=next_frame_id(),
            page_number=quote_page_number,
            page_total=quote_page_total,
        ))
    source_cards.append(frame_6_exposing(state, state_abbr, county, stats, frame_id=next_frame_id()))
    source_cards.append(frame_2_meg_intro(frame_id=next_frame_id()))
    source_cards.append(frame_5_counted(state, state_abbr, county, first, last, role, movement_total, frame_id=next_frame_id()))
    source_cards.append(frame_3_they_thought(state, state_abbr, county, first, last, role, frame_id=next_frame_id()))
    source_cards.append(frame_7_stand_with_meg(state, state_abbr, county, movement_total, cta, frame_id=next_frame_id()))

    frame_ids = [f"frame-{i:02d}" for i in range(1, len(source_cards) + 1)]
    frame_total = len(frame_ids)
    frame_ids_js = json.dumps(frame_ids)

    def frame_version(frame_id: str) -> str:
        # Content hash of the prerendered JPEG (exists by the final --web pass,
        # which runs after prerender_frames.py). Empty string → no ?v= suffix,
        # which keeps the --live-html prerender pass byte-identical.
        try:
            jpg = EXPORT_ROOT / spec["actor"]["slug"] / f"{frame_id}.jpg"
            if jpg.exists():
                return hashlib.sha256(jpg.read_bytes()).hexdigest()[:10]
        except Exception:
            pass
        return ""

    cards = (
        [image_frame(frame_id, display_name, i, frame_total, version=frame_version(frame_id))
         for i, frame_id in enumerate(frame_ids, start=1)]
        if image_mode else source_cards
    )
    render_metadata = hidden_render_metadata(source_cards) if image_mode else ""
    file_basename = re.sub(r"[^A-Za-z0-9]+", "_", "_".join(part for part in (last, role) if part).strip()).strip("_")
    if not file_basename:
        file_basename = re.sub(r"[^A-Za-z0-9]+", "_", display_name).strip("_") or "Court_Actor"
    file_basename_js = json.dumps(file_basename)

    sections = "\n".join(
        f'<section class="phone-frame">{card}{frame_actions(i)}</section>'
        for i, card in enumerate(cards, start=1)
    )

    unresolved = spec.get("unresolved") or []
    unresolved_html = "".join(f"<li>{esc(item)}</li>" for item in unresolved) or "<li>No unresolved fields recorded.</li>"
    spec_path_label = esc(spec.get("export_dir") or "")
    public_route = esc((spec.get("public_share") or {}).get("recommended_route", ""))
    topbar_html = "" if web_mode else f"""
<header class="topbar">
  <b>Story-ready share draft · Stand With Meg v2</b>
  <span>{esc(display_name)} · {esc(state)} · review before posting. Suggested public route: {public_route}</span>
</header>"""

    sponsor_state = state_abbr or state
    sponsor_slot_html = f"""<section class="sponsor-slot" id="sponsor-slot" data-state="{esc(sponsor_state)}">
  <a href="/sponsor" target="_blank" rel="noopener noreferrer" class="sponsor-empty">
    <div class="eyebrow">Sponsor this spotlight</div>
    <div class="headline">Your business here</div>
    <div class="sub">Become a sponsor →</div>
  </a>
</section>"""

    SPONSOR_CSS = """/* Sponsor spotlight slot */
.sponsor-slot { width:min(100%,540px); margin:14px auto 0; padding:0 12px; }
.sponsor-slot-label { font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--gold); margin-bottom:8px; }
.sponsor-card { background:linear-gradient(180deg,#ffffff,#f4f6f9); border-radius:14px; padding:16px; color:#15202b; box-shadow:0 16px 36px -16px rgba(0,0,0,.55); }
.sponsor-card img { max-height:44px; width:auto; margin-bottom:10px; display:block; }
.sponsor-card .services { font-size:13px; font-weight:800; }
.sponsor-card .location { font-size:11px; color:#5b6675; margin-top:2px; }
.sponsor-card .divider { height:1px; background:#e6e9ee; margin:12px 0; }
.sponsor-card .phone { font-size:13px; font-weight:800; }
.sponsor-card .tagline { font-size:11px; color:#7a8493; font-style:italic; margin-top:2px; }
.sponsor-card .cta { display:inline-block; padding:8px 14px; border-radius:8px; font-size:12px; font-weight:800; color:#fff; text-decoration:none; }
.sponsor-empty { display:block; border:2px dashed rgba(201,162,39,.4); border-radius:14px; padding:16px; text-align:center; text-decoration:none; }
.sponsor-empty .eyebrow { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.14em; color:rgba(245,245,245,.45); }
.sponsor-empty .headline { font-size:14px; font-weight:800; color:var(--gold); margin-top:6px; }
.sponsor-empty .sub { font-size:11px; color:rgba(245,245,245,.5); margin-top:2px; }
"""

    SPONSOR_JS = r"""// Sponsor spotlight slot — populated from /api/sponsors if an approved sponsor exists.
(function() {
  const slot = document.getElementById('sponsor-slot');
  if (!slot) return;
  const state = (slot.dataset.state || '').trim();
  function esc(t) {
    return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function domainLabel(url) {
    return url ? url.replace(/^https?:\/\//,'').replace(/\/$/,'') : 'Visit website';
  }
  function renderEmpty() {
    slot.innerHTML = '<a href="/sponsor" target="_blank" rel="noopener noreferrer" class="sponsor-empty"><div class="eyebrow">Sponsor this spotlight</div><div class="headline">Your business here</div><div class="sub">Become a sponsor →</div></a>';
  }
  function renderCard(s) {
    const accent = s.brand_color || '#1f93c7';
    let html = '<div class="sponsor-card">';
    if (s.logo_url) html += '<img src="' + esc(s.logo_url) + '" alt="' + esc(s.business_name) + '">';
    if (s.services) html += '<div class="services">' + esc(s.services) + '</div>';
    if (s.location_label) html += '<div class="location">' + esc(s.location_label) + '</div>';
    html += '<div class="divider"></div><div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;">';
    html += '<div>';
    if (s.phone) html += '<div class="phone">' + esc(s.phone) + '</div>';
    if (s.tagline) html += '<div class="tagline">' + esc(s.tagline) + '</div>';
    html += '</div>';
    if (s.website_url) html += '<a href="' + esc(s.website_url) + '" target="_blank" rel="noopener noreferrer" class="cta" style="background-color:' + esc(accent) + '">' + domainLabel(s.website_url) + '</a>';
    html += '</div></div>';
    slot.innerHTML = '<div class="sponsor-slot-label">Sponsored by</div>' + html;
  }
  fetch('/api/sponsors?placement=court_actor_spotlight&state=' + encodeURIComponent(state))
    .then(r => r.json())
    .then(d => {
      const sponsors = Array.isArray(d && d.sponsors) ? d.sponsors : [];
      const match = sponsors.find(x => x.slot === 'court_actor_spotlight') || sponsors[0];
      if (match) renderCard(match); else renderEmpty();
    })
    .catch(() => renderEmpty());
})();
"""

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(display_name)} · Stand With Meg · Story Spotlight</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@500;700&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet">
<!-- Frames are pre-rendered server-side; we just need JSZip to bundle the Save All download. -->
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
<style>
:root {{
  --navy:#0B1A2D; --navy-deep:#050A14; --gold:#C9A227; --gold-soft:#E0B93C;
  --crimson:#B91C1C; --crimson-hot:#EF4444; --cream:#F2EAD6; --white:#F5F5F5;
}}
* {{ box-sizing:border-box; margin:0; padding:0; }}
html,body {{ background:#06070A; color:var(--white); font-family:Inter,system-ui,sans-serif; min-height:100vh; }}
.topbar {{ position:sticky; top:0; z-index:50; padding:14px 16px; background:rgba(6,7,10,.9); border-bottom:1px solid rgba(201,162,39,.25); backdrop-filter:blur(14px); }}
.topbar b {{ display:block; font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:.24em; color:var(--gold); text-transform:uppercase; }}
.topbar span {{ display:block; margin-top:4px; color:rgba(245,245,245,.66); font-size:13px; line-height:1.4; }}
.share-scroll {{ width:min(100%,540px); margin:0 auto; padding:18px 12px 48px; }}

/* Bulk action bar — Save All / Share All buttons under the topbar */
.bulk-bar {{
  width:min(100%,540px); margin:18px auto 0; padding:0 12px;
  display:grid; grid-template-columns:1fr 1fr; gap:10px;
}}
.bulk-btn {{
  display:flex; align-items:center; justify-content:center; gap:10px;
  padding:14px 16px; border-radius:12px; cursor:pointer;
  font-family:'Oswald',sans-serif; font-weight:700; font-size:14px;
  letter-spacing:.14em; text-transform:uppercase;
  transition:transform .12s, opacity .12s;
}}
.bulk-btn:hover {{ transform:translateY(-1px); }}
.bulk-btn:active {{ transform:translateY(1px); }}
.bulk-btn:disabled {{ opacity:.65; cursor:wait; transform:none; }}
.bulk-save {{
  background:var(--gold); color:#0F1E30; border:none;
  box-shadow:0 8px 22px rgba(201,162,39,.35);
}}
.bulk-share {{
  background:var(--crimson); color:#fff; border:none;
  box-shadow:0 8px 22px rgba(185,28,28,.35);
}}
.bulk-icon {{ font-size:16px; }}
.bulk-progress {{
  width:min(100%,540px); margin:8px auto 0; padding:0 12px;
  font-family:'JetBrains Mono',monospace; font-size:11px;
  letter-spacing:.18em; color:var(--gold); text-transform:uppercase;
  text-align:center; min-height:14px;
}}
.phone-frame {{ margin:0 0 32px; }}

/* Story card — 9:16, rounded, deep navy gradient */
.frame {{
  position:relative; width:100%; aspect-ratio:9/16; overflow:hidden;
  border-radius:22px;
  background:linear-gradient(180deg,#0B1A2D 0%, #050A14 100%);
  box-shadow:0 28px 70px rgba(0,0,0,.62),0 0 0 1px rgba(255,255,255,.06);
  color:var(--white);
  font-family:Inter,sans-serif;
  isolation:isolate;
}}
.frame-image {{ background:#000; }}
.frame-img {{
  position:absolute; inset:0; z-index:1;
  display:block; width:100%; height:100%; object-fit:cover;
}}

/* Photo (Frame 1) */
.photo-bg {{
  position:absolute; inset:0; z-index:0;
  background-size:cover; background-position:center 25%;
}}
/* Real photo lifts above the flag (z:1) so stripes/stars don't print across the face,
   but stays below grain (z:5), scanlines (z:6), and vignette (z:7) so the photo still
   gets the dossier-style overlay treatment. */
.photo-bg.photo-real {{ z-index:2; }}
.photo-overlay {{
  position:absolute; inset:0;
  background:linear-gradient(180deg,rgba(11,26,45,.18) 0%, rgba(5,10,20,.78) 100%);
}}
/* When the face is a real photo, dial back the overlays so the actor is clear.
   Keep enough darkness at the bottom for the headline + label area to stay readable. */
.frame.has-real-photo .photo-overlay {{
  background:linear-gradient(180deg,
    rgba(11,26,45,0) 0%,
    rgba(11,26,45,0) 35%,
    rgba(5,10,20,.55) 70%,
    rgba(5,10,20,.92) 100%);
}}
.frame.has-real-photo .grain {{ opacity:.28; mix-blend-mode:soft-light; }}
.frame.has-real-photo .scanlines {{
  background:repeating-linear-gradient(to bottom, rgba(0,0,0,.07) 0 1px, transparent 1px 6px);
}}
.frame.has-real-photo .vignette {{
  background:radial-gradient(ellipse at center 38%, transparent 55%, rgba(0,0,0,.55) 100%);
}}
.frame.has-real-photo .flag-bg--cover {{ opacity:0; }}
.photo-placeholder {{
  background:radial-gradient(ellipse at 50% 35%, #4B5867 0%, #2A3B52 40%, #14253A 75%, #050A14 100%);
}}
.ph-silhouette {{
  position:absolute; left:50%; top:24%; transform:translateX(-50%);
  width:62%; height:36%;
  background:
    radial-gradient(ellipse 36% 26% at 50% 22%, rgba(245,235,210,.45) 0%, transparent 60%),
    radial-gradient(ellipse 44% 52% at 50% 70%, rgba(30,40,55,.8) 0%, transparent 75%);
  filter:blur(2px);
}}
.ph-overlay {{
  position:absolute; inset:0;
  background:linear-gradient(180deg, rgba(11,26,45,.32) 0%, rgba(11,26,45,.85) 100%);
}}
.ph-tag {{
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  font-family:'JetBrains Mono',monospace; font-size:clamp(8px,1.7cqw,11px);
  letter-spacing:.3em; color:rgba(201,162,39,.6); text-transform:uppercase;
  border:1.5px dashed rgba(201,162,39,.5); padding:8px 12px;
  text-align:center; max-width:80%;
}}

/* Flag wave layer */
.flag-bg {{ position:absolute; inset:0; z-index:1; opacity:.22; filter:blur(2px); }}
.flag-bg svg {{ width:100%; height:100%; }}
.flag-bg--cover {{ opacity:.32; filter:blur(2px); mix-blend-mode:screen; }}
.flag-bg--faded {{ opacity:.14; filter:blur(6px); }}

/* Grain + scanlines + vignette */
.grain {{
  position:absolute; inset:0; z-index:5; pointer-events:none;
  opacity:.7; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.7  0 0 0 0 0.7  0 0 0 0 0.7  0 0 0 0.22 0'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.6'/></svg>");
}}
.scanlines {{
  position:absolute; inset:0; z-index:6; pointer-events:none;
  background:repeating-linear-gradient(to bottom, rgba(0,0,0,.18) 0 1px, transparent 1px 5px);
  mix-blend-mode:multiply;
}}
.vignette {{
  position:absolute; inset:0; z-index:7; pointer-events:none;
  background:radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,.78) 100%);
}}

/* State badge top-right (the yellow OHIO stamp) */
.state-badge {{
  position:absolute; top:5%; right:5%; z-index:25;
  display:flex; flex-direction:column; align-items:flex-end; gap:6px;
}}
.sb-eyebrow {{
  font-family:'JetBrains Mono',monospace; letter-spacing:.3em;
  color:rgba(242,234,214,.6); text-transform:uppercase;
  font-size:clamp(6px,1.05cqw,11px);
}}
.sb-stamp {{
  display:inline-block; background:var(--gold); color:#0A0A0A;
  font-family:'Anton',sans-serif; letter-spacing:.02em; line-height:1;
  padding:6px 14px 4px; text-transform:uppercase;
  box-shadow:0 8px 24px rgba(0,0,0,.5);
  font-size:clamp(18px,3.9cqw,42px);
}}
.sb-caption {{
  font-family:'Oswald',sans-serif; font-weight:700; letter-spacing:.22em;
  color:#F5F5F5; text-transform:uppercase;
  font-size:clamp(7px,1.2cqw,13px);
}}

/* Top-left frame tag */
.frame-tag {{
  position:absolute; top:5%; left:5%; z-index:25;
  font-family:'JetBrains Mono',monospace; letter-spacing:.3em;
  color:var(--gold); text-transform:uppercase;
  font-size:clamp(6px,1.2cqw,13px);
}}

/* Display headlines */
.display {{
  font-family:'Anton',sans-serif; text-transform:uppercase; letter-spacing:-.02em;
  line-height:1.05; text-shadow:0 8px 0 rgba(0,0,0,.4);
}}
.display.xl {{ font-size:clamp(48px,15cqw,98px); }}
.display .gold {{ color:var(--gold); }}
.gold {{ color:var(--gold); }}

/* Frame 1 — cover */
.f1-headline {{
  position:absolute; left:5%; right:5%; bottom:18%; z-index:25;
}}
.f1-role {{
  margin-top:14px; font-family:'Fraunces',serif; font-style:italic;
  color:rgba(245,245,245,.92); line-height:1.25;
  font-size:clamp(14px,3.4cqw,22px);
}}
.f1-report-count {{
  margin-top:16px; display:flex; align-items:flex-end; gap:14px;
  border-top:2px solid rgba(201,162,39,.8); padding-top:12px;
}}
.f1-report-count b {{
  font-family:'Anton',sans-serif; color:var(--gold); line-height:.85;
  font-size:clamp(40px,11cqw,72px);
}}
.f1-report-count span {{
  font-family:'Oswald',sans-serif; letter-spacing:.16em;
  text-transform:uppercase; color:rgba(245,245,245,.82);
  font-size:clamp(10px,2.4cqw,15px); padding-bottom:6px;
}}
/* Statewide Registry total — small caption under the actor count.
   Sits inside f1-headline (bottom:18%) above movement-foot (bottom:5%),
   so it never collides with the state badge, quotes, or footer. */
.f1-state-count {{
  margin-top:10px;
  font-family:'Oswald',sans-serif; font-weight:600;
  letter-spacing:.18em; text-transform:uppercase;
  color:rgba(245,245,245,.7);
  font-size:clamp(10px,2.2cqw,13px);
}}
.f1-state-count b {{
  color:var(--gold); font-weight:700;
  font-family:'JetBrains Mono',monospace;
  letter-spacing:.04em;
}}

/* Frame 2 — Meg journalist intro */
.f2-meg-img {{
  position:absolute; inset:0; z-index:1;
  width:100%; height:100%; object-fit:cover; display:block;
}}

/* Frame 3 — they thought */
.f3-headline {{ position:absolute; left:5%; right:5%; top:20%; z-index:25; }}
.f3-headline .display.xl {{ font-size:clamp(34px,9.65cqw,104px); }}
.red-bar {{
  position:relative; display:inline-block; color:#F5F5F5;
  padding:0 .12em;
}}
.red-bar::before {{
  content:""; position:absolute; left:clamp(-6px,-.56cqw,-2px); right:clamp(-6px,-.56cqw,-2px); top:18%; bottom:18%;
  background:var(--crimson); transform:skewX(-6deg); z-index:-1;
}}
.not-any-more-stamp {{
  display:inline-block; margin-top:clamp(8px,2.2cqw,24px);
  background:var(--gold); color:#0A0A0A;
  font-family:'Anton',sans-serif; letter-spacing:.01em; text-transform:uppercase;
  padding:clamp(2px,.55cqw,6px) clamp(8px,2.05cqw,22px) clamp(4px,.95cqw,10px); line-height:1;
  box-shadow:clamp(3px,.75cqw,8px) clamp(3px,.75cqw,8px) 0 rgba(0,0,0,.6);
  font-size:clamp(24px,6.85cqw,74px);
  transform:rotate(-3deg); transform-origin:left center;
}}
.f3 .actor-id-strip {{ bottom:10.5%; }}
.f3 .aid-name {{ font-size:clamp(9px,2.35cqw,25px); }}

/* Frame 4 — stacked pull quotes (up to 8 per page) */
.f4-body {{
  position:absolute; left:6%; right:6%; top:18%; bottom:26%; z-index:25;
  display:flex; flex-direction:column; justify-content:center;
  gap:clamp(14px,3cqw,26px);
}}
.f4-body.f4-count-4,
.f4-body.f4-count-5,
.f4-body.f4-count-6,
.f4-body.f4-count-7,
.f4-body.f4-count-8 {{
  top:24%;
  bottom:16%;
  justify-content:flex-start;
  gap:clamp(7px,1.45cqw,12px);
}}
.f4-body.f4-count-7,
.f4-body.f4-count-8 {{
  top:22%;
  bottom:15%;
  gap:clamp(5px,1.1cqw,9px);
}}
.f4-quote {{
  position:relative; padding-left:clamp(14px,2.8cqw,22px);
  border-left:3px solid var(--gold);
}}
.f4-dot {{
  position:absolute; left:-8px; top:0;
  width:14px; height:14px; border-radius:50%;
  background:var(--crimson);
  box-shadow:0 0 0 4px var(--navy-deep);
}}
.f4-text {{
  font-family:'Fraunces',serif; font-weight:500; font-style:italic;
  line-height:1.22; color:var(--white);
  font-size:clamp(15px,4.2cqw,26px);
}}
.f4-attr {{
  margin-top:clamp(6px,1.6cqw,12px);
  font-family:'Oswald',sans-serif; font-weight:600; letter-spacing:.18em;
  color:rgba(245,245,245,.7);
  font-size:clamp(9px,2.2cqw,13px);
  text-transform:uppercase;
}}
/* When only one quote exists, bump it up to the original hero size */
.f4-body.f4-count-1 .f4-text {{
  font-size:clamp(22px,6cqw,42px); line-height:1.18;
}}
.f4-body.f4-count-1 .f4-attr {{
  font-size:clamp(11px,2.6cqw,15px); margin-top:clamp(18px,3cqw,28px);
}}
/* Longer solo passages step the hero size down so a full paragraph
   fills the card without overflowing it. */
.f4-body.f4-count-1.f4-solo--mid .f4-text {{
  font-size:clamp(20px,5cqw,36px); line-height:1.22;
}}
.f4-body.f4-count-1.f4-solo--long .f4-text {{
  font-size:clamp(17px,3.9cqw,29px); line-height:1.3;
}}
.f4-body.f4-count-4 .f4-text {{
  font-size:clamp(13px,3.05cqw,20px);
  line-height:1.13;
}}
.f4-body.f4-count-5 .f4-text {{
  font-size:clamp(12px,2.75cqw,18px);
  line-height:1.11;
}}
.f4-body.f4-count-6 .f4-text {{
  font-size:clamp(11px,2.45cqw,16px);
  line-height:1.09;
}}
.f4-body.f4-count-7 .f4-text {{
  font-size:clamp(10px,2.2cqw,15px);
  line-height:1.08;
}}
.f4-body.f4-count-8 .f4-text {{
  font-size:clamp(10px,2.05cqw,14px);
  line-height:1.07;
}}
.f4-body.f4-count-4 .f4-attr,
.f4-body.f4-count-5 .f4-attr,
.f4-body.f4-count-6 .f4-attr,
.f4-body.f4-count-7 .f4-attr,
.f4-body.f4-count-8 .f4-attr {{
  margin-top:clamp(4px,1.2cqw,8px);
  font-size:clamp(8px,1.8cqw,11px);
}}

/* Frame 5 — counted. Flex column inside an absolute wrapper so each line
   claims its own vertical slot. No more pattern colliding with the italic. */
.f5-stack {{
  position:absolute; left:5%; right:5%; top:14%; bottom:28%; z-index:25;
  display:flex; flex-direction:column; justify-content:center;
  gap:clamp(8px,2cqw,18px); text-align:center;
}}
.f5-mega-number {{
  font-family:'Anton',sans-serif; line-height:.82; letter-spacing:-.04em;
  color:var(--gold);
  font-size:clamp(110px,34cqw,240px);
  text-shadow:0 10px 0 rgba(0,0,0,.4), 0 24px 80px rgba(201,162,39,.35);
}}
.f5-mega-label {{
  font-family:'Anton',sans-serif; text-transform:uppercase;
  letter-spacing:-.01em; line-height:1.05; color:#F5F5F5;
  font-size:clamp(38px,10cqw,72px);
}}
.f5-italic {{
  font-family:'Fraunces',serif; font-style:italic;
  color:rgba(245,245,245,.8);
  font-size:clamp(14px,3.4cqw,22px);
  margin-bottom:clamp(8px,2cqw,16px);
}}
.f5-pattern {{
  font-family:'Anton',sans-serif; text-transform:uppercase;
  color:#F5F5F5; line-height:1.18;
  font-size:clamp(22px,6.2cqw,44px);
}}
.f5-pattern .strike {{
  text-decoration:line-through; text-decoration-color:var(--crimson);
  text-decoration-thickness:5px; color:rgba(245,245,245,.45);
}}
.f5-pattern .pattern-pill {{
  display:inline-block; background:var(--gold); color:#0A0A0A;
  padding:2px 14px; margin-top:6px;
}}

/* Frame 6 — exposing the pattern */
.f6-headline {{
  position:absolute; left:5%; right:5%; top:14%; z-index:25;
  font-family:'Anton',sans-serif; color:#F5F5F5; text-transform:uppercase;
  letter-spacing:-.02em; line-height:1.04;
  font-size:clamp(40px,11cqw,86px);
}}
.f6-stats {{
  position:absolute; left:5%; right:5%; bottom:24%; z-index:25;
  border-top:3px solid var(--gold); padding-top:14px;
  display:flex; flex-direction:column; gap:8px;
}}
.f6-stats-label {{
  font-family:'JetBrains Mono',monospace; letter-spacing:.26em;
  color:rgba(245,245,245,.55); text-transform:uppercase;
  margin-bottom:8px; font-size:clamp(8px,2cqw,12px);
}}
.stat-row {{
  display:flex; justify-content:space-between; align-items:baseline;
  border-bottom:1px solid rgba(245,245,245,.18); padding-bottom:8px;
}}
.stat-row .stat-n {{
  font-family:'Anton',sans-serif; color:var(--gold); line-height:1;
  font-size:clamp(28px,8cqw,52px);
}}
.stat-row .stat-l {{
  font-family:'Oswald',sans-serif; font-weight:600; letter-spacing:.14em;
  color:#F5F5F5; text-align:right; text-transform:uppercase;
  font-size:clamp(9px,2.2cqw,14px);
}}
.f6-hero-stat {{
  display:flex; align-items:baseline; justify-content:space-between; gap:16px;
  padding-bottom:14px; border-bottom:2px solid rgba(245,245,245,.30);
  margin-bottom:4px;
}}
.f6-hero-n {{
  font-family:'Anton',sans-serif; color:#F5F5F5; line-height:.95;
  letter-spacing:-.02em; font-size:clamp(56px,16cqw,108px);
}}
.f6-hero-l {{
  font-family:'Oswald',sans-serif; font-weight:700; letter-spacing:.14em;
  color:var(--gold); text-align:right; text-transform:uppercase;
  font-size:clamp(11px,2.6cqw,18px); line-height:1.1;
}}

/* Frame 7 — STAND WITH MEG */
.f7-headline {{
  position:absolute; left:5%; right:5%; top:14%; z-index:25;
  font-family:'Anton',sans-serif; text-transform:uppercase;
  letter-spacing:-.02em; line-height:1.05;
  color:#F5F5F5; text-align:center;
  font-size:clamp(70px,22cqw,160px);
}}
.f7-with {{ display:inline-block; }}
.f7-cta-text {{
  position:absolute; left:5%; right:5%; top:58%; z-index:25;
  font-family:'Fraunces',serif; font-style:italic;
  color:rgba(245,245,245,.9); text-align:center; line-height:1.25;
  font-size:clamp(15px,4cqw,30px);
}}
.f7-cta-text .f7-count {{
  color:var(--gold); font-weight:900; font-style:normal; font-family:'Anton',sans-serif;
}}
.f7-pill-stack {{
  position:absolute; left:0; right:0; bottom:14%; z-index:25;
  display:flex; flex-direction:column; align-items:center; gap:14px;
}}
.f7-visit {{
  font-family:'Oswald',sans-serif; font-weight:700; letter-spacing:.2em;
  color:rgba(245,245,245,.7); text-transform:uppercase;
  font-size:clamp(14px,3.4cqw,22px);
}}
.url-pill {{
  display:inline-flex; align-items:center; gap:12px;
  padding:14px 22px; border-radius:999px; background:#F5F5F5; color:#0B1A2D;
  font-family:'Oswald',sans-serif; font-weight:700; letter-spacing:.14em;
  text-transform:uppercase; box-shadow:0 12px 36px rgba(0,0,0,.55);
  font-size:clamp(18px,5.2cqw,32px);
}}
.url-pill .dot {{
  width:14px; height:14px; border-radius:50%; background:var(--crimson);
  animation:pulse 1.5s infinite;
}}
@keyframes pulse {{ 0%,100% {{ opacity:1; transform:scale(1);}} 50% {{ opacity:.4; transform:scale(.7);}} }}
.f7-legal {{
  position:absolute; left:5%; right:5%; bottom:5%; z-index:25;
  font-family:'JetBrains Mono',monospace; letter-spacing:.22em;
  color:rgba(245,245,245,.45); text-align:center; text-transform:uppercase;
  font-size:clamp(8px,1.7cqw,11px);
}}

/* Bottom strips (frames 3–6) */
.actor-id-strip {{
  position:absolute; left:5%; right:5%; bottom:14%; z-index:25;
  border-top:clamp(1px,.28cqw,3px) solid var(--gold); padding-top:clamp(5px,1.1cqw,12px);
}}
.aid-name {{
  font-family:'Oswald',sans-serif; font-weight:700; letter-spacing:.1em;
  color:#F5F5F5; text-transform:uppercase; line-height:1.1;
  font-size:clamp(10px,2.6cqw,28px);
}}
.aid-role {{
  margin-top:4px; font-family:'Fraunces',serif; font-style:italic;
  color:rgba(245,245,245,.8);
  font-size:clamp(8px,1.67cqw,18px);
}}

.movement-foot {{
  position:absolute; left:5%; right:5%; bottom:5%; z-index:25;
  display:flex; justify-content:space-between; align-items:center;
  border-top:1px solid rgba(245,245,245,.18); padding-top:12px;
}}
.mf-handle {{
  font-family:'Oswald',sans-serif; font-weight:600; letter-spacing:.18em;
  color:rgba(245,245,245,.7); text-transform:uppercase;
  font-size:clamp(7px,1.5cqw,16px);
}}
.mf-url {{
  font-family:'JetBrains Mono',monospace; letter-spacing:.24em;
  color:rgba(245,245,245,.55); text-transform:uppercase;
  font-size:clamp(7px,1.5cqw,16px);
}}

.legal {{
  position:absolute; left:5%; right:5%; bottom:1.5%; z-index:25;
  font-family:'JetBrains Mono',monospace; letter-spacing:.14em;
  color:rgba(245,245,245,.4); text-align:center; text-transform:uppercase;
  font-size:clamp(5px,.95cqw,10px);
}}

/* Frame containers use container queries so cqw scales fonts to frame width */
.frame {{ container-type:inline-size; }}

/* Action buttons under each frame */
.frame-actions {{ display:flex; gap:10px; padding:10px 4px 0; }}
.frame-actions button {{
  flex:1; border:1px solid rgba(201,162,39,.35); border-radius:10px;
  padding:11px 10px; background:rgba(201,162,39,.12); color:var(--white);
  font-weight:800; font-size:13px; cursor:pointer;
}}

/* Audit notes drawer */
.review {{ width:min(100%,540px); margin:0 auto 48px; padding:0 12px; }}
.review details {{
  border:1px solid rgba(201,162,39,.25); border-radius:12px;
  padding:12px 14px; background:rgba(255,255,255,.035); color:rgba(245,245,245,.78);
}}
.review summary {{
  cursor:pointer; color:var(--gold);
  font-family:'JetBrains Mono',monospace; font-size:12px;
  letter-spacing:.16em; text-transform:uppercase;
}}
.review li {{ margin:8px 0; }}

@media (min-width:760px) {{ .share-scroll {{ padding-top:28px; }} }}
{SPONSOR_CSS}</style>
</head>
<body>
{topbar_html}
<div class="bulk-bar">
  <button type="button" id="save-all-btn" class="bulk-btn bulk-save">
    <span class="bulk-icon">⇩</span><span class="bulk-label">Save {frame_total} images</span>
  </button>
  <button type="button" id="share-all-btn" class="bulk-btn bulk-share">
    <span class="bulk-icon">↗</span><span class="bulk-label">Share {frame_total} images</span>
  </button>
</div>
<div class="bulk-progress" id="bulk-progress"></div>
{sponsor_slot_html}
<main class="share-scroll">
{sections}
</main>
{render_metadata}
<aside class="review">
  <details>
    <summary>Audit notes</summary>
    <p>Spec source: <code>{spec_path_label}</code></p>
    <ul>{unresolved_html}</ul>
  </details>
</aside>
<script>
// Frames are pre-rendered server-side by _scripts/prerender_frames.py (Playwright).
// We fetch the JPEGs directly — no client-side canvas, so iOS Safari can't taint anything.
async function frameToBlob(id) {{
  // frame-01.jpg ... frame-07.jpg live in the same folder as share.html
  const num = id.replace('frame-', '');
  const url = `frame-${{num}}.jpg`;
  const res = await fetch(url, {{ cache: 'reload' }});
  if (!res.ok) throw new Error(`Couldn't fetch ${{url}}: HTTP ${{res.status}}`);
  return await res.blob();
}}

async function saveFrame(id) {{
  const btn = document.querySelector(`[data-save="${{id}}"]`);
  const orig = btn ? btn.textContent : null;
  if (btn) btn.textContent = 'Saving…';
  try {{
    const blob = await frameToBlob(id);
    const file = new File([blob], frameFileName(id), {{ type: 'image/jpeg' }});
    if (isMobileDevice() && navigator.canShare && navigator.canShare({{ files: [file] }})) {{
      try {{
        await navigator.share({{
          files: [file],
          title: document.title,
          text: 'Stand With Meg · Court actor spotlight',
        }});
        if (btn) btn.textContent = '✓ Saved';
      }} catch (e) {{
        if (e.name !== 'AbortError') throw e;
        if (btn && orig) btn.textContent = orig;
        return;
      }}
      setTimeout(() => {{ if (btn && orig) btn.textContent = orig; }}, 1800);
      return;
    }}
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = frameFileName(id);
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    if (btn) btn.textContent = '✓ Saved';
  }} catch (e) {{
    console.error(e);
    alert('Save failed: ' + (e.message || e) +
          '\\nFallback: take a screenshot — Cmd+Shift+4 on Mac, Power+Vol-Up on phone.');
    if (btn && orig) btn.textContent = orig;
    return;
  }}
  setTimeout(() => {{ if (btn && orig) btn.textContent = orig; }}, 1800);
}}

async function shareFrame(id) {{
  const btn = document.querySelector(`[data-share="${{id}}"]`);
  const orig = btn ? btn.textContent : null;
  if (btn) btn.textContent = 'Preparing…';
  try {{
    const blob = await frameToBlob(id);
    const file = new File([blob], frameFileName(id), {{ type: 'image/jpeg' }});

    // Best path: share the IMAGE (Web Share API Level 2 — iOS Safari, Android Chrome).
    if (navigator.canShare && navigator.canShare({{ files: [file] }})) {{
      await navigator.share({{
        files: [file],
        title: document.title,
        text: 'Court actor on the public record. StandWithMeg.com',
      }});
      if (btn) btn.textContent = '✓ Shared';
    }} else if (navigator.share) {{
      // Fallback: share the page link
      await navigator.share({{
        title: document.title,
        text: 'StandWithMeg.com',
        url: location.href + '#' + id,
      }});
      if (btn) btn.textContent = '✓ Shared';
    }} else {{
      // Final fallback: copy URL to clipboard
      await navigator.clipboard.writeText(location.href + '#' + id);
      alert('Image sharing not supported here. Frame link copied to clipboard instead.');
      if (btn) btn.textContent = '✓ Link copied';
    }}
  }} catch (e) {{
    // User cancellation is normal — don't show an error for that
    if (e.name !== 'AbortError') {{
      console.error(e);
      alert('Share failed: ' + (e.message || e));
    }}
    if (btn && orig) btn.textContent = orig;
    return;
  }}
  setTimeout(() => {{ if (btn && orig) btn.textContent = orig; }}, 1800);
}}

document.addEventListener('click', (event) => {{
  const save = event.target.closest('[data-save]');
  const share = event.target.closest('[data-share]');
  if (save) {{ event.preventDefault(); saveFrame(save.dataset.save); }}
  if (share) {{ event.preventDefault(); shareFrame(share.dataset.share); }}
}});

// ============================================================
// Save All / Share All — capture every frame, bundle as zip,
// download or pass to Web Share API.
// ============================================================
const FRAME_IDS = {frame_ids_js};
const FILE_BASENAME = {file_basename_js};

function frameFileName(id) {{
  const index = FRAME_IDS.indexOf(id);
  const fallback = Number((id || '').replace('frame-', '')) || 1;
  const num = String(index >= 0 ? index + 1 : fallback).padStart(2, '0');
  return `${{FILE_BASENAME}}_${{num}}.jpg`;
}}

function isMobileDevice() {{
  return window.matchMedia('(pointer: coarse)').matches &&
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
}}

function setProgress(text) {{
  const el = document.getElementById('bulk-progress');
  if (el) el.textContent = text || '';
}}

async function captureAllFrames(onProgress) {{
  const blobs = [];
  for (let i = 0; i < FRAME_IDS.length; i++) {{
    const id = FRAME_IDS[i];
    if (onProgress) onProgress(i, FRAME_IDS.length, id);
    const blob = await frameToBlob(id);
    blobs.push({{ id, blob }});
  }}
  return blobs;
}}

async function bundleAsZip(blobs, packName) {{
  if (!window.JSZip) throw new Error('JSZip failed to load');
  const zip = new JSZip();
  for (const {{ id, blob }} of blobs) {{
    zip.file(frameFileName(id), blob);
  }}
  return await zip.generateAsync({{ type: 'blob', compression: 'STORE' }});
}}

async function saveAllFrames() {{
  const btn = document.getElementById('save-all-btn');
  const orig = btn ? btn.querySelector('.bulk-label').textContent : null;
  if (btn) {{ btn.disabled = true; btn.querySelector('.bulk-label').textContent = 'Loading…'; }}

  try {{
    const blobs = await captureAllFrames((i, total, id) => {{
      setProgress(`Loading ${{id}}  (${{i + 1}} of ${{total}})`);
      if (btn) btn.querySelector('.bulk-label').textContent = `Loading ${{i + 1}}/${{total}}…`;
    }});
    const files = blobs.map(({{ id, blob }}) => new File([blob], frameFileName(id), {{ type: 'image/jpeg' }}));

    // Only use the share sheet on PHONES — macOS desktop also supports
    // Web Share API but its share sheet doesn't have "Save to Photos",
    // just AirDrop/Messages. Users on desktop want a direct download.
    const isMobile = isMobileDevice();

    // PHONES (iOS Safari, Android Chrome): Web Share API → share sheet →
    // user picks "Save Images" to drop them into the Photo Library.
    if (isMobile && navigator.canShare && navigator.canShare({{ files }})) {{
      setProgress(`Opening share sheet — pick "Save ${{FRAME_IDS.length}} Images"`);
      if (btn) btn.querySelector('.bulk-label').textContent = 'Opening…';
      try {{
        await navigator.share({{
          files,
          title: document.title,
          text: 'Stand With Meg · Court actor spotlight',
        }});
        setProgress('✓ Done');
        if (btn) btn.querySelector('.bulk-label').textContent = '✓ Saved';
        return;
      }} catch (e) {{
        if (e.name === 'AbortError') {{
          setProgress('');
          if (btn && orig) btn.querySelector('.bulk-label').textContent = orig;
          return;
        }}
        console.warn('share sheet failed, falling back:', e);
      }}
    }}

    // DESKTOP: zip download. Chrome/Safari block multiple sequential downloads
    // after the first, so direct multi-download is unreliable. ONE zip is more
    // dependable, and macOS auto-extracts when you double-click it.
    setProgress(`Bundling ${{FRAME_IDS.length}} images…`);
    if (btn) btn.querySelector('.bulk-label').textContent = 'Bundling…';
    const zipBlob = await bundleAsZip(blobs, 'spotlight');
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.download = `${{FILE_BASENAME}}_${{FRAME_IDS.length}}_frames.zip`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setProgress('✓ Saved as zip — double-click to extract');
    if (btn) btn.querySelector('.bulk-label').textContent = '✓ Saved zip';
  }} catch (e) {{
    console.error(e);
    setProgress('✗ ' + (e.message || e));
    alert('Save failed: ' + (e.message || e) + '\\nFallback: take a screenshot.');
    if (btn && orig) btn.querySelector('.bulk-label').textContent = orig;
  }} finally {{
    if (btn) {{
      btn.disabled = false;
      setTimeout(() => {{ if (orig) btn.querySelector('.bulk-label').textContent = orig; setProgress(''); }}, 2500);
    }}
  }}
}}

async function shareAllFrames() {{
  const btn = document.getElementById('share-all-btn');
  const orig = btn ? btn.querySelector('.bulk-label').textContent : null;
  if (btn) {{ btn.disabled = true; btn.querySelector('.bulk-label').textContent = 'Preparing…'; }}
  try {{
    const blobs = await captureAllFrames((i, total, id) => {{
      setProgress(`Capturing ${{id}}  (${{i + 1}} of ${{total}})`);
      if (btn) btn.querySelector('.bulk-label').textContent = `Capturing ${{i + 1}}/${{total}}…`;
    }});
    const files = blobs.map(({{ id, blob }}) => new File([blob], frameFileName(id), {{ type: 'image/jpeg' }}));

    // Best path: native multi-file share (iOS Safari, Android Chrome)
    if (navigator.canShare && navigator.canShare({{ files }})) {{
      setProgress('Opening share sheet…');
      await navigator.share({{
        files,
        title: document.title,
        text: 'Court actor on the public record. StandWithMeg.com',
      }});
      setProgress('✓ Shared');
      if (btn) btn.querySelector('.bulk-label').textContent = '✓ Shared';
    }} else {{
      // Fallback: bundle as zip + offer the zip via share or download
      setProgress('Bundling for share…');
      const zipBlob = await bundleAsZip(blobs, 'spotlight');
      const zipFile = new File([zipBlob], `${{FILE_BASENAME}}_spotlight.zip`, {{ type: 'application/zip' }});
      if (navigator.canShare && navigator.canShare({{ files: [zipFile] }})) {{
        await navigator.share({{ files: [zipFile], title: document.title, text: 'StandWithMeg.com' }});
        setProgress('✓ Shared as zip');
        if (btn) btn.querySelector('.bulk-label').textContent = '✓ Shared';
      }} else {{
        // Final fallback: download the zip locally
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.download = `${{FILE_BASENAME}}_spotlight.zip`; link.href = url;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        setProgress('Share not supported here — zip downloaded instead');
        if (btn) btn.querySelector('.bulk-label').textContent = '✓ Zip downloaded';
      }}
    }}
  }} catch (e) {{
    if (e.name !== 'AbortError') {{
      console.error(e);
      setProgress('✗ ' + (e.message || e));
      alert('Share all failed: ' + (e.message || e));
    }} else {{
      setProgress('');
    }}
    if (btn && orig) btn.querySelector('.bulk-label').textContent = orig;
  }} finally {{
    if (btn) {{
      btn.disabled = false;
      setTimeout(() => {{ if (orig) btn.querySelector('.bulk-label').textContent = orig; setProgress(''); }}, 2500);
    }}
  }}
}}

document.getElementById('save-all-btn')?.addEventListener('click', saveAllFrames);
document.getElementById('share-all-btn')?.addEventListener('click', shareAllFrames);
{SPONSOR_JS}</script>
</body>
</html>
"""


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Render the Spotlight Stories v2 share page for an actor.")
    parser.add_argument("slug", help="Actor slug, e.g. magistrate_blevins")
    parser.add_argument("--web", action="store_true",
                        help="Use relative photo URLs (image_1080.png) suitable for serving on the live website")
    parser.add_argument("--live-html", action="store_true",
                        help="Render live HTML/CSS slide layouts for prerendering frame JPEGs instead of image-backed website frames")
    parser.add_argument("--output", help="Override output path. Default: <export>/<slug>/share.html")
    args = parser.parse_args(argv)

    spec_path = EXPORT_ROOT / args.slug / "spec.json"
    if not spec_path.exists():
        sys.stderr.write(f"error: {spec_path.relative_to(PROJECT_ROOT)} not found. Run spotlight_build.py first.\n")
        return 1

    spec = json.loads(spec_path.read_text())
    record_rendered_quote_metadata(spec)
    spec_path.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n")
    html = "\n".join(
        line.rstrip()
        for line in render(spec, web_mode=args.web, image_mode=args.web and not args.live_html).splitlines()
    ) + "\n"

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(html)
        print(f"Wrote {out_path}")
    else:
        share_path = spec_path.parent / "share.html"
        spotlight_path = spec_path.parent / "spotlight.html"
        share_path.write_text(html)
        shutil.copyfile(share_path, spotlight_path)
        print(f"Wrote {share_path.relative_to(PROJECT_ROOT)}")
        print(f"Wrote {spotlight_path.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
