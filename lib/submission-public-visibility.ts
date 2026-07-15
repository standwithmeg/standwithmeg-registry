const PUBLIC_SHARE_PERMISSIONS = new Set(["public", "anonymous", "first_name"]);

export type SubmissionVisibilityFields = {
  approved?: boolean | null;
  permission_to_share?: string | null;
} | null | undefined;

export function isPublicShareableSubmission(submission: SubmissionVisibilityFields): boolean {
  return submission?.approved === true
    && PUBLIC_SHARE_PERMISSIONS.has((submission.permission_to_share ?? "").trim());
}

export function isCountableSubmission(submission: SubmissionVisibilityFields): boolean {
  // Meg's rule (2026-07-15, mirrors the rebuild's lib/submission-public-visibility.ts):
  // every consent level counts toward an actor's family total — `approved`
  // gates QUOTE display only (isPublicShareableSubmission above).
  if (!submission) return false;
  const perm = (submission.permission_to_share ?? "").trim();
  return perm === "data_only" || PUBLIC_SHARE_PERMISSIONS.has(perm);
}
