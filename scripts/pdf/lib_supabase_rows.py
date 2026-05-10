"""
Load survey rows from Supabase in the same tuple shape generate_state_pdf.py
expects from the xlsx master workbook.

This lets the PDF generator read directly from the live DB without needing
the local master xlsx. Used by both local runs and the GitHub Actions
nightly regeneration workflow.
"""
from __future__ import annotations
import os
import re
import unicodedata
from collections import Counter, defaultdict
from typing import Any
from supabase import create_client, Client


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

    Returns None when the row is admin-marked as 'duplicate' — caller skips it.
    Returns 'row:<id>' when admin-marked 'count_separately' so it survives
    the email|location dedupe.
    Otherwise: 'lower(email)|location' if email present, else
    'submission:<submission_id>'.
    """
    if review_map is not None and row.get("id") in review_map:
        decision = review_map[row["id"]]
        if decision == "duplicate":
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
        resp = (
            sb.table("court_actor_alias_decisions")
            .select("location_key,decision,canonical_name,canonical_role,name_keys")
            .eq("decision", "same_actor")
            .execute()
        )
    except Exception as exc:
        text = str(exc)
        if "court_actor_alias_decisions" in text or "42P01" in text or "PGRST205" in text:
            return {}
        raise

    out: dict[str, dict] = {}
    for d in (resp.data or []):
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
    return out


def _load_court_actor_row_review_map(sb: Client) -> dict[str, str]:
    """Load row_id -> decision map. Empty map (not None) if table missing."""
    try:
        resp = sb.table("court_actor_row_review").select("row_id,decision").execute()
    except Exception as exc:
        text = str(exc)
        if "court_actor_row_review" in text or "42P01" in text or "PGRST205" in text:
            return {}
        raise
    return {
        r["row_id"]: r["decision"]
        for r in (resp.data or [])
        if r.get("row_id") and r.get("decision")
    }


def _load_court_actor_comment_merge_map(sb: Client) -> dict[str, str]:
    """Load primary_row_id -> merged_comment map. Empty map if table missing.

    Mirrors loadCommentMergeMap in app/api/survey/court-actors/notes/route.ts.
    Merged rows themselves are excluded from family counts via the
    'merge_comments' decision in court_actor_row_review (migration 023 widens
    the check). The primary row's display note is replaced with merged_comment
    by the caller, so all of the same reporter's testimony shows under one
    family entry in the PDF.
    """
    try:
        resp = (
            sb.table("court_actor_comment_merges")
            .select("primary_row_id,merged_comment")
            .execute()
        )
    except Exception as exc:
        text = str(exc)
        if "court_actor_comment_merges" in text or "42P01" in text or "PGRST205" in text:
            return {}
        raise
    out: dict[str, str] = {}
    for r in (resp.data or []):
        primary = r.get("primary_row_id")
        comment = (r.get("merged_comment") or "").strip()
        if primary and comment:
            out[primary] = comment
    return out


def load_public_court_actors_from_supabase(state_filter: str | None = None) -> dict[str, list[dict]]:
    """Return public-safe court actors grouped by location (US state or country)
    using the public threshold. Each actor includes an anonymized list of
    family comments with county, suitable for direct rendering in the PDF.
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
            .select("id,role,name,court_or_county,state_code,location_key,notes,submission_id,survey_submissions(email,state_of_occurrence,outside_us_country)")
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
    comment_merge_map = _load_court_actor_comment_merge_map(sb)

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

        # Skip rows the admin marked as 'duplicate' — testimony is preserved
        # in court_actors but contributes nothing to public counts.
        family_key = _actor_family_key(row, review_map)
        if family_key is None:
            continue

        # Apply approved 'same_actor' alias decisions: roll close-name variants
        # in this location into the canonical bucket and display.
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
                # family_key -> {note, court_or_county} — keep best note per family
                "family_notes": {},
            },
        )
        bucket["role_counts"][role] += 1
        # When alias decision applies, the canonical spelling is what gets
        # tracked for casing — mirrors lib/court-actors.ts buildPublicCourtActors.
        bucket["name_counts"][effective_name] += 1
        court = str(row.get("court_or_county") or "").strip()
        if court:
            bucket["court_counts"][court] += 1
        if row.get("submission_id"):
            bucket["families"].add(family_key)
        # Track best note per family. Merged-comment primaries win over plain
        # notes for the same family, regardless of plain-note length, because
        # the merged_comment IS the admin-curated combined testimony for that
        # reporter. Otherwise, longest non-empty wins; [extracted_*] markers
        # are dropped (those are admin-only source tags).
        merged = comment_merge_map.get(row.get("id"))
        note = (merged or str(row.get("notes") or "")).strip()
        if note and not note.startswith("[extracted_"):
            existing = bucket["family_notes"].get(family_key)
            existing_is_merged = bool(existing and existing.get("is_merged"))
            is_merged = bool(merged)
            should_replace = (
                existing is None
                or (is_merged and not existing_is_merged)
                or (not existing_is_merged and len(note) > len(existing.get("note", "")))
            )
            if should_replace:
                bucket["family_notes"][family_key] = {
                    "note": note,
                    "court_or_county": court,
                    "is_merged": is_merged,
                }

    by_state: dict[str, list[dict]] = defaultdict(list)
    for bucket in buckets.values():
        count = len(bucket["families"])
        if count < PUBLIC_ACTOR_THRESHOLD:
            continue
        location = bucket["location_key"]
        # One comment per family, longest first, county preserved
        comments = sorted(
            [
                {"note": fn["note"], "court_or_county": fn.get("court_or_county") or ""}
                for fn in bucket["family_notes"].values()
                if fn.get("note")
            ],
            key=lambda c: -len(c["note"]),
        )
        by_state[location].append({
            "role": _most_common(bucket["role_counts"]) or "Court Actor",
            "name": _most_common(bucket["name_counts"]) or "Named actor",
            "court_or_county": _most_common(bucket["court_counts"]),
            "count": count,
            "comments": comments,
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
      21:months_lost, 24:allegation, 30:county.
    Slot 0 and any unused slots stay empty.

    Numeric columns use _num_or_blank so NULLs are preserved as "" (which
    safe_float treats as None) instead of collapsing to 0.
    """
    row = [""] * 32
    row[1]  = (r.get("state_of_occurrence") or "") or ""
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
    return row


def _paginated_select(sb: Client, table: str, columns: str) -> list[dict]:
    """Supabase caps each .select() at 1000 rows. Page through explicitly."""
    out: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        resp = (
            sb.table(table)
            .select(columns)
            .range(offset, offset + page_size - 1)
            .execute()
        )
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
        resp = (
            sb.table("admin_review_decisions")
            .select("source_table,source_id")
            .eq("decision", "count_separately")
            .execute()
        )
    except Exception as exc:
        text = str(exc)
        if "admin_review_decisions" in text or "42P01" in text:
            return set()
        raise

    return {
        f"{row.get('source_table')}:{row.get('source_id')}"
        for row in (resp.data or [])
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

    survey = _paginated_select(sb, "survey_submissions", survey_cols)
    legacy = _paginated_select(sb, "legacy_submissions", legacy_cols)
    count_separately_keys = _load_count_separately_keys(sb)

    deduped = _dedup(survey, legacy, count_separately_keys)
    rows = [_row_tuple(r) for r in deduped]
    print(
        f"  Loaded {len(survey)} survey + {len(legacy)} legacy = "
        f"{len(survey) + len(legacy)} raw rows, deduped to {len(rows)} unique"
    )
    return rows
