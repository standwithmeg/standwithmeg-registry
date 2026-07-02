import "server-only";

import fs from "node:fs";
import path from "node:path";

import {
  publicAssetOrigin,
  publicCourtActorAssetUrl,
  publicWebPathnameForAsset,
  resolvePublicAssetUrl,
} from "./court-actor-public-url";

export { publicAssetOrigin, publicCourtActorAssetUrl, resolvePublicAssetUrl };

// On Vercel, tracing any read under public/court-actors/ pulls ~870MB of
// slide/photo assets into every serverless function that imports this module.
// Static assets are served from the CDN; use HTTP existence checks instead.
const USE_LOCAL_PUBLIC_FILES = process.env.SWM_USE_LOCAL_PUBLIC_FILES === "1"
  || (!process.env.VERCEL && process.env.NODE_ENV !== "production");

function localPublicFilePath(assetUrl: string | null | undefined): string | null {
  if (!USE_LOCAL_PUBLIC_FILES) return null;
  const pathname = publicWebPathnameForAsset(assetUrl);
  if (!pathname) return null;
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "public", pathname.slice(1));
}

/** Fast sync check against the deployed public/ tree (avoids HTTP round-trips on Vercel). */
export function localPublicFileExists(assetUrl: string | null | undefined): boolean {
  const filePath = localPublicFilePath(assetUrl);
  if (!filePath) return false;
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function readLocalPublicText(assetUrl: string | null | undefined): string | null {
  const filePath = localPublicFilePath(assetUrl);
  if (!filePath) return null;
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

export function localPublicFileMtimeMs(assetUrl: string | null | undefined): number | null {
  const filePath = localPublicFilePath(assetUrl);
  if (!filePath) return null;
  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    return Number.isFinite(mtime) ? mtime : null;
  } catch {
    return null;
  }
}

export async function publicCourtActorAssetExists(assetUrl: string | null | undefined): Promise<boolean> {
  if (localPublicFileExists(assetUrl)) return true;
  const url = publicCourtActorAssetUrl(assetUrl);
  if (!url) return false;
  // Cache-bust so we don't get a stale 404 from Vercel's edge cache right after a deploy.
  url.searchParams.set("_swm_check", Date.now().toString());
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) return true;
    if (head.status !== 405 && head.status !== 403) return false;
    const get = await fetch(url, { method: "GET", cache: "no-store" });
    return get.ok;
  } catch {
    return false;
  }
}