#!/usr/bin/env python3
"""
Supabase loader for historical survey submissions.
Source: outputs/import/import_ready.csv  (1,698 rows)
Target: survey_submissions table

IMPORTANT: This script writes to Supabase. Run only after reviewing
           outputs/import/import_ready.csv and getting approval.

Usage:
  # Dry run (default — prints first 3 batches, writes nothing):
  python3 scripts/load_survey_history.py

  # Live insert:
  python3 scripts/load_survey_history.py --live

  # Verify count in Supabase after import:
  python3 scripts/load_survey_history.py --verify

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

# ── Env + paths ───────────────────────────────────────────────────────────────

PROJECT_DIR  = Path(__file__).resolve().parent.parent
IMPORT_CSV   = PROJECT_DIR / "outputs" / "import" / "import_ready.csv"
ERROR_LOG    = PROJECT_DIR / "outputs" / "import" / "load_errors.csv"

# Load .env.local (Next.js convention)
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

# ── Constants ─────────────────────────────────────────────────────────────────

BATCH_SIZE   = 100   # rows per upsert call
TABLE        = "survey_submissions"

# Financial columns are integer in the live table (not numeric as migration 002 spec'd)
FINANCIAL_COLS = {
    "attorney_fees", "gal_fees", "therapy_eval_fees", "reunification_fees",
    "other_court_actors_fees", "lost_wages", "asset_liquidation_loss",
}

# Postgres integer max — cap overflow financial values rather than rejecting the row
PG_INT_MAX       = 2_147_483_647
MAX_KIDS         = 20   # live check constraint: number_of_kids <= 20

# Columns that map to integer types
INT_COLS = {"number_of_kids", "months_lost_parenting_time"}

# Keep for backwards compat (now empty — financial moved to FINANCIAL_COLS)
NUMERIC_COLS: set = set()

# Columns that are arrays in Postgres (stored as JSON string in CSV)
ARRAY_COLS = {"due_process_checklist"}

# Columns that are boolean in Postgres (live table differs from migration 002 spec)
BOOL_COLS = {"is_pro_se"}

# Metadata columns — not inserted into Supabase
META_COLS = {"_source", "_raw_email"}

# ── Row coercion ──────────────────────────────────────────────────────────────

def coerce_row(raw):
    """
    Convert a CSV row dict into a dict ready for Supabase insert.
    Returns None if the row fails a hard validation.
    """
    row = {}

    for k, v in raw.items():
        if k in META_COLS:
            continue

        v = v.strip() if v else ""

        if k in BOOL_COLS:
            # Live table has is_pro_se as boolean; map text answer → bool
            vl = v.lower()
            if vl.startswith("yes"):
                row[k] = True
            elif vl.startswith("no"):
                row[k] = False
            else:
                row[k] = None
        elif k in FINANCIAL_COLS:
            # Live table uses integer; cap values that overflow PG_INT_MAX
            if v:
                try:
                    val = round(float(re.sub(r"[^\d.]", "", v)))
                    row[k] = min(val, PG_INT_MAX)
                except (ValueError, TypeError):
                    row[k] = None
            else:
                row[k] = None
        elif k in INT_COLS:
            if v:
                try:
                    val = int(re.sub(r"[^\d]", "", v))
                    row[k] = min(max(val, 0), PG_INT_MAX)
                except (ValueError, TypeError):
                    row[k] = None
            else:
                row[k] = None
        elif k in ARRAY_COLS:
            # Stored as JSON array string in CSV
            try:
                row[k] = json.loads(v) if v and v != "[]" else []
            except json.JSONDecodeError:
                row[k] = []
        elif k == "case_status":
            # Live table has NOT NULL on case_status; use sentinel for blank historical rows
            row[k] = v if v else "Not specified"
        elif k == "created_at":
            row[k] = v if v else None   # None → Supabase uses default now()
        elif k == "state_of_occurrence":
            row[k] = v if v else None
        elif k == "outside_us_country":
            row[k] = v if v else None
        else:
            row[k] = v if v else None

    # ── NOT NULL defaults (live table is stricter than migration 002 spec) ────
    if row.get("number_of_kids") is None:
        row["number_of_kids"] = 0
    else:
        row["number_of_kids"] = min(row["number_of_kids"], MAX_KIDS)
    if not row.get("system_affected"):
        row["system_affected"] = "Not specified"
    if not row.get("time_in_system"):
        row["time_in_system"] = "Not specified"
    if not row.get("custody_status"):
        row["custody_status"] = "Not specified"
    if not row.get("legal_rep_history"):
        row["legal_rep_history"] = "Not specified"
    if not row.get("allegation_type"):
        row["allegation_type"] = "Not specified"
    if not row.get("conflict_of_interest_awareness"):
        row["conflict_of_interest_awareness"] = "Not specified"
    if not row.get("federal_funding_influence"):
        row["federal_funding_influence"] = "Not specified"

    # Hard validations (schema NOT NULL)
    if not row.get("first_name") and not row.get("last_name"):
        return None, "missing_first_and_last_name"
    if not row.get("email"):
        return None, "missing_email"
    if not row.get("impact_quote"):
        return None, "missing_impact_quote"
    if not row.get("permission_to_share"):
        return None, "missing_permission_to_share"
    if not row.get("case_county"):
        return None, "missing_case_county"

    # Schema constraint: exactly one of state_of_occurrence / outside_us_country
    state   = row.get("state_of_occurrence")
    outside = row.get("outside_us_country")
    if state and outside:
        # Both set — prefer state if it looks like a US state code
        row["outside_us_country"] = None
    elif not state and not outside:
        return None, "missing_location_both_null"

    # Always set approved = false
    row["approved"] = False

    return row, None


# ── Load CSV ──────────────────────────────────────────────────────────────────

def load_csv():
    rows = []
    with open(IMPORT_CSV, newline="", encoding="utf-8") as f:
        for raw in csv.DictReader(f):
            rows.append(raw)
    return rows


# ── Batch insert ──────────────────────────────────────────────────────────────

def chunked(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def run_import(live=False):
    load_env()

    try:
        from supabase import create_client
    except ImportError:
        print("ERROR: supabase package not installed. Run: pip install supabase", file=sys.stderr)
        sys.exit(1)

    url  = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set", file=sys.stderr)
        sys.exit(1)

    client = create_client(url, key)

    raw_rows = load_csv()
    print(f"Loaded {len(raw_rows)} rows from {IMPORT_CSV.name}")

    # Coerce
    valid_rows  = []
    coerce_errors = []
    for raw in raw_rows:
        row, err = coerce_row(raw)
        if err:
            coerce_errors.append({"_reason": err, **raw})
        else:
            valid_rows.append(row)

    print(f"After coercion: {len(valid_rows)} valid, {len(coerce_errors)} rejected")
    if coerce_errors:
        print(f"  Rejected rows will be logged to {ERROR_LOG.name}")

    if not live:
        print()
        print("=" * 62)
        print("  DRY RUN — no data will be written to Supabase")
        print("=" * 62)
        print(f"  Would insert: {len(valid_rows)} rows in "
              f"{-(-len(valid_rows) // BATCH_SIZE)} batches of ≤{BATCH_SIZE}")
        print()
        print("  Sample (first row that would be inserted):")
        if valid_rows:
            sample = valid_rows[0]
            for k, v in sample.items():
                if v is not None and v != "" and v != []:
                    print(f"    {k}: {repr(str(v)[:80])}")
        print()
        print("  To run the live import:")
        print("    python3 scripts/load_survey_history.py --live")
        return

    # ── Skip rows whose email is already in the DB (safe re-run) ─────────────
    print("Checking for already-inserted emails in Supabase...")
    existing_emails = set()
    page_size = 1000
    offset = 0
    while True:
        res = (
            client.table(TABLE)
            .select("email")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not res.data:
            break
        for r in res.data:
            if r.get("email"):
                existing_emails.add(r["email"].strip().lower())
        if len(res.data) < page_size:
            break
        offset += page_size

    before = len(valid_rows)
    valid_rows = [r for r in valid_rows if (r.get("email") or "").strip().lower() not in existing_emails]
    skipped_existing = before - len(valid_rows)
    if skipped_existing:
        print(f"  Skipped {skipped_existing} rows already in Supabase (safe re-run)")
    print(f"  Rows to insert: {len(valid_rows)}")

    if not valid_rows:
        print("\nAll rows already inserted. Nothing to do.")
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
            result = (
                client.table(TABLE)
                .insert(batch)
                .execute()
            )
            n = len(result.data) if result.data else len(batch)
            inserted_total += n
            print(f"  Batch {i:>3}: inserted {n} rows  (running total: {inserted_total})")
        except Exception as e:
            err_msg = str(e)
            print(f"  Batch {i:>3}: ERROR — {err_msg[:120]}")
            for row in batch:
                batch_errors.append({"_reason": f"batch_insert_error: {err_msg[:200]}", **row})

    elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()

    # Write error log if any
    if coerce_errors or batch_errors:
        all_errors = coerce_errors + batch_errors
        error_cols = list(all_errors[0].keys())
        with open(ERROR_LOG, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=error_cols, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(all_errors)
        print(f"\n  {len(all_errors)} error row(s) logged → {ERROR_LOG}")

    print()
    print("=" * 62)
    print(f"  IMPORT COMPLETE")
    print(f"  Inserted:  {inserted_total} rows")
    print(f"  Errors:    {len(batch_errors)} rows")
    print(f"  Elapsed:   {elapsed:.1f}s")
    print("=" * 62)
    print()
    print("To verify the count in Supabase:")
    print("  python3 scripts/load_survey_history.py --verify")


# ── Verify ────────────────────────────────────────────────────────────────────

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

    # count() with head=True returns the count in the response
    result = (
        client.table(TABLE)
        .select("*", count="exact", head=True)
        .execute()
    )
    total = result.count

    # Also check not-approved (should equal imported count if DB was empty before)
    unapproved = (
        client.table(TABLE)
        .select("*", count="exact", head=True)
        .eq("approved", False)
        .execute()
    ).count

    print()
    print(f"survey_submissions row count:          {total}")
    print(f"  approved=false (historical import):  {unapproved}")
    print(f"  approved=true  (manually approved):  {(total or 0) - (unapproved or 0)}")
    print()


# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load historical survey submissions into Supabase")
    group  = parser.add_mutually_exclusive_group()
    group.add_argument("--live",   action="store_true", help="Execute the real insert (default: dry run)")
    group.add_argument("--verify", action="store_true", help="Check row count in Supabase, no insert")
    args = parser.parse_args()

    if args.verify:
        run_verify()
    else:
        run_import(live=args.live)
