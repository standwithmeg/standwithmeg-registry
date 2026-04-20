#!/usr/bin/env python3
"""
Historical survey import script — build & dry-run only.
Does NOT write to Supabase.

Sources:
  - Newer (base):    GHL/LeadConnector CSV export (UUID filename)
  - Older (backfill): SWM master xlsx or CSV

Outputs (written to outputs/import/ inside the project):
  - import_ready.csv          — normalized, deduped, ready for Supabase insert
  - duplicates_report.csv     — rows skipped because a newer-file record owns that email
  - quarantined_rows.csv      — rows with data problems, need manual review
  - summary_report.txt        — counts + notes

Run:
  python3 scripts/import_survey_history.py \\
    --newer ~/Downloads/ \\
    --older "/Volumes/2023 Big 18/standwithmeg/outputs/SWM_MASTER_LATEST.xlsx"

  --newer: path to GHL CSV file, OR a directory to auto-detect the newest GHL UUID CSV
  --older: path to master xlsx OR csv file
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR  = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR  = PROJECT_DIR / "outputs" / "import"

# GHL export filenames are UUID v4 strings — 8-4-4-4-12 hex pattern
_UUID_CSV_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$",
    re.IGNORECASE,
)

DEFAULT_NEWER = Path.home() / "Downloads"
DEFAULT_OLDER = Path("/Volumes/2023 Big 18/standwithmeg/outputs/SWM_MASTER_LATEST.xlsx")


def resolve_newer(path_or_dir: str) -> Path:
    """
    Accept either a direct file path or a directory.
    If a directory, return the most-recently-modified UUID CSV inside it.
    """
    p = Path(path_or_dir).expanduser().resolve()
    if p.is_file():
        return p
    if p.is_dir():
        candidates = [f for f in p.iterdir() if _UUID_CSV_RE.match(f.name)]
        if not candidates:
            print(f"ERROR: No GHL UUID CSV found in {p}", file=sys.stderr)
            sys.exit(1)
        return max(candidates, key=lambda f: f.stat().st_mtime)
    print(f"ERROR: --newer path does not exist: {p}", file=sys.stderr)
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Normalize and dedupe survey sources into import_ready.csv"
    )
    parser.add_argument(
        "--newer",
        default=str(DEFAULT_NEWER),
        help=(
            "GHL/LeadConnector CSV file, or a directory to auto-detect "
            "the newest UUID CSV inside it. "
            f"Default: {DEFAULT_NEWER}"
        ),
    )
    parser.add_argument(
        "--older",
        default=str(DEFAULT_OLDER),
        help=(
            "Master xlsx or csv file (backfill source). "
            f"Default: {DEFAULT_OLDER}"
        ),
    )
    return parser.parse_args()


# ── Target schema columns (survey_submissions) ────────────────────────────────

SCHEMA_COLS = [
    "first_name",
    "last_name",
    "email",
    "state_of_occurrence",
    "outside_us_country",
    "case_county",
    "case_status",
    "number_of_kids",
    "system_affected",
    "time_in_system",
    "custody_status",
    "is_pro_se",
    "legal_rep_history",
    "allegation_type",
    "allegation_other_detail",
    "allegation_root_cause",
    "due_process_checklist",  # stored as JSON array string for CSV; importer will convert
    "other_allegation_details",
    "conflict_of_interest_awareness",
    "conflict_description",
    "federal_funding_influence",
    "months_lost_parenting_time",
    "lost_milestones_description",
    "attorney_fees",
    "gal_fees",
    "therapy_eval_fees",
    "reunification_fees",
    "other_court_actors_fees",
    "lost_wages",
    "asset_liquidation_loss",
    "impact_quote",
    "permission_to_share",
    "created_at",
    "_source",          # metadata: "newer" or "older"
    "_raw_email",       # original email before normalizing (for audit)
]

# ── Normalization helpers ─────────────────────────────────────────────────────

# Two-letter US state codes (includes DC + territories)
US_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
    "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
    "TX","UT","VT","VA","WA","WV","WI","WY","DC","PR","VI","GU","AS","MP",
}

# Clearly non-US 2-letter codes we might see
NON_US_COUNTRY_CODES = {
    "GB","GG","BW","UM","CA","MX","AU","NZ","IE","ZA","IN","PH","JM",
    "BS","TC","KY","BB","TT","AG","VG","AW","CW","SX","BZ","HN","GT",
    "SV","NI","CR","PA","CO","EC","PE","BR","CL","AR","UY","VE","BO",
}


def clean_str(val):
    if val is None:
        return ""
    return val.strip()


def normalize_email(val):
    return clean_str(val).lower()


def is_valid_email(val):
    """Very loose check — must contain @ and a dot after @."""
    v = normalize_email(val)
    if not v:
        return False
    if "@" not in v:
        return False
    parts = v.split("@")
    if len(parts) != 2:
        return False
    domain = parts[1]
    if "." not in domain:
        return False
    return True


def parse_date(val):
    """
    Parse "Feb 10th 2026, 12:38 pm" → ISO-8601 UTC string.
    Returns None if unparseable.
    """
    if not val or not val.strip():
        return None
    v = val.strip()
    # Remove ordinal suffixes: 1st→1, 2nd→2, 3rd→3, 4th→4, etc.
    v = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", v, flags=re.IGNORECASE)
    # Try a few format patterns
    for fmt in (
        "%b %d %Y, %I:%M %p",
        "%B %d %Y, %I:%M %p",
        "%b %d %Y, %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            dt = datetime.strptime(v, fmt)
            return dt.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return None


def cast_int(val):
    """Cast to int; return None on failure."""
    if val is None:
        return None
    v = re.sub(r"[^\d]", "", str(val).strip())
    if not v:
        return None
    try:
        return int(v)
    except ValueError:
        return None


def cast_numeric(val):
    """Cast to float; return None on failure."""
    if val is None:
        return None
    v = re.sub(r"[^\d.]", "", str(val).strip())
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def normalize_case_status(val, source):
    """
    Map older-file case status values to the newer wording.
    Newer file values are returned as-is.
    """
    if source == "newer":
        return clean_str(val)
    mapping = {
        'currently involved / "stuck"': "I am currently stuck in an active case (prolonged, delayed, or no resolution)",
        "i was a child of family court or cps": "I experienced this as a child in Family Court or CPS",
    }
    v = clean_str(val)
    return mapping.get(v.lower(), v)


def normalize_due_process(val):
    """
    Split the checklist string into a JSON array for CSV output.
    Input looks like: '"Perjury/False testimony, No Due Process, ..."'
    """
    v = clean_str(val).strip('"')
    if not v:
        return "[]"
    # Split on comma but respect the content — items can have commas only at top level
    # The raw format uses '", "' as delimiter in some rows, others use just ","
    items = [i.strip().strip('"').strip("'") for i in v.split(",") if i.strip()]
    # Remove empty
    items = [i for i in items if i]
    return json.dumps(items)


def normalize_location(state_val, outside_val, source):
    """
    Returns (state_of_occurrence, outside_us_country).
    Exactly one must be non-empty.
    """
    state = clean_str(state_val).upper()
    outside = clean_str(outside_val).upper()

    if source == "newer":
        # Newer file: outside field has clean values like US, GB, GG, BW, etc.
        if outside and outside not in ("US", ""):
            return (None, outside)
        if state in US_STATES:
            return (state, None)
        if state:
            return (state, None)  # keep as-is, reviewer can correct
        return (None, None)

    # Older file: OUTSITE column is corrupted — only trust explicit non-US country codes
    if outside in NON_US_COUNTRY_CODES and outside not in US_STATES:
        return (None, outside)
    if state in US_STATES:
        return (state, None)
    if state:
        return (state, None)
    return (None, None)


# ── CSV loaders ───────────────────────────────────────────────────────────────

def load_newer(path):
    """Load the newer (base) CSV and normalize each row."""
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            rows.append(("newer", raw))
    return rows


def load_older(path):
    """Load the older (backfill) file — supports .xlsx and .csv."""
    p = Path(path)
    rows = []
    if p.suffix.lower() == ".xlsx":
        try:
            import openpyxl
        except ImportError:
            print("ERROR: openpyxl not installed. Run: pip install openpyxl", file=sys.stderr)
            sys.exit(1)
        wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
        ws = wb.active
        headers = None
        for row_cells in ws.iter_rows(values_only=True):
            if headers is None:
                headers = [str(c).strip() if c is not None else "" for c in row_cells]
                continue
            raw = {headers[i]: (str(v).strip() if v is not None else "") for i, v in enumerate(row_cells)}
            rows.append(("older", raw))
        wb.close()
    else:
        with open(p, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for raw in reader:
                rows.append(("older", raw))
    return rows


# ── Row transformer ───────────────────────────────────────────────────────────

def transform_row(source, raw):
    """
    Map a raw CSV row dict → normalized schema dict.
    Returns (schema_dict, list_of_warnings).
    """
    warnings = []

    def g(newer_key, older_key):
        key = newer_key if source == "newer" else older_key
        return raw.get(key, "") or ""

    # ── Identity
    first_name = clean_str(g("First Name", "First Name"))
    last_name  = clean_str(g("Last Name", "Last Name"))
    email_raw  = g("Email", "Email")
    email      = normalize_email(email_raw)

    # ── Location
    state_val   = g("State of Occurrence", "State of Occurrence")
    outside_val = g("\xa0Are you outside of the United States?", "OUTSITE OF THE STATES? ")
    state_of_occurrence, outside_us_country = normalize_location(state_val, outside_val, source)

    # ── Case details
    county_raw   = g("\xa0Enter the county where your case took place", "County")
    case_county  = clean_str(county_raw) or "Unknown"

    status_raw   = g("What is your current case status?", "Current Case Status")
    case_status  = normalize_case_status(status_raw, source)

    kids_raw     = g("How many kids do you have?", "How many kids do you have?")
    number_of_kids = cast_int(kids_raw)

    # ── System + legal
    system_affected  = clean_str(g("Which system affected you?", "Which system affected you?"))
    time_in_system   = clean_str(g("How long\xa0 \"in the system\"? ", "How long\xa0 \"in the system\"? "))
    custody_status   = clean_str(g("Current Custody Status", "Current Custody Status"))
    is_pro_se        = clean_str(g("Are you representing yourself (Pro Se)? Click one.", "Are you representing yourself (Pro Se)? Click one."))
    legal_rep_history = clean_str(g("Legal Representation History", "Legal Representation History"))

    # ── Allegations
    allegation_type         = clean_str(g("Primary Nature of Allegations/Intervention", "Primary Nature of Allegations/Intervention"))
    allegation_other_detail = ""  # not in either source
    allegation_root_cause   = clean_str(g("Other -\xa0Due Process & Fraud", "Other -\xa0Due Process & Fraud"))

    # ── Due process
    checklist_raw   = g("Due Process & Fraud Checklist: (Checkboxes - Select all that apply)",
                         "Due Process & Fraud Checklist: (Checkboxes - Select all that apply)")
    due_process_checklist  = normalize_due_process(checklist_raw)
    other_allegation_details = clean_str(g("Other Allegation Details", "Other Allegation Details"))

    # ── Conflict + funding
    conflict_awareness = clean_str(g(
        "Are you aware of any personal, professional, or financial relationships between the Judge, Attorneys, or Evaluators that were not disclosed in your case?",
        "Are you aware of any personal, professional, or financial relationships between the Judge, Attorneys, or Evaluators that were not disclosed in your case?"
    ))
    conflict_description = clean_str(g(
        "If Yes, please briefly describe the nature of the conflict.\xa0",
        "If Yes, please briefly describe the nature of the conflict.\xa0"
    ))
    federal_funding = clean_str(g(
        "Do you believe federal funding (Title IV-E /Adoption bonuses) influenced the direction of your case?",
        "Do you believe federal funding (Title IV-E /Adoption bonuses) influenced the direction of your case?"
    ))

    # ── Stolen time
    months_raw = g("Total Months of Lost Parenting Time (either as a child or parent)",
                   "Total Months of Lost Parenting Time (either as a child or parent)")
    months_lost = cast_int(months_raw)
    lost_milestones = clean_str(g(
        "Description of Lost Milestones (either as a child or parent)",
        "Description of Lost Milestones (either as a child or parent)"
    ))

    # ── Financials
    attorney_fees           = cast_numeric(g("Attorney Fees", "Attorney Fees"))
    gal_fees                = cast_numeric(g("GAL / Child Representative Fees", "GAL / Child Representative Fees"))
    therapy_eval_fees       = cast_numeric(g("Therapy/Evaluations Fees", "Therapy/Evaluations Fees"))
    reunification_fees      = cast_numeric(g("Reunification Service Fees", "Reunification Service Fees"))
    other_court_actors_fees = cast_numeric(g("Other Court Actors Fees", "Other Court Actors Fees"))
    lost_wages              = cast_numeric(g("Lost Wages", "Lost Wages"))
    asset_liquidation_loss  = cast_numeric(g("Asset Liquidation & Property Loss", "Asset Liquidation & Property Loss"))

    # ── Story + meta
    impact_quote      = clean_str(g(
        "In one quote (1-2 sentences), describe what this system has done to you and your family.",
        "In one quote (1-2 sentences), describe what this system has done to you and your family."
    ))
    permission_to_share = clean_str(g("Permission to Share", "Permission to Share"))

    # ── Timestamp
    date_raw   = g("Submission Date", "Submission Date")
    created_at = parse_date(date_raw)

    # ── Warnings
    if not is_valid_email(email):
        warnings.append(f"invalid_email: {repr(email_raw)}")
    if not first_name and not last_name:
        warnings.append("missing_name")
    if not impact_quote:
        warnings.append("missing_impact_quote")
    if not permission_to_share:
        warnings.append("missing_permission_to_share")
    if state_of_occurrence is None and outside_us_country is None:
        warnings.append("missing_location")
    if created_at is None:
        warnings.append(f"unparseable_date: {repr(date_raw)}")

    row = {
        "first_name":                    first_name,
        "last_name":                     last_name,
        "email":                         email,
        "state_of_occurrence":           state_of_occurrence or "",
        "outside_us_country":            outside_us_country or "",
        "case_county":                   case_county,
        "case_status":                   case_status,
        "number_of_kids":                "" if number_of_kids is None else number_of_kids,
        "system_affected":               system_affected,
        "time_in_system":                time_in_system,
        "custody_status":                custody_status,
        "is_pro_se":                     is_pro_se,
        "legal_rep_history":             legal_rep_history,
        "allegation_type":               allegation_type,
        "allegation_other_detail":       allegation_other_detail,
        "allegation_root_cause":         allegation_root_cause,
        "due_process_checklist":         due_process_checklist,
        "other_allegation_details":      other_allegation_details,
        "conflict_of_interest_awareness": conflict_awareness,
        "conflict_description":          conflict_description,
        "federal_funding_influence":     federal_funding,
        "months_lost_parenting_time":    "" if months_lost is None else months_lost,
        "lost_milestones_description":   lost_milestones,
        "attorney_fees":                 "" if attorney_fees is None else attorney_fees,
        "gal_fees":                      "" if gal_fees is None else gal_fees,
        "therapy_eval_fees":             "" if therapy_eval_fees is None else therapy_eval_fees,
        "reunification_fees":            "" if reunification_fees is None else reunification_fees,
        "other_court_actors_fees":       "" if other_court_actors_fees is None else other_court_actors_fees,
        "lost_wages":                    "" if lost_wages is None else lost_wages,
        "asset_liquidation_loss":        "" if asset_liquidation_loss is None else asset_liquidation_loss,
        "impact_quote":                  impact_quote,
        "permission_to_share":           permission_to_share,
        "created_at":                    created_at or "",
        "_source":                       source,
        "_raw_email":                    email_raw,
    }

    return row, warnings


# ── Required fields for Supabase NOT NULL constraints ────────────────────────

REQUIRED_FIELDS = {
    "impact_quote":       "missing_impact_quote",
    "permission_to_share":"missing_permission_to_share",
}


def must_quarantine(warnings):
    """
    A row must be quarantined (not imported) if it would violate NOT NULL constraints
    or has an invalid email (can't dedupe).
    """
    blocking = {"invalid_email", "missing_impact_quote", "missing_permission_to_share"}
    for w in warnings:
        for b in blocking:
            if w.startswith(b):
                return True
    return False


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    newer_path = resolve_newer(args.newer)
    older_path = Path(args.older).expanduser().resolve()
    if not older_path.exists():
        print(f"ERROR: --older path does not exist: {older_path}", file=sys.stderr)
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading source files...")
    print(f"  Newer: {newer_path}")
    print(f"  Older: {older_path}")
    newer_raw = load_newer(newer_path)
    older_raw = load_older(older_path)
    print(f"  Newer file: {len(newer_raw)} rows")
    print(f"  Older file: {len(older_raw)} rows")

    # ── Transform all rows ────────────────────────────────────────────────────
    print("Transforming rows...")

    quarantined = []       # (source, original_row, normalized_row, warnings)
    newer_clean = []       # normalized rows from newer file (valid)
    older_clean = []       # normalized rows from older file (valid)

    for source, raw in newer_raw:
        row, warnings = transform_row(source, raw)
        if must_quarantine(warnings):
            quarantined.append({"_quarantine_reason": "; ".join(warnings), **row})
        else:
            newer_clean.append((warnings, row))

    for source, raw in older_raw:
        row, warnings = transform_row(source, raw)
        if must_quarantine(warnings):
            quarantined.append({"_quarantine_reason": "; ".join(warnings), **row})
        else:
            older_clean.append((warnings, row))

    print(f"  Newer rows after transform: {len(newer_clean)} clean, {sum(1 for q in quarantined if q['_source']=='newer')} quarantined")
    print(f"  Older rows after transform: {len(older_clean)} clean, {sum(1 for q in quarantined if q['_source']=='older')} quarantined")

    # ── Dedupe newer file: one row per email, keep latest date ───────────────
    print("Deduping newer file...")

    newer_by_email = defaultdict(list)
    for warnings, row in newer_clean:
        newer_by_email[row["email"]].append((warnings, row))

    newer_base = {}   # email → best row
    newer_dupes = []  # rows that lost the dedupe within newer

    for email, entries in newer_by_email.items():
        # Sort by created_at descending; rows with no date go last
        def sort_key(e):
            ts = e[1]["created_at"]
            return ts if ts else ""
        entries.sort(key=sort_key, reverse=True)
        winner_warnings, winner_row = entries[0]
        newer_base[email] = (winner_warnings, winner_row)
        for w, r in entries[1:]:
            newer_dupes.append({
                "_dupe_reason": f"newer_file_internal_dupe; kept={winner_row['created_at'] or 'no-date'}",
                **r
            })

    print(f"  Newer base (unique emails): {len(newer_base)}")
    print(f"  Newer internal dupes: {len(newer_dupes)}")

    # ── Dedupe older file: one row per email, keep latest date ───────────────
    print("Deduping older file...")

    older_by_email = defaultdict(list)
    # Also handle rows with empty email — group them by a synthetic key
    anon_counter = 0
    for warnings, row in older_clean:
        key = row["email"]
        if not key:
            anon_counter += 1
            key = f"__anon_{anon_counter}__"
            row["email"] = key  # will be blanked out later
        older_by_email[key].append((warnings, row))

    older_deduped = {}   # email → best row
    older_dupes = []

    for email, entries in older_by_email.items():
        def sort_key(e):
            ts = e[1]["created_at"]
            return ts if ts else ""
        entries.sort(key=sort_key, reverse=True)
        winner_warnings, winner_row = entries[0]
        older_deduped[email] = (winner_warnings, winner_row)
        for w, r in entries[1:]:
            older_dupes.append({
                "_dupe_reason": f"older_file_internal_dupe; kept={winner_row['created_at'] or 'no-date'}",
                **r
            })

    # ── Backfill: older rows not in newer base ────────────────────────────────
    print("Computing backfill...")

    backfill = []
    cross_dupes = []  # older rows skipped because newer has that email

    for email, (warnings, row) in older_deduped.items():
        if email.startswith("__anon_"):
            # Restore blank email for anon rows — they're always backfill candidates
            row["email"] = ""
            backfill.append((warnings, row))
            continue
        if email in newer_base:
            cross_dupes.append({
                "_dupe_reason": f"email_in_newer_file; newer_date={newer_base[email][1]['created_at'] or 'no-date'}",
                **row
            })
        else:
            backfill.append((warnings, row))

    print(f"  Backfill rows added from older: {len(backfill)}")
    print(f"  Older rows skipped (in newer): {len(cross_dupes)}")

    # ── Final import set ──────────────────────────────────────────────────────
    final_import = []

    for _warnings, row in newer_base.values():
        final_import.append(row)

    for _warnings, row in backfill:
        final_import.append(row)

    # ── All duplicates (for report) ───────────────────────────────────────────
    all_dupes = newer_dupes + older_dupes + cross_dupes

    # ── Write outputs ─────────────────────────────────────────────────────────
    print("Writing output files...")

    import_path      = OUTPUT_DIR / "import_ready.csv"
    dupes_path       = OUTPUT_DIR / "duplicates_report.csv"
    quarantine_path  = OUTPUT_DIR / "quarantined_rows.csv"
    summary_path     = OUTPUT_DIR / "summary_report.txt"

    # import_ready.csv
    with open(import_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=SCHEMA_COLS)
        writer.writeheader()
        writer.writerows(final_import)

    # duplicates_report.csv
    dupe_cols = ["_dupe_reason"] + SCHEMA_COLS
    with open(dupes_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=dupe_cols, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(all_dupes)

    # quarantined_rows.csv
    q_cols = ["_quarantine_reason"] + SCHEMA_COLS
    with open(quarantine_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=q_cols, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(quarantined)

    # summary_report.txt
    newer_quarantined = sum(1 for q in quarantined if q["_source"] == "newer")
    older_quarantined = sum(1 for q in quarantined if q["_source"] == "older")

    summary_lines = [
        "=" * 62,
        "  SURVEY IMPORT SUMMARY REPORT",
        f"  Generated: {datetime.now(timezone.utc).isoformat()}",
        "=" * 62,
        "",
        "SOURCE FILES",
        f"  Newer (base):         {newer_path.name}",
        f"  Older (backfill):     {older_path.name}",
        "",
        "INPUT COUNTS",
        f"  Newer file total rows:         {len(newer_raw):>6}",
        f"  Older file total rows:         {len(older_raw):>6}",
        "",
        "QUARANTINED (excluded from import)",
        f"  From newer file:               {newer_quarantined:>6}",
        f"  From older file:               {older_quarantined:>6}",
        f"  Total quarantined:             {len(quarantined):>6}",
        f"  → See: quarantined_rows.csv",
        "",
        "DUPLICATES SKIPPED",
        f"  Newer internal dupes:          {len(newer_dupes):>6}",
        f"  Older internal dupes:          {len(older_dupes):>6}",
        f"  Older rows already in newer:   {len(cross_dupes):>6}",
        f"  Total duplicates skipped:      {len(all_dupes):>6}",
        f"  → See: duplicates_report.csv",
        "",
        "FINAL IMPORT SET",
        f"  Base rows (from newer):        {len(newer_base):>6}",
        f"  Backfill rows (from older):    {len(backfill):>6}",
        f"  ─────────────────────────────────────",
        f"  TOTAL IMPORT-READY ROWS:       {len(final_import):>6}",
        f"  → See: import_ready.csv",
        "",
        "NOTES",
        "  - All imported rows will have approved=false by default.",
        "  - created_at is set from Submission Date where parseable;",
        "    rows with unparseable dates will be imported with empty",
        "    created_at (Supabase will use NOW() on insert).",
        "  - due_process_checklist is exported as a JSON array string;",
        "    the Supabase loader must cast this to text[].",
        "  - Anon rows (blank email) from older file are included in",
        "    backfill if they pass required-field validation.",
        "  - state_of_occurrence and outside_us_country are mutually",
        "    exclusive; the location_xor constraint will enforce this",
        "    on insert. Rows with both empty will fail insert —",
        "    review missing_location entries in quarantine file.",
        "=" * 62,
    ]

    with open(summary_path, "w", encoding="utf-8") as f:
        f.write("\n".join(summary_lines) + "\n")

    # ── Print summary to terminal ─────────────────────────────────────────────
    print()
    print("\n".join(summary_lines))
    print()
    print("Output files:")
    print(f"  {import_path}")
    print(f"  {dupes_path}")
    print(f"  {quarantine_path}")
    print(f"  {summary_path}")


if __name__ == "__main__":
    main()
