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
  if (!submission) return false;
  const perm = (submission.permission_to_share ?? "").trim();
  if (perm === "data_only") return true;
  return submission.approved === true && PUBLIC_SHARE_PERMISSIONS.has(perm);
}
