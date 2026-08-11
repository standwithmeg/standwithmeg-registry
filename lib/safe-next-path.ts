/**
 * Allow only same-origin relative paths for post-login redirects.
 * Blocks protocol-relative URLs, scheme injection, and control characters.
 */
export function safeInternalNextPath(
  raw: string | null | undefined,
  fallback = "/report",
): string {
  if (raw == null) return fallback;
  const path = String(raw).trim();
  if (!path) return fallback;
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//")) return fallback;
  if (path.includes("://")) return fallback;
  if (path.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback;
  // Reject encoded protocol-relative tricks such as /%2f%2fevil.com
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith("//") || decoded.includes("://") || decoded.includes("\\")) {
      return fallback;
    }
  } catch {
    return fallback;
  }
  return path;
}
