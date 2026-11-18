# State PDF reports

Reports open with the cover, then three statistics pages, then public court
actors, parent voices, full comments, and methodology. The slide sits beside
the name and comments. Chromium measures each complete card at Letter page
width and keeps it together whenever it fits; only oversized cards split.
Measured page counts are recorded with the rebuild cache. Actor names retain the
three-family public threshold. Reports retain the 30-family location threshold.
The detailed name-grouping note lives on the methodology page so it does not
push the final actor onto an otherwise unnecessary page. Reporting-profile
charts use compact row spacing while retaining their existing type sizes.

The cover includes the location count, registry-wide counted survey total,
and the actual rebuild date in America/Chicago. The registry total uses the
same deduplicated, visibility-filtered source rows as the report, rather than
the raw number of form submissions. An unchanged PDF keeps the registry total
and date from its own rebuild; a new survey elsewhere does not rewrite it.

At each rebuild, `actor_slides.py` merges the current, bundled, and archive
public actor manifests so a slide manifest's stale null cannot hide an approved
portrait. It downloads `frame-01.jpg` through the site's public asset route. That route
selects the current published version. Existing canonical bucket aliases and
punctuation normalization match identities within the same state. If duplicate
published aliases exist, the newest Last-Modified timestamp wins; counts are
never used to infer freshness. A retired, absent, or placeholder slide uses the
available approved portrait. The render spec must prove that a slide contains
the current photo, using its recorded content hash or asset timestamps. Unknown
evidence uses the approved portrait, preserving the full image without cropping.
Approved photo aliases resolve only within the same matched identity and state.
Slide actor totals must also match the current submission total. An outdated
number uses the approved portrait; without a portrait the stale slide is omitted.
Unmatched actors remain in the report with an
explicit image-unavailable label. Network failures do not silently replace
current artwork with an old local copy.

Artwork is embedded in the PDF and its SHA-256 is included in the state input
hash. Embedded slide counts are the slide's own snapshot, as labeled beside
the image. The report's surrounding figures come from the fresh survey read.

Actor headings count distinct valid survey submissions. Quote approval affects
which words may be published, not whether a consented submission counts.
Hidden/duplicate reviews still exclude records. The publication threshold stays
at three distinct families, even when one family submits more than once.
Name normalization preserves legitimate double letters so reviewed aliases
resolve exactly as in the registry. The existing reviewed Bud Dale KS/TX identity
is combined under Kansas, with original submission locations left unchanged.

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

Chromium checks image loading, actor/cover overflow, and every text range against
the page and footer boundaries before writing a PDF, including charts and quotes.
The release verifier checks pagination, cover snapshots, section order,
eligible actor names, family-comment coverage, and input hashes before release.
Every printed actor submission total is checked against the current source too.
Use the existing environment configuration; do not commit source survey rows
or credentials. Local production exports belong on the mounted production drive.
