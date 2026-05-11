#!/usr/bin/env python3
"""
One-off import for the old (Tally/LeadConnector) survey CSV that turned
out to still be collecting responses. Inserts only rows whose
(email, state_of_occurrence) is NOT already present in either
survey_submissions or legacy_submissions, so it is safe to re-run.

Usage:
  python3 scripts/import_old_survey_csv_2026_05_09.py /path/to/file.csv          # dry run
  python3 scripts/import_old_survey_csv_2026_05_09.py /path/to/file.csv --live   # actually insert

Inserts into legacy_submissions with data_source='legacy_v1_csv_import_2026_05_09'.
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from supabase import create_client

PROJECT_DIR = Path(__file__).resolve().parent.parent
TABLE = "legacy_submissions"
DATA_SOURCE = "legacy_v1_csv_import_2026_05_09"
PG_INT_MAX = 2_147_483_647


def load_env():
    env_path = PROJECT_DIR / ".env.local"
    if not env_path.exists():
        sys.exit(f"ERROR: {env_path} not found")
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


# CSV column names → legacy_submissions column names. Keys are the
# header strings as they appear in the source file (some contain
# non-breaking spaces \xa0; matched literally).
COL_MAP = {
    "First Name":                                                                    "first_name",
    "Last Name":                                                                     "last_name",
    "Email":                                                                         "email",
    "State of Occurrence":                                                           "state_of_occurrence",
    "\xa0Are you outside of the United States?":                                     "outside_us_country",
    "\xa0Enter the county where your case took place":                               "case_county",
    "What is your current case status?":                                             "case_status",
    "How many kids do you have?":                                                    "number_of_kids",
    "Which system affected you?":                                                    "system_affected",
    "How long\xa0 \"in the system\"? ":                                              "time_in_system",
    "Current Custody Status":                                                        "custody_status",
    "Are you representing yourself (Pro Se)? Click one.":                            "is_pro_se",
    "Legal Representation History":                                                  "legal_rep_history",
    "Primary Nature of Allegations/Intervention":                                    "allegation_type",
    "Other -\xa0Due Process & Fraud":                                                "allegation_other_detail",
    "Due Process & Fraud Checklist: (Checkboxes - Select all that apply)":           "due_process_checklist",
    "Other Allegation Details":                                                      "other_allegation_details",
    "Are you aware of any personal, professional, or financial relationships between the Judge, Attorneys, or Evaluators that were not disclosed in your case?": "conflict_of_interest_awareness",
    "If Yes, please briefly describe the nature of the conflict.\xa0":               "conflict_description",
    "Do you believe federal funding (Title IV-E /Adoption bonuses) influenced the direction of your case?": "federal_funding_influence",
    "Total Months of Lost Parenting Time (either as a child or parent)":             "months_lost_parenting_time",
    "Description of Lost Milestones (either as a child or parent)":                  "lost_milestones_description",
    "Attorney Fees":                                                                 "attorney_fees",
    "GAL / Child Representative Fees":                                               "gal_fees",
    "Therapy/Evaluations Fees":                                                      "therapy_eval_fees",
    "Reunification Service Fees":                                                    "reunification_fees",
    "Other Court Actors Fees":                                                       "other_court_actors_fees",
    "Lost Wages":                                                                    "lost_wages",
    "Asset Liquidation & Property Loss":                                             "asset_liquidation_loss",
    "In one quote (1-2 sentences), describe what this system has done to you and your family.": "impact_quote",
    "Permission to Share":                                                           "permission_to_share",
}

FINANCIAL_COLS = {
    "attorney_fees", "gal_fees", "therapy_eval_fees", "reunification_fees",
    "other_court_actors_fees", "lost_wages", "asset_liquidation_loss",
}

INT_COLS = {"number_of_kids", "months_lost_parenting_time"}


def cast_int(val):
    if val in (None, ""):
        return None
    s = re.sub(r"[^\d]", "", str(val).strip())
    if not s:
        return None
    try:
        return min(int(s), PG_INT_MAX)
    except ValueError:
        return None


def cast_int_financial(val):
    if val in (None, ""):
        return None
    v = str(val).strip().replace(",", "").replace("$", "")
    if not v:
        return None
    try:
        return min(round(float(v)), PG_INT_MAX)
    except (ValueError, TypeError):
        return None


def parse_due_process(val):
    """CSV gives a single string; split on ', ' to get array. 'None' → []."""
    s = (val or "").strip().strip('"')
    if not s or s.lower() == "none":
        return []
    return [item.strip() for item in s.split(", ") if item.strip()]


_MONTH_RE = re.compile(
    r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s+(am|pm)$",
    re.IGNORECASE,
)
_MONTH_TO_NUM = {m: i for i, m in enumerate(
    ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"], start=1)}


def parse_submission_date(val):
    """e.g. 'May 9th 2026, 3:43 pm' → ISO timestamp.
    Returns None if unparseable; Postgres will then default to imported_at.
    Note: the CSV doesn't include a timezone, so we treat the time as UTC.
    """
    s = (val or "").strip()
    if not s:
        return None
    m = _MONTH_RE.match(s)
    if not m:
        return None
    mon, day, year, hour, minute, ampm = m.groups()
    mon_key = mon[:3].lower()
    if mon_key not in _MONTH_TO_NUM:
        return None
    h = int(hour) % 12
    if ampm.lower() == "pm":
        h += 12
    try:
        dt = datetime(int(year), _MONTH_TO_NUM[mon_key], int(day),
                      h, int(minute), tzinfo=timezone.utc)
        return dt.isoformat()
    except ValueError:
        return None


def coerce_row(raw: dict) -> dict | None:
    out: dict = {"data_source": DATA_SOURCE}
    for csv_col, db_col in COL_MAP.items():
        v = raw.get(csv_col, "")
        if v is None:
            v = ""
        v = str(v).strip()
        if db_col == "due_process_checklist":
            out[db_col] = parse_due_process(raw.get(csv_col, ""))
        elif db_col in FINANCIAL_COLS:
            out[db_col] = cast_int_financial(v)
        elif db_col in INT_COLS:
            out[db_col] = cast_int(v)
        elif db_col == "state_of_occurrence":
            v = v.upper()
            # CSV uses 'US' to mean "this is US-based" — that's a marker, not a state.
            out[db_col] = v if v and v != "US" else None
        elif db_col == "outside_us_country":
            v = v.strip()
            out[db_col] = v if v and v.upper() != "US" else None
        elif db_col == "email":
            out[db_col] = v.lower() if v else None
        else:
            out[db_col] = v if v else None

    # If state is missing but country is also missing, drop. The legacy
    # location_xor constraint requires at least one location.
    if not out.get("state_of_occurrence") and not out.get("outside_us_country"):
        return None

    out["created_at"] = parse_submission_date(raw.get("Submission Date"))
    return out


def all_pages(sb, table, cols, page=1000):
    out, off = [], 0
    while True:
        resp = sb.table(table).select(cols).range(off, off + page - 1).execute()
        b = resp.data or []
        if not b:
            break
        out.extend(b)
        if len(b) < page:
            break
        off += page
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path", type=Path)
    ap.add_argument("--live", action="store_true",
                    help="Actually insert. Default is dry-run.")
    args = ap.parse_args()

    if not args.csv_path.exists():
        sys.exit(f"ERROR: CSV not found: {args.csv_path}")

    load_env()
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"],
                       os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # Build dedupe set from existing tables
    print(f"Loading existing (email, state) tuples from Supabase...")
    legacy = all_pages(sb, "legacy_submissions", "email,state_of_occurrence")
    survey = all_pages(sb, "survey_submissions", "email,state_of_occurrence")

    def keyof(email, state):
        return ((email or "").strip().lower(), (state or "").strip().upper())

    existing = {keyof(r.get("email"), r.get("state_of_occurrence"))
                for r in legacy + survey}
    print(f"  existing unique tuples: {len(existing)}  "
          f"(legacy={len(legacy)}, survey={len(survey)})")

    # Read CSV
    with open(args.csv_path) as f:
        rows = list(csv.DictReader(f))
    print(f"\nCSV rows total: {len(rows)}")

    # Filter to new + coerce
    seen_in_batch: set = set()
    to_insert: list = []
    skipped_existing = 0
    skipped_no_email = 0
    skipped_no_location = 0
    skipped_dup_in_csv = 0

    for r in rows:
        email = (r.get("Email") or "").strip().lower()
        state = (r.get("State of Occurrence") or "").strip().upper()
        if not email:
            skipped_no_email += 1
            continue
        k = keyof(email, state)
        if k in existing:
            skipped_existing += 1
            continue
        if k in seen_in_batch:
            skipped_dup_in_csv += 1
            continue
        coerced = coerce_row(r)
        if coerced is None:
            skipped_no_location += 1
            continue
        seen_in_batch.add(k)
        to_insert.append(coerced)

    print("\n=== Plan ===")
    print(f"  to insert:        {len(to_insert)}")
    print(f"  skipped — existing in DB: {skipped_existing}")
    print(f"  skipped — within-CSV dup:  {skipped_dup_in_csv}")
    print(f"  skipped — no email:        {skipped_no_email}")
    print(f"  skipped — no location:     {skipped_no_location}")

    if to_insert:
        print("\n=== Rows that will be inserted ===")
        for i, r in enumerate(to_insert, 1):
            print(f"  [{i:2d}] {r['first_name']!r} {r['last_name']!r}  "
                  f"<{r['email']}>  state={r['state_of_occurrence']}  "
                  f"created_at={r.get('created_at')}")

    if not args.live:
        print("\nDRY RUN — nothing inserted. Re-run with --live to actually insert.")
        return

    if not to_insert:
        print("\nNothing to insert. Done.")
        return

    print(f"\nInserting {len(to_insert)} rows into {TABLE} ...")
    resp = sb.table(TABLE).insert(to_insert).execute()
    inserted = len(resp.data or [])
    print(f"  inserted: {inserted}")
    if inserted != len(to_insert):
        print(f"  WARNING: expected {len(to_insert)} but Supabase returned {inserted}")


if __name__ == "__main__":
    main()
