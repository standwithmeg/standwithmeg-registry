#!/usr/bin/env python3
"""
Load legacy survey records into the legacy_submissions table.

Source: outputs/import/quarantined_rows.csv  (539 rows)
Target: legacy_submissions table (Supabase)

These rows were excluded from survey_submissions because they are missing
fields required by that table's NOT NULL constraints (impact_quote,
permission_to_share) or had corrupted email fields. They originate from
an earlier version of the SWM survey form.

data_source values assigned:
  'legacy_v1'                  — missing quote/permission/date (early form)
  'legacy_v1_email_corrupted'  — has quote but email field was column-shifted

Usage:
  # Dry run (default — prints stats, writes nothing):
  python3 scripts/load_legacy_submissions.py

  # Live insert:
  python3 scripts/load_legacy_submissions.py --live

  # Verify count after import:
  python3 scripts/load_legacy_submissions.py --verify

Requires:
  pip install supabase python-dotenv
"""

import argparse
import csv
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

PROJECT_DIR  = Path(__file__).resolve().parent.parent
QUARANTINE   = PROJECT_DIR / "outputs" / "import" / "quarantined_rows.csv"
ERROR_LOG    = PROJECT_DIR / "outputs" / "import" / "legacy_load_errors.csv"

TABLE        = "legacy_submissions"
BATCH_SIZE   = 100
PG_INT_MAX   = 2_147_483_647


# ── Env loader ────────────────────────────────────────────────────────────────

def load_env():
    env_path = PROJECT_DIR / ".env.local"
    if not env_path.exists():
        print(f"ERROR: {env_path} not found", file=sys.stderr)
        sys.exit(1)
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


# ── Helpers ───────────────────────────────────────────────────────────────────

def cast_int(val, cap=PG_INT_MAX):
    if not val or not str(val).strip():
        return None
    v = re.sub(r"[^\d]", "", str(val).strip())
    if not v:
        return None
    try:
        return min(int(v), cap)
    except ValueError:
        return None


def cast_int_financial(val):
    """Financial fields: strip decimals, cap at PG_INT_MAX."""
    if not val or not str(val).strip():
        return None
    v = re.sub(r"[^\d.]", "", str(val).strip())
    if not v:
        return None
    try:
        return min(round(float(v)), PG_INT_MAX)
    except (ValueError, TypeError):
        return None


def parse_due_process(val):
    """CSV stores this as a JSON array string; decode to Python list."""
    if not val or not val.strip() or val.strip() == "[]":
        return []
    try:
        result = json.loads(val)
        return result if isinstance(result, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


_VALID_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def clean_email(val):
    """
    Return the email if it looks valid; otherwise None.
    Category B rows have milestone descriptions in the email field —
    those are stored as null to avoid polluting the table.
    """
    v = (val or "").strip()
    if _VALID_EMAIL_RE.match(v):
        return v.lower()
    return None


def assign_data_source(reason, email_raw):
    """
    'legacy_v1_email_corrupted' — has quote/permission but email is corrupt.
    'legacy_v1'                 — missing quote/permission (early form).
    """
    if "invalid_email" in reason and "missing_impact_quote" not in reason:
        return "legacy_v1_email_corrupted"
    return "legacy_v1"


# ── Row coercion ──────────────────────────────────────────────────────────────

FINANCIAL_COLS = {
    "attorney_fees", "gal_fees", "therapy_eval_fees", "reunification_fees",
    "other_court_actors_fees", "lost_wages", "asset_liquidation_loss",
}

def coerce_row(raw):
    """
    Map a quarantined_rows.csv dict → dict ready for legacy_submissions insert.
    Returns (row_dict, error_string_or_None).
    """
    reason    = raw.get("_quarantine_reason", "")
    email_raw = raw.get("email", "") or ""

    # Hard skip: stray header row that leaked into the data
    raw_state = (raw.get("state_of_occurrence") or "").strip()
    if raw_state.upper() == "STATE OF OCCURRENCE":
        return None, "header_row_artifact"

    state   = raw_state.upper() or None
    country = (raw.get("outside_us_country")  or "").strip().upper() or None

    # Older form used "OTHER / OUTSIDE U.S." as a state value for international
    # respondents. Move it to outside_us_country so the location_xor constraint
    # is satisfied and the row is placeable on the dashboard.
    if state == "OTHER / OUTSIDE U.S.":
        country = country or "Other"
        state   = None

    # Hard skip: no state and no country — can't place this record at all
    if not state and not country:
        return None, "missing_location_both_null"

    row = {
        # Location
        "state_of_occurrence": state or None,
        "outside_us_country":  country or None,

        # Case details
        "case_county":   (raw.get("case_county") or "").strip() or None,
        "case_status":   (raw.get("case_status") or "").strip() or None,
        "number_of_kids": cast_int(raw.get("number_of_kids"), cap=20),
        "system_affected":    (raw.get("system_affected") or "").strip() or None,
        "time_in_system":     (raw.get("time_in_system") or "").strip() or None,
        "custody_status":     (raw.get("custody_status") or "").strip() or None,
        "is_pro_se":          (raw.get("is_pro_se") or "").strip() or None,
        "legal_rep_history":  (raw.get("legal_rep_history") or "").strip() or None,

        # Allegations
        "allegation_type":          (raw.get("allegation_type") or "").strip() or None,
        "allegation_other_detail":  (raw.get("allegation_other_detail") or "").strip() or None,
        "allegation_root_cause":    (raw.get("allegation_root_cause") or "").strip() or None,
        "due_process_checklist":    parse_due_process(raw.get("due_process_checklist")),
        "other_allegation_details": (raw.get("other_allegation_details") or "").strip() or None,

        # Conflict + funding
        "conflict_of_interest_awareness": (raw.get("conflict_of_interest_awareness") or "").strip() or None,
        "conflict_description":           (raw.get("conflict_description") or "").strip() or None,
        "federal_funding_influence":      (raw.get("federal_funding_influence") or "").strip() or None,

        # Stolen time
        "months_lost_parenting_time": cast_int(raw.get("months_lost_parenting_time")),
        "lost_milestones_description": (raw.get("lost_milestones_description") or "").strip() or None,

        # Financials
        "attorney_fees":           cast_int_financial(raw.get("attorney_fees")),
        "gal_fees":                cast_int_financial(raw.get("gal_fees")),
        "therapy_eval_fees":       cast_int_financial(raw.get("therapy_eval_fees")),
        "reunification_fees":      cast_int_financial(raw.get("reunification_fees")),
        "other_court_actors_fees": cast_int_financial(raw.get("other_court_actors_fees")),
        "lost_wages":              cast_int_financial(raw.get("lost_wages")),
        "asset_liquidation_loss":  cast_int_financial(raw.get("asset_liquidation_loss")),

        # Story fields (may be null for early-form records)
        "impact_quote":       (raw.get("impact_quote") or "").strip() or None,
        "permission_to_share":(raw.get("permission_to_share") or "").strip() or None,

        # Identity
        "first_name": (raw.get("first_name") or "").strip() or None,
        "last_name":  (raw.get("last_name") or "").strip() or None,
        "email":      clean_email(email_raw),

        # Timestamp (null → Postgres uses imported_at)
        "created_at": (raw.get("created_at") or "").strip() or None,

        # Import metadata
        "data_source": assign_data_source(reason, email_raw),
    }

    return row, None


# ── Load source CSV ───────────────────────────────────────────────────────────

def load_quarantined():
    rows = []
    with open(QUARANTINE, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows


# ── Batch helpers ─────────────────────────────────────────────────────────────

def chunked(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


# ── Main ──────────────────────────────────────────────────────────────────────

def run_import(live=False):
    load_env()

    try:
        from supabase import create_client
    except ImportError:
        print("ERROR: supabase package not installed. Run: pip install supabase", file=sys.stderr)
        sys.exit(1)

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set", file=sys.stderr)
        sys.exit(1)

    client = create_client(url, key)

    raw_rows = load_quarantined()
    print(f"Loaded {len(raw_rows)} rows from {QUARANTINE.name}")

    # Coerce all rows
    valid_rows   = []
    coerce_errors = []
    source_counts = {"legacy_v1": 0, "legacy_v1_email_corrupted": 0}

    for raw in raw_rows:
        row, err = coerce_row(raw)
        if err:
            coerce_errors.append({"_reason": err, **raw})
        else:
            valid_rows.append(row)
            source_counts[row["data_source"]] = source_counts.get(row["data_source"], 0) + 1

    print(f"After coercion: {len(valid_rows)} valid, {len(coerce_errors)} skipped")
    print(f"  legacy_v1 (early form):             {source_counts.get('legacy_v1', 0)}")
    print(f"  legacy_v1_email_corrupted:          {source_counts.get('legacy_v1_email_corrupted', 0)}")

    if not live:
        print()
        print("=" * 62)
        print("  DRY RUN — no data will be written to Supabase")
        print("=" * 62)
        print(f"  Would insert: {len(valid_rows)} rows in "
              f"{-(-len(valid_rows) // BATCH_SIZE)} batches of ≤{BATCH_SIZE}")
        print()
        if valid_rows:
            print("  Sample (first row):")
            for k, v in valid_rows[0].items():
                if v is not None and v != [] and v != "":
                    print(f"    {k}: {repr(str(v)[:80])}")
        print()
        print("  To run the live import:")
        print("    python3 scripts/load_legacy_submissions.py --live")
        return

    # ── Skip rows already in the table (safe re-run) ─────────────────────────
    # Use a synthetic fingerprint: state + first_name + last_name + created_at
    # (legacy rows often have no email to dedupe on)
    print("Checking for already-imported rows...")
    existing = set()
    page_size = 1000
    offset = 0
    while True:
        res = (
            client.table(TABLE)
            .select("state_of_occurrence, first_name, last_name, created_at")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not res.data:
            break
        for r in res.data:
            key = (
                (r.get("state_of_occurrence") or ""),
                (r.get("first_name") or "").lower(),
                (r.get("last_name") or "").lower(),
                (r.get("created_at") or ""),
            )
            existing.add(key)
        if len(res.data) < page_size:
            break
        offset += page_size

    def row_key(r):
        return (
            (r.get("state_of_occurrence") or ""),
            (r.get("first_name") or "").lower(),
            (r.get("last_name") or "").lower(),
            (r.get("created_at") or ""),
        )

    before = len(valid_rows)
    valid_rows = [r for r in valid_rows if row_key(r) not in existing]
    skipped = before - len(valid_rows)
    if skipped:
        print(f"  Skipped {skipped} rows already in {TABLE} (safe re-run)")
    print(f"  Rows to insert: {len(valid_rows)}")

    if not valid_rows:
        print("\nAll rows already imported. Nothing to do.")
        return

    # ── Live insert ───────────────────────────────────────────────────────────
    print()
    print(f"Starting live insert: {len(valid_rows)} rows → {TABLE}")
    print(f"Batch size: {BATCH_SIZE} | Batches: {-(-len(valid_rows) // BATCH_SIZE)}")
    print()

    inserted_total = 0
    batch_errors   = []
    start_time     = datetime.now(timezone.utc)

    for i, batch in enumerate(chunked(valid_rows, BATCH_SIZE), 1):
        try:
            result = client.table(TABLE).insert(batch).execute()
            n = len(result.data) if result.data else len(batch)
            inserted_total += n
            print(f"  Batch {i:>3}: inserted {n} rows  (running total: {inserted_total})")
        except Exception as e:
            err_msg = str(e)
            print(f"  Batch {i:>3}: ERROR — {err_msg[:120]}")
            for row in batch:
                batch_errors.append({"_reason": f"batch_insert_error: {err_msg[:200]}", **row})

    elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()

    # Write error log if needed
    all_errors = coerce_errors + batch_errors
    if all_errors:
        error_cols = list(all_errors[0].keys())
        with open(ERROR_LOG, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=error_cols, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(all_errors)
        print(f"\n  {len(all_errors)} error row(s) logged → {ERROR_LOG.name}")

    print()
    print("=" * 62)
    print(f"  IMPORT COMPLETE")
    print(f"  Inserted:  {inserted_total} rows")
    print(f"  Errors:    {len(batch_errors)} rows")
    print(f"  Elapsed:   {elapsed:.1f}s")
    print("=" * 62)
    print()
    print("To verify:")
    print("  python3 scripts/load_legacy_submissions.py --verify")


def run_verify():
    load_env()

    try:
        from supabase import create_client
    except ImportError:
        print("ERROR: supabase package not installed.", file=sys.stderr)
        sys.exit(1)

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    client = create_client(url, key)

    legacy_total = (
        client.table("legacy_submissions")
        .select("*", count="exact", head=True)
        .execute()
    ).count

    survey_total = (
        client.table("survey_submissions")
        .select("*", count="exact", head=True)
        .execute()
    ).count

    by_source = {}
    for source in ("legacy_v1", "legacy_v1_email_corrupted"):
        n = (
            client.table("legacy_submissions")
            .select("*", count="exact", head=True)
            .eq("data_source", source)
            .execute()
        ).count
        by_source[source] = n

    print()
    print(f"survey_submissions:              {survey_total}")
    print(f"legacy_submissions:              {legacy_total}")
    print(f"  legacy_v1 (early form):        {by_source.get('legacy_v1', 0)}")
    print(f"  legacy_v1_email_corrupted:     {by_source.get('legacy_v1_email_corrupted', 0)}")
    print(f"─────────────────────────────────────────")
    print(f"Movement total:                  {(survey_total or 0) + (legacy_total or 0)}")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Load legacy survey records into legacy_submissions"
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--live",   action="store_true", help="Execute the real insert (default: dry run)")
    group.add_argument("--verify", action="store_true", help="Check row counts, no insert")
    args = parser.parse_args()

    if args.verify:
        run_verify()
    else:
        run_import(live=args.live)
