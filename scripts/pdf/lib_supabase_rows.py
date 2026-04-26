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

PUBLIC_ACTOR_THRESHOLD = 5
_ROLE_PREFIX_RE = re.compile(r"^(hon\.?|honorable|judge|justice|magistrate|commissioner|referee|attorney|atty\.?|gal|guardian ad litem|minor'?s counsel|minor counsel|dr\.?|doctor)\s+", re.I)
_SUFFIX_RE = re.compile(r"\s+(jr\.?|sr\.?|ii|iii|iv|esq\.?|esquire)$", re.I)


def _actor_name_key(name: Any) -> str:
    text = unicodedata.normalize("NFKD", str(name or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[.,'\"]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = _ROLE_PREFIX_RE.sub("", text)
    text = _SUFFIX_RE.sub("", text)
    text = re.sub(r"\s+[a-z]\s+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


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


def _actor_family_key(row: dict) -> str:
    state = _actor_state(row)
    joined = _joined_submission(row)
    email = str(joined.get("email") or "").strip().lower()
    return f"{email}|{state}" if email else f"submission:{row.get('submission_id')}"


def load_public_court_actors_from_supabase(state_filter: str | None = None) -> dict[str, list[dict]]:
    """Return public-safe court actors grouped by state using the 5-family rule."""
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
            .select("role,name,court_or_county,state_code,submission_id,survey_submissions(email,state_of_occurrence)")
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

    buckets: dict[tuple[str, str, str], dict] = {}
    for row in rows:
        state = _actor_state(row)
        if state_filter and state != state_filter.upper():
            continue
        role = str(row.get("role") or "").strip()
        name = str(row.get("name") or "").strip()
        name_key = _actor_name_key(name)
        if not state or not role or not name_key:
            continue
        key_tuple = (state, role.lower(), name_key)
        bucket = buckets.setdefault(
            key_tuple,
            {
                "state_code": state,
                "role_counts": Counter(),
                "name_counts": Counter(),
                "court_counts": Counter(),
                "families": set(),
            },
        )
        bucket["role_counts"][role] += 1
        bucket["name_counts"][name] += 1
        if row.get("court_or_county"):
            bucket["court_counts"][str(row["court_or_county"]).strip()] += 1
        if row.get("submission_id"):
            bucket["families"].add(_actor_family_key(row))

    by_state: dict[str, list[dict]] = defaultdict(list)
    for bucket in buckets.values():
        count = len(bucket["families"])
        if count < PUBLIC_ACTOR_THRESHOLD:
            continue
        state = bucket["state_code"]
        by_state[state].append({
            "role": _most_common(bucket["role_counts"]) or "Court Actor",
            "name": _most_common(bucket["name_counts"]) or "Named actor",
            "court_or_county": _most_common(bucket["court_counts"]),
            "count": count,
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


def _dedup_key(r: dict, anon_id: int) -> tuple:
    """
    Mirror migration 009's (email_key, state) dedup from the
    movement_stats_by_state view so PDF counts match the public dashboard
    exactly. Blank-email rows each get a synthetic unique key so they are
    not collapsed with other anonymous rows in the same state.
    """
    raw_state   = (r.get("state_of_occurrence") or "").strip().upper()
    raw_country = (r.get("outside_us_country")  or "").strip()
    state = raw_state or raw_country
    email = (r.get("email") or "").strip().lower()
    email_key = email if email else f"__anon_{anon_id}__"
    return (email_key, state)


def _dedup(survey: list[dict], legacy: list[dict]) -> list[dict]:
    """
    Collapse (email_key, state) duplicates across both tables.
    survey_submissions wins over legacy_submissions (migration 009's
    source_priority 0 vs 1). Within the same priority, newer created_at
    wins. Preserves one row per unique family+state.
    """
    tagged: list[dict] = []
    for i, r in enumerate(survey):
        tagged.append({**r, "_src": 0, "_idx": i})
    for i, r in enumerate(legacy, start=len(survey)):
        tagged.append({**r, "_src": 1, "_idx": i})

    # Sort: source_priority asc (survey first), then created_at desc (newest first)
    tagged.sort(key=lambda r: (r["_src"], -_iso_epoch(r.get("created_at"))))

    seen: set[tuple] = set()
    out: list[dict] = []
    for r in tagged:
        k = _dedup_key(r, r["_idx"])
        if k in seen:
            continue
        seen.add(k)
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
    survey_cols = _SURVEY_COLS + ",email,created_at"
    legacy_cols = _LEGACY_COLS + ",email,created_at"

    survey = _paginated_select(sb, "survey_submissions", survey_cols)
    legacy = _paginated_select(sb, "legacy_submissions", legacy_cols)

    deduped = _dedup(survey, legacy)
    rows = [_row_tuple(r) for r in deduped]
    print(
        f"  Loaded {len(survey)} survey + {len(legacy)} legacy = "
        f"{len(survey) + len(legacy)} raw rows, deduped to {len(rows)} unique"
    )
    return rows
