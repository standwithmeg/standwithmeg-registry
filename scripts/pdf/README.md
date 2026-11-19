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
public actor manifests and resolves approved pictures only within the same
reviewed identity and state. A current published cover can be reused when its
visible count, title, and recorded portrait hash match the fresh report source.
A shared deployment timestamp alone cannot establish that an old JPEG contains
the latest portrait.

Every actor receives a complete slide with their name, title, and current
submission count. Missing, outdated, or unverifiable covers are rebuilt through
`actor_cover_renderer.py` using the website's actual `render_spotlight.py` cover
component and styles. The approved portrait remains inside that slide; a bare
portrait is never substituted. Without an approved photo, the actor receives a
named slide with a photo-unavailable label. Browser checks reject unloaded fonts,
invalid images, and cover text overflow. Network errors fail visibly.

Artwork bytes, current portrait hashes, and the shared cover renderer version
participate in the PDF cache. Full family comments remain alongside the slide
and retain their existing moderation and sharing-permission checks.

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
