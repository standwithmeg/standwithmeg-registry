/**
 * Read accepted Blotato submissions without importing the newer posting UI.
 * The registry staging cron must not replace a queue row while one of its
 * platform submissions is still publishing or scheduled: Blotato may not
 * return the public URL until days later, and replacing review_notes would
 * erase the only durable submission id.
 */
export function inFlightSocialPlatforms(reviewNotes: string | null | undefined): string[] {
  if (!reviewNotes) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(reviewNotes);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { platforms?: unknown }).platforms)) {
    return [];
  }

  const platforms = new Set<string>();
  for (const value of (parsed as { platforms: unknown[] }).platforms) {
    if (!value || typeof value !== "object") continue;
    const link = value as { platform?: unknown; submissionId?: unknown; url?: unknown; error?: unknown };
    if (typeof link.submissionId !== "string" || !link.submissionId.trim() || link.url || link.error) continue;
    const platform = typeof link.platform === "string" ? link.platform.trim().toLowerCase() : "";
    if (platform) platforms.add(platform === "twitter" ? "x" : platform);
  }
  return [...platforms];
}
