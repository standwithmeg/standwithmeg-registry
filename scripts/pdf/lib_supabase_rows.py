"""
Load survey rows from Supabase in the same tuple shape generate_state_pdf.py
expects from the xlsx master workbook.

This lets the PDF generator read directly from the live DB without needing
the local master xlsx. Used by both local runs and the GitHub Actions
nightly regeneration workflow.
"""
from __future__ import annotations
import json
import os
import re
import unicodedata
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any
from supabase import create_client, Client


BASE_DIR = Path(__file__).resolve().parent
WEBSITE_ROOT = BASE_DIR.parent.parent
ACTOR_OVERRIDES_PATH = WEBSITE_ROOT / "scripts" / "share-pages" / "actor_overrides.json"


def _court_actor_slug(name: str) -> str:
    # Mirrors courtActorSlug() in lib/complaint-routing/courtActorPacketId.ts
    # so the PDF complaint-packet URL resolves to the same Next.js dynamic
    # route the registry uses.
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", str(name))
    s = s.encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"^-+|-+$", "", s)


def _share_actor_slug(name: str) -> str:
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", str(name))
    s = s.encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return re.sub(r"^_+|_+$", "", s)


@lru_cache(maxsize=1)
def _actor_overrides() -> dict[str, dict]:
    try:
        data = json.loads(ACTOR_OVERRIDES_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {
        str(slug): value
        for slug, value in data.items()
        if isinstance(value, dict)
    }


def _display_override_for_actor(name: str) -> dict:
    return _actor_overrides().get(_share_actor_slug(name), {})


def _apply_comment_safety_overrides(comments: list[dict], override: dict) -> list[dict]:
    """Apply the same per-actor comment overrides the slide builder honors so a
    state PDF can never surface text the share page suppressed:
      - exclude_quote_substrings: drop a comment whose note contains the phrase
      - comment_rewrites [{match, replace}]: replace the full note text (used to
        de-identify a comment for a family at risk of retaliation)
    Returns a new list; input is not mutated.
    """
    excludes = [
        s for s in (override.get("exclude_quote_substrings") or [])
        if isinstance(s, str) and s.strip()
    ]
    rewrites = [
        r for r in (override.get("comment_rewrites") or [])
        if isinstance(r, dict)
        and isinstance(r.get("match"), str) and r["match"].strip()
        and isinstance(r.get("replace"), str) and r["replace"].strip()
    ]
    if not excludes and not rewrites:
        return comments
    out: list[dict] = []
    for c in comments:
        note = c.get("note") or ""
        low = note.lower()
        if any(s.lower() in low for s in excludes):
            continue
        for r in rewrites:
            if r["match"].lower() in low:
                c = {**c, "note": r["replace"]}
                break
        out.append(c)
    return out


def _complaint_packet_url(name: str, location_key: str | None, state_code: str | None = None) -> str:
    loc_raw = (location_key or state_code or "unknown").lower()
    loc = re.sub(r"[^a-z0-9]+", "-", loc_raw)
    return f"/reports/actors/{loc}-{_court_actor_slug(name)}/complaint-packet"


# Reverse-map the short-enum permission values stored in Postgres back to the
# long descriptive strings that score_quote() in generate_state_pdf.py pattern-
# matches against ('share away', 'first name', 'anonymous', 'do not share').
PERMISSION_REVERSE = {
    "public":     "Share away! I consent to the public use of all information provided.",
    "anonymous":  "Use my quote anonymously for the project.",
    "first_name": "Use my quote with my first name only.",
    "data_only":  "For data purposes only (Do not share publicly).",
}

PUBLIC_ACTOR_THRESHOLD = 3

# Mirrors lib/submission-public-visibility.ts. A survey submission only
# contributes to public court-actor aggregates when the reporter explicitly
# consented to public display AND an admin has approved the row. data_only
# submissions never feed public counts, names, or notes — even if other
# admin signals would otherwise let the cluster through.
_PUBLIC_SHARE_PERMISSIONS = {"public", "anonymous", "first_name"}


def _is_public_shareable_submission(submission: dict | None) -> bool:
    if not submission:
        return False
    if submission.get("approved") is not True:
        return False
    perm = str(submission.get("permission_to_share") or "").strip()
    return perm in _PUBLIC_SHARE_PERMISSIONS


def _is_countable_submission(submission: dict | None) -> bool:
    if not submission:
        return False
    perm = str(submission.get("permission_to_share") or "").strip()
    if perm == "data_only":
        return True
    if submission.get("approved") is not True:
        return False
    return perm in _PUBLIC_SHARE_PERMISSIONS


def _normalized_note_text(note: Any) -> str:
    text = str(note or "").lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _note_tokens(note: Any) -> set[str]:
    # Light plural/possessive folding so "rights"/"right" and "judges"/"judge"
    # match — enough for near-duplicate detection without a stemmer dependency.
    tokens = set()
    for word in _normalized_note_text(note).split():
        if len(word) > 3 and word.endswith("s"):
            word = word[:-1]
        tokens.add(word)
    return tokens


# Token-overlap floor above which two notes from the SAME family are treated
# as retellings of the same incident. Within a family a false positive is
# harmless (their notes get merged into one quote either way); this only
# decides whether a redundant variant is dropped from the merged text.
_FAMILY_NEAR_DUPLICATE_JACCARD = 0.5


def _is_near_duplicate_note(a: Any, b: Any) -> bool:
    na, nb = _normalized_note_text(a), _normalized_note_text(b)
    if not na or not nb:
        return False
    if na in nb or nb in na:
        return True
    ta, tb = _note_tokens(a), _note_tokens(b)
    if not ta or not tb:
        return False
    union = len(ta | tb)
    if union == 0:
        return False
    return len(ta & tb) / union >= _FAMILY_NEAR_DUPLICATE_JACCARD


def _merge_family_comments(
    comment_items: list[dict],
    family_latest_shareable: dict[str, bool] | None = None,
) -> list[dict]:
    """Collapse an actor's comments to ONE public comment per family.

    One family submitting several surveys about the same actor must not get
    several quotes on the share slides or in the state PDF. Per family:
      - drop the family entirely when its LATEST submission is no longer
        publicly shareable (latest consent wins — it can only restrict),
      - drop near-duplicate retellings (containment or high token overlap),
        keeping the most comprehensive variant,
      - merge the remaining distinct notes, most recent first, into a single
        comment so no publishable content is lost.
    Cross-family, only exact normalized duplicates are dropped so distinct
    families with similar experiences each keep their own voice.
    """
    by_family: dict[str, list[dict]] = {}
    order: list[str] = []
    for item in comment_items:
        note = str(item.get("note") or "").strip()
        if not note:
            continue
        fk = str(item.get("family_key") or f"note:{_normalized_note_text(note)}")
        if fk not in by_family:
            by_family[fk] = []
            order.append(fk)
        by_family[fk].append(item)

    merged_out: list[dict] = []
    seen_cross_family: set[str] = set()
    for fk in order:
        if family_latest_shareable is not None and family_latest_shareable.get(fk) is False:
            continue
        items = by_family[fk]
        # Admin-curated merges first, then longest first, so the most
        # comprehensive variant survives and redundant retellings drop.
        candidates = sorted(
            items,
            key=lambda c: (
                0 if c.get("is_merged") else 1,
                -len(str(c.get("note") or "")),
            ),
        )
        kept: list[dict] = []
        for item in candidates:
            if any(_is_near_duplicate_note(item.get("note"), k.get("note")) for k in kept):
                continue
            kept.append(item)
        if not kept:
            continue
        # Most recent first inside the merged comment ("the most recent in
        # all of it"), falling back to the original order when timestamps
        # are missing.
        kept.sort(key=lambda c: str(c.get("created_at") or ""), reverse=True)
        merged_note = " ".join(str(c.get("note") or "").strip() for c in kept).strip()
        cross_key = _normalized_note_text(merged_note)
        if not merged_note or cross_key in seen_cross_family:
            continue
        seen_cross_family.add(cross_key)
        court = next(
            (str(c.get("court_or_county") or "").strip() for c in kept if str(c.get("court_or_county") or "").strip()),
            "",
        )
        merged_out.append({"note": merged_note, "court_or_county": court})
    return merged_out
_ROLE_PREFIX_RE = re.compile(r"^(hon\.?|honorable|judge|justice|magistrate|commissioner|referee|attorney|atty\.?|gal|guardian ad litem|minor'?s counsel|minor counsel|dr\.?|doctor)\s+", re.I)
_SUFFIX_RE = re.compile(r"\s+(jr\.?|sr\.?|ii|iii|iv|esq\.?|esquire)$", re.I)
_GIVEN_NAME_ALIASES = {
    # Conservative first-name aliases/misspellings observed in the court-actor data.
    # Only the first token is rewritten, so distinct people with different last
    # names stay separate.
    "andy": "andrew",
    "drew": "andrew",
    "keven": "kevin",
}


def _actor_name_key(name: Any) -> str:
    text = unicodedata.normalize("NFKD", str(name or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[.,'\"`´‘’]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = _ROLE_PREFIX_RE.sub("", text)
    text = _SUFFIX_RE.sub("", text)
    text = re.sub(r"\s+[a-z]\s+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    tokens = text.split()
    if len(tokens) >= 2:
        tokens[0] = _GIVEN_NAME_ALIASES.get(tokens[0], tokens[0])
    return " ".join(
        re.sub(r"([a-z])\1+", r"\1", token) if len(token) >= 5 else token
        for token in tokens
    )


def _most_common(counter: Counter):
    return counter.most_common(1)[0][0] if counter else None


def _joined_submission(row: dict) -> dict:
    joined = row.get("survey_submissions") or {}
    if isinstance(joined, list):
        joined = joined[0] if joined else {}
    return joined if isinstance(joined, dict) else {}


def _actor_state(row: dict) -> str:
    direct = str(row.get("state_code") or "").strip().upper()
    if direct:
        return direct
    return str(_joined_submission(row).get("state_of_occurrence") or "").strip().upper()


def _actor_location(row: dict) -> str:
    """Canonical grouping key for an actor: location_key (post-migration 019),
    falling back to state_code, then state_of_occurrence, then outside_us_country.
    Returns uppercased state abbrev for US, country name (uppercased) for international.
    """
    location_key = str(row.get("location_key") or "").strip().upper()
    if location_key:
        return location_key
    state = str(row.get("state_code") or "").strip().upper()
    if state:
        return state
    sub = _joined_submission(row)
    state = str(sub.get("state_of_occurrence") or "").strip().upper()
    if state:
        return state
    return str(sub.get("outside_us_country") or "").strip().upper()


def _actor_family_key(row: dict, review_map: dict[str, str] | None = None) -> str | None:
    """Family-dedupe key for one court_actors row. Mirrors resolveFamilyKey
    in lib/court-actors.ts so PDF counts match /api/survey/court-actors.

    Returns None when the row is admin-marked as 'duplicate' or
    'submitter_hidden' — caller skips it. 'merge_comments' rows still count;
    only their original public note is hidden by the notes/comment paths.
    Returns 'row:<id>' when admin-marked 'count_separately' so it survives
    the email|location dedupe.
    Otherwise: 'lower(email)|location' if email present, else
    'submission:<submission_id>'.
    """
    if review_map is not None and row.get("id") in review_map:
        decision = review_map[row["id"]]
        if decision in {"duplicate", "submitter_hidden"}:
            return None
        if decision == "count_separately":
            return f"row:{row['id']}"
    location = _actor_location(row)
    joined = _joined_submission(row)
    email = str(joined.get("email") or "").strip().lower()
    return f"{email}|{location}" if email else f"submission:{row.get('submission_id')}"


def _load_court_actor_alias_resolver(sb: Client) -> dict[str, dict]:
    """Load same_actor alias decisions and return a lookup map keyed by
    '<name_key>|<location_key>' -> {canonical_name, canonical_role}.

    Mirrors AliasResolver in lib/court-actor-similarity.ts. Returns an
    empty map (not None) when the table is missing so the caller can run
    pre-migration unaffected.
    """
    try:
        rows = _paginated_select(
            sb,
            "court_actor_alias_decisions",
            "location_key,decision,canonical_name,canonical_role,name_keys",
            eq_filters={"decision": "same_actor"},
            order_by="id",
        )
    except Exception as exc:
        text = str(exc)
        if "court_actor_alias_decisions" in text or "42P01" in text or "PGRST205" in text:
            return {}
        raise

    out: dict[str, dict] = {}
    for d in rows:
        canonical_name = d.get("canonical_name")
        if not canonical_name:
            continue
        location_key = d.get("location_key") or ""
        for nk in (d.get("name_keys") or []):
            if not nk:
                continue
            out[f"{nk}|{location_key}"] = {
                "canonical_name": canonical_name,
                "canonical_role": d.get("canonical_role"),
            }
        # Also register the canonical name's own key (mirrors
        # spotlight_build._load_alias_resolver) so a row whose name IS the
        # canonical spelling still joins its alias cluster even when that
        # key is missing from name_keys.
        out.setdefault(
            f"{_actor_name_key(canonical_name)}|{location_key}",
            {
                "canonical_name": canonical_name,
                "canonical_role": d.get("canonical_role"),
            },
        )
    return out


def _load_court_actor_row_review_map(sb: Client) -> dict[str, str]:
    """Load row_id -> decision map. Empty map (not None) if table missing."""
    try:
        rows = _paginated_select(
            sb, "court_actor_row_review", "row_id,decision", order_by="id"
        )
    except Exception as exc:
        text = str(exc)
        if "court_actor_row_review" in text or "42P01" in text or "PGRST205" in text:
            return {}
        raise
    return {
        r["row_id"]: r["decision"]
        for r in rows
        if r.get("row_id") and r.get("decision")
    }


def _load_court_actor_comment_merge_map(
    sb: Client,
) -> tuple[dict[str, str], dict[str, list[str]]]:
    """Load primary_row_id -> merged_comment AND primary_row_id -> merged_row_ids.

    Returns (comment_map, source_map). Both empty dicts if table missing.
    """
    try:
        rows = _paginated_select(
            sb,
            "court_actor_comment_merges",
            "primary_row_id,merged_comment,merged_row_ids",
            order_by="primary_row_id",
        )
    except Exception as exc:
        text = str(exc)
        if "court_actor_comment_merges" in text or "42P01" in text or "PGRST205" in text:
            return {}, {}
        raise
    comment_map: dict[str, str] = {}
    source_map: dict[str, list[str]] = {}
    for r in rows:
        primary = r.get("primary_row_id")
        if not primary:
            continue
        comment = (r.get("merged_comment") or "").strip()
        if comment:
            comment_map[primary] = comment
        source_map[primary] = r.get("merged_row_ids") or []
    return comment_map, source_map


def load_public_court_actors_from_supabase(state_filter: str | None = None) -> dict[str, list[dict]]:
    """Return public-safe court actors grouped by location (US state or country)
    using the public threshold. Each actor includes an anonymized list of
    public comments with county, suitable for direct rendering in the PDF.
    Submitter identity (name, email) is never returned.
    """
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars"
        )
    sb: Client = create_client(url, key)

    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        q = (
            sb.table("court_actors")
            .select("id,role,name,court_or_county,state_code,location_key,notes,submission_id,created_at,survey_submissions(email,state_of_occurrence,outside_us_country,permission_to_share,approved,created_at)")
            .eq("source", "form_direct")
        )
        resp = q.range(offset, offset + page_size - 1).execute()
        batch = resp.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    # Admin-decision overlays. All three functions return {} (not None) when
    # the underlying table is missing, so this stays safe pre-migration.
    alias_resolver = _load_court_actor_alias_resolver(sb)
    review_map = _load_court_actor_row_review_map(sb)
    comment_merge_map, comment_merge_source_map = _load_court_actor_comment_merge_map(sb)

    # Pre-compute which row IDs came from non-public submissions so we can
    # suppress their notes and detect merge taint.
    non_public_row_ids: set[str] = set()
    for row in rows:
        if not _is_public_shareable_submission(_joined_submission(row)):
            rid = row.get("id")
            if rid:
                non_public_row_ids.add(rid)

    buckets: dict[tuple[str, str], dict] = {}
    for row in rows:
        location = _actor_location(row)
        if state_filter and location != state_filter.upper():
            continue
        role = str(row.get("role") or "").strip()
        name = str(row.get("name") or "").strip()
        name_key = _actor_name_key(name)
        if not location or not role or not name_key:
            continue

        # Count data_only submissions toward family totals (they consented
        # to be counted) but never expose their notes text.
        if not _is_countable_submission(_joined_submission(row)):
            continue

        family_key = _actor_family_key(row, review_map)
        if family_key is None:
            continue

        alias_hit = alias_resolver.get(f"{name_key}|{location}")
        effective_name = alias_hit["canonical_name"] if alias_hit else name
        effective_name_key = _actor_name_key(effective_name)
        key_tuple = (location, effective_name_key)
        bucket = buckets.setdefault(
            key_tuple,
            {
                "location_key": location,
                "role_counts": Counter(),
                "name_counts": Counter(),
                "court_counts": Counter(),
                "families": set(),
                "submission_ids": set(),
                "comments": [],
                "family_latest": {},
            },
        )
        bucket["role_counts"][role] += 1
        bucket["name_counts"][effective_name] += 1
        court = str(row.get("court_or_county") or "").strip()
        if court:
            bucket["court_counts"][court] += 1
        if row.get("submission_id"):
            bucket["families"].add(family_key)
            bucket["submission_ids"].add(str(row["submission_id"]))

        # Track the family's LATEST submission and whether that submission is
        # publicly shareable. A family's most recent consent governs whether
        # any of their text appears (it can only restrict older submissions,
        # never expose text from a data_only one).
        submission = _joined_submission(row)
        submission_created = str(submission.get("created_at") or row.get("created_at") or "")
        prev = bucket["family_latest"].get(family_key)
        if prev is None or submission_created >= prev[0]:
            bucket["family_latest"][family_key] = (
                submission_created,
                _is_public_shareable_submission(submission),
            )

        # Notes: only from publicly-shareable submissions. data_only rows
        # counted above but their text stays hidden from the PDF.
        if row.get("id") in non_public_row_ids:
            continue

        merged = comment_merge_map.get(row.get("id"))
        if merged and row.get("id") in comment_merge_source_map:
            merge_tainted = any(
                rid in non_public_row_ids
                for rid in comment_merge_source_map[row["id"]]
            )
            if merge_tainted:
                merged = None
        note = (merged or str(row.get("notes") or "")).strip()
        if note and not note.startswith("[extracted_"):
            is_merged = bool(merged)
            bucket["comments"].append({
                "note": note,
                "court_or_county": court,
                "is_merged": is_merged,
                "family_key": family_key,
                "created_at": str(row.get("created_at") or submission_created or ""),
            })

    by_state: dict[str, list[dict]] = defaultdict(list)
    for bucket in buckets.values():
        count = len(bucket["families"])
        if count < PUBLIC_ACTOR_THRESHOLD:
            continue
        location = bucket["location_key"]
        # ONE public comment per family: merge each family's distinct notes
        # (latest first), drop near-duplicate retellings, and honor the
        # family's latest sharing preference. Counts stay family-deduped above.
        family_latest_shareable = {
            fk: shareable for fk, (_, shareable) in bucket["family_latest"].items()
        }
        comments = sorted(
            _merge_family_comments(bucket["comments"], family_latest_shareable),
            key=lambda c: -len(c["note"]),
        )
        actor_name = _most_common(bucket["name_counts"]) or "Named actor"
        display_override = _display_override_for_actor(actor_name)
        # Honor the same comment safety overrides the slide builder applies so
        # the PDF can never expose text the share page suppressed.
        comments = _apply_comment_safety_overrides(comments, display_override)
        display_name = str(display_override.get("display_name") or actor_name).strip() or actor_name
        display_role = str(display_override.get("role") or _most_common(bucket["role_counts"]) or "Court Actor").strip() or "Court Actor"
        display_court = str(
            display_override.get("court_or_county")
            or display_override.get("county")
            or _most_common(bucket["court_counts"])
            or ""
        ).strip() or None
        submission_count = len(bucket["submission_ids"])
        by_state[location].append({
            "role": display_role,
            "name": display_name,
            "court_or_county": display_court,
            "count": count,
            "submission_count": submission_count,
            "comments": comments,
            # Deep link to the complaint-packet page rendered by Next.js for
            # this actor. The slug is computed on both sides identically so
            # the URL resolves to the right /reports/actors/<id>/complaint-packet
            # route. complaint_agency_name is left blank — the routing config
            # lives in TypeScript (lib/complaint-routing/stateComplaintConfig.ts)
            # and the template falls back gracefully when this is empty.
            "complaint_packet_url": f"https://my.standwithmeg.com{_complaint_packet_url(actor_name, location)}",
            "complaint_agency_name": None,
        })

    for state, actors in by_state.items():
        actors.sort(key=lambda a: (-a["count"], a["name"]))
    return dict(by_state)


def _pro_se_string(v: Any) -> str:
    """Match the xlsx wording so score_quote / state_stats string-matching works."""
    if v is True:
        return "Yes, I am Pro Se (Representing myself)"
    if isinstance(v, str):
        return v
    return "No, I have an attorney"


def _num_or_blank(v: Any) -> Any:
    """
    Preserve NULL/empty values for numeric columns so generate_state_pdf.py's
    safe_float() returns None and the row is excluded from medians/means.
    Coercing NULL to 0 (the previous behavior) inflated the response count and
    pulled medians toward $0 / 0 months because non-respondents were being
    counted as zero-valued respondents.
    """
    if v is None:
        return ""
    if isinstance(v, str) and not v.strip():
        return ""
    return v


def _row_tuple(r: dict) -> list:
    """
    Build a 32-slot list that matches the xlsx column positions in COLS:
      1:state, 2:atty_fees, 3:gal_fees, 4:therapy_fees, 5:reunif_fees,
      6:other_fees, 7:lost_wages, 8:asset_loss, 9:first_name, 11:permission,
      12:quote, 13:case_status, 14:system, 15:duration, 16:custody,
      17:num_kids (used by children_impact), 18:pro_se, 19:legal_rep,
      21:months_lost, 24:allegation, 30:county, 31:created_at.
    Slot 0 and any unused slots stay empty.

    Numeric columns use _num_or_blank so NULLs are preserved as "" (which
    safe_float treats as None) instead of collapsing to 0.
    """
    row = [""] * 32
    row[1]  = (r.get("state_of_occurrence") or r.get("outside_us_country") or "") or ""
    row[2]  = _num_or_blank(r.get("attorney_fees"))
    row[3]  = _num_or_blank(r.get("gal_fees"))
    row[4]  = _num_or_blank(r.get("therapy_eval_fees"))
    row[5]  = _num_or_blank(r.get("reunification_fees"))
    row[6]  = _num_or_blank(r.get("other_court_actors_fees"))
    row[7]  = _num_or_blank(r.get("lost_wages"))
    row[8]  = _num_or_blank(r.get("asset_liquidation_loss"))
    row[9]  = r.get("first_name") or ""
    # Public PDFs should count every valid deduped family row, but quotes are
    # only publishable after admin approval and explicit public-share consent.
    # Legacy rows do not have an approval workflow, so they are counted but
    # never contribute public quote text.
    if r.get("_src") == 0 and r.get("approved") is True:
        row[11] = PERMISSION_REVERSE.get(
            (r.get("permission_to_share") or "").strip().lower(),
            r.get("permission_to_share") or "",
        )
        row[12] = r.get("impact_quote") or ""
    else:
        row[11] = PERMISSION_REVERSE["data_only"]
        row[12] = ""
    row[13] = r.get("case_status") or ""
    row[14] = r.get("system_affected") or ""
    row[15] = r.get("time_in_system") or ""
    row[16] = r.get("custody_status") or ""
    row[17] = _num_or_blank(r.get("number_of_kids"))
    row[18] = _pro_se_string(r.get("is_pro_se"))
    row[19] = r.get("legal_rep_history") or ""
    row[21] = _num_or_blank(r.get("months_lost_parenting_time"))
    row[24] = r.get("allegation_type") or ""
    row[30] = r.get("case_county") or ""
    row[31] = r.get("created_at") or ""
    return row


def _paginated_select(
    sb: Client,
    table: str,
    columns: str,
    eq_filters: dict[str, str] | None = None,
    order_by: str | None = None,
) -> list[dict]:
    """Supabase caps each .select() at 1000 rows. Page through explicitly.

    Pass order_by as a unique column (usually the primary key): .range()
    pagination without a stable sort can silently skip or duplicate rows at
    page boundaries when PostgREST changes row order between page requests.
    """
    out: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        query = sb.table(table).select(columns)
        for col, val in (eq_filters or {}).items():
            query = query.eq(col, val)
        if order_by:
            query = query.order(order_by)
        resp = query.range(offset, offset + page_size - 1).execute()
        batch = resp.data or []
        if not batch:
            break
        out.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return out


def _load_count_separately_keys(sb: Client) -> set[str]:
    """Rows manually marked as separate cases should bypass email/state dedupe."""
    try:
        rows = _paginated_select(
            sb,
            "admin_review_decisions",
            "source_table,source_id",
            eq_filters={"decision": "count_separately"},
            order_by="id",
        )
    except Exception as exc:
        text = str(exc)
        if "admin_review_decisions" in text or "42P01" in text:
            return set()
        raise

    return {
        f"{row.get('source_table')}:{row.get('source_id')}"
        for row in rows
        if row.get("source_table") and row.get("source_id")
    }


# Column list needs to cover everything _row_tuple touches for BOTH tables.
# legacy_submissions doesn't have permission_to_share or impact_quote, so
# we request what exists and _row_tuple's .get() default covers the rest.
_SURVEY_COLS = (
    "state_of_occurrence,outside_us_country,attorney_fees,gal_fees,"
    "therapy_eval_fees,reunification_fees,other_court_actors_fees,lost_wages,"
    "asset_liquidation_loss,first_name,permission_to_share,impact_quote,"
    "case_status,system_affected,time_in_system,custody_status,number_of_kids,"
    "is_pro_se,legal_rep_history,months_lost_parenting_time,allegation_type,"
    "case_county,approved"
)

_LEGACY_COLS = (
    "state_of_occurrence,outside_us_country,attorney_fees,gal_fees,"
    "therapy_eval_fees,reunification_fees,other_court_actors_fees,lost_wages,"
    "asset_liquidation_loss,first_name,"
    "case_status,system_affected,time_in_system,custody_status,number_of_kids,"
    "is_pro_se,legal_rep_history,months_lost_parenting_time,allegation_type,"
    "case_county"
)


def _iso_epoch(iso) -> int:
    """Parse an ISO timestamp to a sortable int (seconds). 0 for None/invalid.
    Used only for dedup tiebreak ordering (newest wins)."""
    if not iso:
        return 0
    try:
        from datetime import datetime
        s = str(iso).replace("Z", "+00:00")
        return int(datetime.fromisoformat(s).timestamp())
    except Exception:
        return 0


def _dedup_key(r: dict, anon_id: int, count_separately_keys: set[str]) -> tuple:
    """
    Mirror migration 009's (email_key, state) dedup from the
    movement_stats_by_state view so PDF counts match the public dashboard
    exactly. Blank-email rows each get a synthetic unique key so they are
    not collapsed with other anonymous rows in the same state.
    """
    raw_state   = (r.get("state_of_occurrence") or "").strip().upper()
    raw_country = (r.get("outside_us_country")  or "").strip()
    state = raw_state or raw_country
    source_key = f"{r.get('_table')}:{r.get('id')}"
    if source_key in count_separately_keys:
        return (f"__separate_{source_key}__", state)

    email = (r.get("email") or "").strip().lower()
    email_key = email if email else f"__anon_{anon_id}__"
    return (email_key, state)


_FINGERPRINT_FIELDS = (
    "attorney_fees", "gal_fees", "therapy_eval_fees", "reunification_fees",
    "other_court_actors_fees", "lost_wages", "asset_liquidation_loss",
    "months_lost_parenting_time",
)


def _financial_fingerprint(r: dict) -> tuple | None:
    """
    Deterministic per-row signature across the financial fields, used as a
    secondary dedup key for the legacy/survey identical-pair case (rows
    with no email match but byte-identical financials).

    Returns None when the row has no reportable financial signal — those
    rows can't be confidently identified as the same submission as another
    blank-financial row, so they bypass the secondary pass.
    """
    parts = []
    has_signal = False
    for f in _FINGERPRINT_FIELDS:
        v = r.get(f)
        if v in (None, "",):
            parts.append(None)
            continue
        try:
            n = float(v)
        except (TypeError, ValueError):
            parts.append(None)
            continue
        parts.append(round(n, 2))
        if n > 0:
            has_signal = True
    if not has_signal:
        return None
    state = (r.get("state_of_occurrence") or "").strip().upper()
    county = (r.get("case_county") or "").strip().lower()
    return (state, county, tuple(parts))


def _dedup(survey: list[dict], legacy: list[dict], count_separately_keys: set[str]) -> list[dict]:
    """
    Collapse duplicates across both tables in two passes:

      Pass 1 — (email_key, state) dedup. Mirrors migration 009's
        movement_stats_by_state view so PDF counts match the public dashboard
        exactly.

      Pass 2 — financial fingerprint dedup. Some legacy/survey twin rows
        share a byte-identical financial section but lack an email link
        (one or both anonymous), so pass 1 sees them as distinct
        synthetic-key rows. Pass 2 collapses them on
        (state, county, expense vector). Conservative: only fires on rows
        that have at least one non-zero financial field, never on
        admin-flagged count_separately rows.

    survey_submissions wins over legacy_submissions in both passes
    (migration 009's source_priority 0 vs 1). Within the same priority,
    newer created_at wins.
    """
    tagged: list[dict] = []
    for i, r in enumerate(survey):
        tagged.append({**r, "_src": 0, "_idx": i, "_table": "survey_submissions"})
    for i, r in enumerate(legacy, start=len(survey)):
        tagged.append({**r, "_src": 1, "_idx": i, "_table": "legacy_submissions"})

    # Sort: source_priority asc (survey first), then created_at desc (newest first)
    tagged.sort(key=lambda r: (r["_src"], -_iso_epoch(r.get("created_at"))))

    seen: set[tuple] = set()
    pass1: list[dict] = []
    for r in tagged:
        k = _dedup_key(r, r["_idx"], count_separately_keys)
        if k in seen:
            continue
        seen.add(k)
        pass1.append(r)

    # Pass 2 — financial fingerprint
    seen_fp: set[tuple] = set()
    out: list[dict] = []
    for r in pass1:
        source_key = f"{r.get('_table')}:{r.get('id')}"
        if source_key in count_separately_keys:
            out.append(r)
            continue
        fp = _financial_fingerprint(r)
        if fp is None:
            out.append(r)
            continue
        if fp in seen_fp:
            continue
        seen_fp.add(fp)
        out.append(r)
    return out


def load_rows_from_supabase() -> list[list]:
    """Fetch every row from both tables, dedup (email,state), return xlsx-style tuples."""
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars"
        )
    sb: Client = create_client(url, key)

    # Need email + created_at for dedup on top of the PDF display columns
    survey_cols = _SURVEY_COLS + ",id,email,created_at"
    legacy_cols = _LEGACY_COLS + ",id,email,created_at"

    survey = _paginated_select(sb, "survey_submissions", survey_cols, order_by="id")
    legacy = _paginated_select(sb, "legacy_submissions", legacy_cols, order_by="id")
    count_separately_keys = _load_count_separately_keys(sb)

    deduped = _dedup(survey, legacy, count_separately_keys)
    rows = [_row_tuple(r) for r in deduped]
    print(
        f"  Loaded {len(survey)} survey + {len(legacy)} legacy = "
        f"{len(survey) + len(legacy)} raw rows, deduped to {len(rows)} unique"
    )
    return rows


# Public-safe sponsor columns only — price/billing fields are never read here.
_SPONSOR_PUBLIC_COLS = (
    "business_name,website_url,phone,services,tagline,"
    "location_label,brand_color,logo_url,slot,sort_order"
)


def load_state_exclusive_sponsor(state_abbr: str) -> dict | None:
    """Return the approved State Exclusive sponsor for a state, or None.

    Mirrors the public /api/sponsors?placement=pdf rule: only the single
    `state_exclusive` slot appears in the PDF — Community Supporters never do.
    Fails open (returns None) so a sponsor lookup can never break a PDF batch.
    """
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None

    # Canada keeps its full name; US states are 2-letter codes.
    raw = (state_abbr or "").strip()
    state = "Canada" if raw.lower() == "canada" else raw.upper()[:2]
    if not state:
        return None

    try:
        sb: Client = create_client(url, key)
        resp = (
            sb.table("sponsors")
            .select(_SPONSOR_PUBLIC_COLS)
            .eq("status", "active")
            .eq("approved", True)
            .eq("slot", "state_exclusive")
            .eq("state", state)
            .order("sort_order", desc=False)
            .limit(1)
            .execute()
        )
        data = resp.data or []
        return data[0] if data else None
    except Exception as exc:  # noqa: BLE001 — never let a sponsor lookup kill a batch
        print(f"  Sponsor lookup failed for {state}: {exc}")
        return None
