# State PDF reports

Reports open with the cover, then three statistics pages, then public court
actors, parent voices, full comments, and methodology. Actor names retain the
three-family public threshold. Reports retain the 30-family location threshold.

The cover includes the location count, registry-wide counted survey total,
and the actual rebuild date in America/Chicago. The registry total uses the
same deduplicated, visibility-filtered source rows as the report, rather than
the raw number of form submissions. An unchanged PDF keeps the registry total
and date from its own rebuild; a new survey elsewhere does not rewrite it.

At each rebuild, `actor_slides.py` reads the current public actor manifest and
downloads `frame-01.jpg` through the site's public asset route. That route
selects the current published version. Existing canonical bucket aliases and
punctuation normalization match identities within the same state. If duplicate
published aliases exist, the newest Last-Modified timestamp wins; counts are
never used to infer freshness. A retired or absent slide can fall back to an
available public portrait. Unmatched actors remain in the report with an
explicit image-unavailable label. Network failures do not silently replace
current artwork with an old local copy.

Artwork is embedded in the PDF and its SHA-256 is included in the state input
hash. Embedded slide counts are the slide's own snapshot, as labeled beside
the image. The report's surrounding figures come from the fresh survey read.

## Current refresh schedule

`.github/workflows/regenerate-state-pdfs.yml` runs daily at 08:00 UTC
(2 a.m. Central in winter, 3 a.m. in summer). The activity gate checks survey
creation/updates and new court-actor rows. The generator then rebuilds changed
eligible locations and skips unchanged ones. Manual runs support a location
filter and `force=true`. Actor slides have a separate scheduled job.

This is a daily refresh, not a guaranteed rebuild immediately after each form
submission. Legacy threshold-triggered routes are not the newer survey app's
submission pipeline. Image-only changes are picked up on the next PDF run
that passes the activity gate, or a forced manual run.

## Verification

```bash
python -m unittest scripts/pdf/test_state_pdf_release.py scripts/pdf/test_submission_moderation.py scripts/ci/test_should_run_regeneration.py
python scripts/pdf/generate_state_pdf.py --source=supabase --force KS
# Copy the generated KS.pdf into public/state-reports, then update the index.
python scripts/pdf/verify_state_pdf_release.py --state KS
```

Chromium checks image loading and actor/cover overflow before writing a PDF.
The release verifier checks pagination, cover snapshots, section order,
eligible actor names, family-comment coverage, and input hashes before release.
Use the existing environment configuration; do not commit source survey rows
or credentials. Local production exports belong on the mounted production drive.
