# Report Kit source map

The Report Kit at `/tools/fraud-kit` uses a private, non-deployable source archive at `private-docs/shawn-report-kit-sources/`. The directory is intentionally gitignored. It contains the August 10 Google Drive snapshot, source files found only on Meghann's computer, and the Episode 5-7 editorial packages used to update the curriculum.

## Coverage rules

- `private-docs/shawn-report-kit-sources/drive-snapshot/`: the complete 63-file local snapshot of the linked Google Drive folder, excluding `.DS_Store`.
- `private-docs/shawn-report-kit-sources/computer-sources/`: the 10 source files present in the existing Shawn Report project but absent from that Drive snapshot.
- `private-docs/shawn-report-kit-sources/editorial-synthesis/`: Episode 5, 6, and 7 packages plus the maintained Shawn context file.
- `manifest.json` and `manifest.md`: file sizes, SHA-256 hashes, privacy labels, and deploy flags.

Regenerate the private manifest with `npm run manifest:report-kit-sources`. Run the focused safety checks with `npm run test:report-kit`.

Archive presence does not verify a claim, approve publication, or make a file safe to expose. The Survey Info folder contains restricted family or registry material and must never be sent to a public AI service, copied into `public/`, or included in a deployable bundle.

## Curriculum mapping

| Report Kit lesson | Primary teaching incorporated | Guardrail |
|---|---|---|
| Claim ladder | Separate a question, report, discrepancy, allegation, charge, plea, verdict, and finding | Never upgrade source status |
| Facts before labels | Dates, actions, records, and contradictions before legal conclusions | Educational issue-spotting only |
| Portal and invoice map | Preserve portal exports, metadata, invoices, and the underlying service or order | A wire or portal alone does not establish fraud |
| Money and jurisdiction map | Route by the program, fund, mail, wire, or agency actually involved | Official current routing pages only |
| Records and chain of custody | Preserve originals, hashes, exports, request logs, gaps, and contradictions | Do not alter originals |
| Filing packet | Produce a chronology, people index, evidence index, money map, issue references, route list, and submission log | No auto-generated criminal counts or guilt declarations |
| Recent public examples | Moreiko, Celebrezze, and Dugan source-status distinctions | Charge, plea, verdict, acquittal, sentence, and appeal remain distinct |
| Connecticut segment | Withheld | Episode 7 transcript was incomplete and the referenced source letter was not present in the archive |

## Implementation surfaces

- `lib/report-kit-content.ts`: written lessons, educational issue references, official routes, privacy language.
- `lib/report-kit-packet.ts`: private draft model, validation, and source-labeled exports.
- `app/(swm)/tools/fraud-kit/ReportKitWorkspace.tsx`: authenticated learning and guided-build interface.
- `lib/complaint-routing/fraudDoorConfig.ts`: current routes shared by the free Fraud Documentation Packet.

Review the official destination immediately before filing. The tool organizes a reporter's own information; it does not file for them, decide that a crime occurred, promise an investigation, or create an attorney-client relationship.
