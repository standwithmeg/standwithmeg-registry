#!/usr/bin/env python3
"""
Preserve the 411 older-only legacy rows that were intentionally excluded
from the clean import because they are missing:
  - impact_quote
  - permission_to_share
  - submission_date

These rows originate exclusively from the older (SWM_MASTER_LATEST) file
and have no matching record in the newer (GHL/LeadConnector) export.
They are NOT imported into survey_submissions.

Output: outputs/import/legacy_excluded_rows.csv (original columns, unmodified)
        outputs/import/legacy_exclusion_notice.txt

Run: python3 scripts/export_legacy_rows.py
"""

import csv
from datetime import datetime, timezone
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR  = PROJECT_DIR / "outputs" / "import"
NEWER_CSV   = Path.home() / "Downloads" / "31fd0ecd-bc89-4764-847e-33c21f133c3f.csv"
OLDER_CSV   = Path.home() / "Downloads" / "SWM_MASTER_LATEST.xlsx - Sheet1.csv"


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Build set of all emails present in the newer file
    newer_emails = set()
    with open(NEWER_CSV, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            e = (row.get("Email") or "").strip().lower()
            if e:
                newer_emails.add(e)

    # Pull every row from the older file whose email is NOT in the newer file
    legacy_rows = []
    fieldnames  = None
    with open(OLDER_CSV, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            e = (row.get("Email") or "").strip().lower()
            if e not in newer_emails:
                legacy_rows.append(dict(row))

    # Write raw CSV — original column names, no transformation
    out_csv = OUTPUT_DIR / "legacy_excluded_rows.csv"
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(legacy_rows)

    # Write human-readable notice
    notice_lines = [
        "=" * 62,
        "  LEGACY EXCLUSION NOTICE",
        f"  Generated: {datetime.now(timezone.utc).isoformat()}",
        "=" * 62,
        "",
        "WHY THESE ROWS WERE EXCLUDED",
        "",
        "  These records originate from the older export file:",
        f"  {OLDER_CSV.name}",
        "",
        "  They have NO matching record in the current GHL/LeadConnector",
        "  export (the authoritative survey platform).",
        "",
        "  All of these rows are missing ALL THREE of the following",
        "  fields, which are NOT NULL in the survey_submissions schema:",
        "",
        "    • impact_quote         — required by schema, NOT NULL",
        "    • permission_to_share  — required by schema, NOT NULL",
        "    • submission_date      — missing / blank in source",
        "",
        "  Because impact_quote and permission_to_share cannot be",
        "  fabricated without falsifying the respondent's submission,",
        "  these rows were intentionally excluded from the clean import.",
        "",
        "COUNTS",
        f"  Total legacy-excluded rows:  {len(legacy_rows)}",
        "",
        "WHAT'S IN THE FILE",
        "  legacy_excluded_rows.csv contains the original raw columns",
        "  from the older source file, unmodified. Each row represents",
        "  a real person who submitted to an earlier form version that",
        "  did not capture the quote and permission fields.",
        "",
        "FUTURE OPTIONS",
        "  1. Email outreach — re-invite these respondents to re-submit",
        "     via the live form at standwithmeg.com.",
        "  2. Separate legacy table — create a legacy_submissions table",
        "     without the NOT NULL constraints to preserve the data.",
        "  3. Manual enrichment — staff reviews each row and fills in",
        "     the missing fields with appropriate placeholder values.",
        "",
        "FILES",
        f"  Raw data: outputs/import/legacy_excluded_rows.csv",
        f"  This notice: outputs/import/legacy_exclusion_notice.txt",
        "=" * 62,
    ]

    notice_path = OUTPUT_DIR / "legacy_exclusion_notice.txt"
    with open(notice_path, "w", encoding="utf-8") as f:
        f.write("\n".join(notice_lines) + "\n")

    print("\n".join(notice_lines))
    print()
    print(f"Saved {len(legacy_rows)} rows → {out_csv}")
    print(f"Notice  → {notice_path}")


if __name__ == "__main__":
    main()
