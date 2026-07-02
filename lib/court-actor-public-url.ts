function publicWebPathname(assetUrl: string | null | undefined): string | null {
  const url = assetUrl?.trim();
  if (!url || !url.startsWith("/") || url.startsWith("//")) return null;
  const pathname = url.split(/[?#]/, 1)[0];
  if (!pathname.startsWith("/court-actors/")) return null;
  if (pathname.includes("/../") || pathname.endsWith("/..")) return null;
  return pathname;
}

export function publicAssetOrigin() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SWM_PUBLIC_API_BASE;
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  return (configured || vercelUrl || "https://my.standwithmeg.com").replace(/\/+$/, "");
}

/** Turn a site-relative court-actor path into an absolute URL for previews and downloads. */
export function resolvePublicAssetUrl(assetUrl: string): string {
  const url = assetUrl.trim();
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  const origin = publicAssetOrigin();
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function publicCourtActorAssetUrl(assetUrl: string | null | undefined): URL | null {
  const pathname = publicWebPathname(assetUrl);
  if (!pathname) return null;
  return new URL(pathname, publicAssetOrigin());
}

export function publicWebPathnameForAsset(assetUrl: string | null | undefined): string | null {
  return publicWebPathname(assetUrl);
}