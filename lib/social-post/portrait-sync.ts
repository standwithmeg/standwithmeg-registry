import {
  localPublicFileExists,
  localPublicFileMtimeMs,
  publicCourtActorAssetExists,
  readLocalPublicText,
  resolvePublicAssetUrl,
} from "../court-actor-public-assets";

export type PortraitAssetStatus = {
  share_has_portrait: boolean;
  photo_file_live: boolean;
  slides_stale: boolean;
  frame_one_live: boolean;
};

type SpecPhotoLike = {
  photo?: {
    path?: string;
    exists?: boolean;
  };
};

async function fetchAssetLastModified(path: string): Promise<number | null> {
  const localMtime = localPublicFileMtimeMs(path);
  if (localMtime != null) return localMtime;
  const url = new URL(resolvePublicAssetUrl(path));
  url.searchParams.set("_swm_lm", Date.now().toString());
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!res.ok) return null;
    const header = res.headers.get("last-modified");
    if (!header) return null;
    const parsed = Date.parse(header);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function sharePageHasPortrait(state: string, slug: string): Promise<boolean> {
  const path = `/court-actors/${state.toLowerCase()}/${slug}/share.html`;
  const localHtml = readLocalPublicText(path);
  const html = localHtml ?? await (async () => {
    const url = resolvePublicAssetUrl(path);
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  })();
  if (!html) return false;
  try {
    if (html.includes("photo-bg photo-real") || html.includes('class="frame f1 has-real-photo"')) {
      return true;
    }
    if (html.includes("photo-placeholder") || html.includes("{{ACTOR.IMAGE_URL}}")) {
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

async function assetExists(path: string): Promise<boolean> {
  return localPublicFileExists(path) || publicCourtActorAssetExists(path);
}

export async function slidesLookStale(state: string, slug: string): Promise<boolean> {
  const stateLower = state.toLowerCase();
  const sharePath = `/court-actors/${stateLower}/${slug}/share.html`;
  const framePath = `/court-actors/${stateLower}/${slug}/frame-01.jpg`;
  const [shareHasPortrait, frameLive, shareModified, frameModified] = await Promise.all([
    sharePageHasPortrait(stateLower, slug),
    assetExists(framePath),
    fetchAssetLastModified(sharePath),
    fetchAssetLastModified(framePath),
  ]);
  if (!shareHasPortrait || !frameLive) return false;
  if (shareModified == null || frameModified == null) return shareHasPortrait;
  return shareModified > frameModified + 1000;
}

export function specPhotoWebPath(
  spec: SpecPhotoLike,
  state: string,
  slug: string,
  fallbackPhotoUrl: string | null | undefined,
): string {
  const rel = spec.photo?.path?.trim();
  if (rel) {
    const web = rel.replace(/^public\//, "/");
    if (web.startsWith("/court-actors/")) return web;
  }
  return fallbackPhotoUrl ?? `/court-actors/${state.toLowerCase()}/${slug}/image_1080.png`;
}

export async function assessActorPortraitAssets(
  state: string,
  slug: string,
  spec: SpecPhotoLike,
  fallbackPhotoUrl: string | null | undefined,
): Promise<PortraitAssetStatus> {
  const stateLower = state.toLowerCase();
  const photoPath = specPhotoWebPath(spec, stateLower, slug, fallbackPhotoUrl);
  const framePath = `/court-actors/${stateLower}/${slug}/frame-01.jpg`;
  const [share_has_portrait, photo_file_live, slides_stale, frame_one_live] = await Promise.all([
    sharePageHasPortrait(stateLower, slug),
    assetExists(photoPath),
    slidesLookStale(stateLower, slug),
    assetExists(framePath),
  ]);
  return { share_has_portrait, photo_file_live, slides_stale, frame_one_live };
}