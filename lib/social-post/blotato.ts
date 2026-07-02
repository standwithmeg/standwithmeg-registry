import { publicAssetOrigin } from "../court-actor-public-url";
import type { SocialPostPackage } from "./types";

// heroFallbackUrl removed: we must NEVER fall back to bare portrait (image_1080 / hero) for media.
// Court actor posts must only use generated frame-*.jpg slides.

export type BlotatoPlatform = "facebook" | "instagram" | "x" | "twitter";

export type BlotatoPublishResult = {
  platform: BlotatoPlatform;
  success: boolean;
  postId?: string;
  error?: string;
};

function getEnv() {
  const configuredBase = process.env.BLOTATO_API_BASE?.trim();
  const apiBase = (configuredBase || "https://backend.blotato.com/v2")
    .replace("https://api.blotato.com/v1", "https://backend.blotato.com/v2")
    .replace(/\/+$/, "");
  return {
    apiKey: process.env.BLOTATO_API_KEY?.trim() || null,
    apiBase,
    accounts: {
      facebook: process.env.BLOTATO_ACCOUNT_FACEBOOK?.trim() || null,
      instagram: process.env.BLOTATO_ACCOUNT_INSTAGRAM?.trim() || null,
      x: process.env.BLOTATO_ACCOUNT_X?.trim() || process.env.BLOTATO_ACCOUNT_TWITTER?.trim() || null,
      twitter: null,
    },
    pageIds: {
      facebook: process.env.BLOTATO_ACCOUNT_FACEBOOK_PAGE_ID?.trim()
        || process.env.BLOTATO_FACEBOOK_PAGE_ID?.trim()
        || process.env.BLOTATO_PAGE_ID_FACEBOOK?.trim()
        || null,
    },
  };
}

export function isBlotatoConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.apiKey && env.apiBase && (env.accounts.facebook || env.accounts.instagram || env.accounts.x));
}

function toAbsoluteAssetUrl(url: string): string {
  const origin = publicAssetOrigin();
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function buildMediaUrls(pkg: SocialPostPackage): string[] {
  const cacheBust = Date.now().toString(36);
  const seen = new Set<string>();
  const ordered: string[] = [];

  const add = (path: string | null | undefined) => {
    if (!path?.trim()) return;
    const absolute = toAbsoluteAssetUrl(path.trim());
    if (seen.has(absolute)) return;
    seen.add(absolute);
    ordered.push(absolute);
  };

  // CENTRALIZED media URL builder for Blotato court-actor publishing.
  // ONLY include generated slide frames: filename/path must match frame-*.jpg / .jpeg
  // NEVER include hero_url, image_1080.png, photo_url, or anything containing "hero".
  // If no valid frames, return empty list (caller must fail with clear error).
  for (const frame of [...pkg.frames].sort((a, b) => a.order - b.order)) {
    const fname = (frame.filename || "").toLowerCase();
    const u = (frame.url || "").toLowerCase();
    // Only generated slide frames (vertical or social feed versions). Never raw portrait.
    const looksLikeSlide = (fname.startsWith("frame-") || fname.startsWith("social-frame-") || u.includes("/frame-") || u.includes("/social-frame-"));
    const isJpg = u.endsWith(".jpg") || u.endsWith(".jpeg") || fname.endsWith(".jpg") || fname.endsWith(".jpeg");
    if (!looksLikeSlide || !isJpg) continue;
    if (u.includes("image_1080") || u.includes("hero") || fname.includes("image_1080") || fname.includes("hero")) {
      continue;
    }
    add(frame.url);
  }

  // No fallback to raw portrait ever.

  // Always try to include the last slide (the "Stand with Meg" / CTA frame, which is the highest order).
  // Previously slice(0,6) would drop it when there are 7+ frames (f1 + quotes + f6/f2/f5/f3/f7).
  // Keep at most 6 for carousel friendliness, but prioritize the final CTA slide.
  let toSend = ordered;
  if (toSend.length > 6) {
    toSend = [...toSend.slice(0, 5), toSend[toSend.length - 1]];
  }
  const limited = toSend.slice(0, 6); // IG/X friendly carousel size
  return limited.map((absolute, index) => {
    try {
      const u = new URL(absolute);
      u.searchParams.set("swm_social_v", `${cacheBust}_${index + 1}`);
      return u.toString();
    } catch {
      // Fallback for any malformed base URL
      const separator = absolute.includes("?") ? "&" : "?";
      return `${absolute}${separator}swm_social_v=${cacheBust}_${index + 1}`;
    }
  });
}

/**
 * Local-only debug helper. Prints the exact mediaUrls that would be sent to Blotato
 * for a given court actor (e.g. 'ga', 'jennifer_davis').
 * Usage: npx tsx -e '
 *   import {debugBlotatoPayloadForActor} from "./lib/social-post/blotato";
 *   debugBlotatoPayloadForActor("ga", "jennifer_davis");
 * '
 */
export async function debugBlotatoPayloadForActor(state: string, slug: string) {
  console.log(`=== DRY-RUN BLOTATO PAYLOAD for ${state}/${slug} ===`);
  try {
    const { buildSocialPostPackage } = await import("./package");
    const actor = {
      role: "Court Actor",
      name: slug.replace(/_/g, " "),
      court_or_county: null,
      state_code: state,
      location_key: state,
      count: 3,
      photo_url: `/court-actors/${state}/${slug}/image_1080.png`,
      share_url: `/court-actors/${state}/${slug}/share.html`,
    } as unknown as Parameters<typeof buildSocialPostPackage>[0];
    const res = await buildSocialPostPackage(actor);
    if (!res.ok) {
      console.error("build failed:", res.reason);
      return;
    }
    const mediaUrls = buildMediaUrls(res.package);
    console.log("mediaUrls:", mediaUrls);
    console.log("caption (fb):", captionForPlatform(res.package, "facebook").slice(0, 200) + "...");
    console.log("Uses social-frame?", mediaUrls.some(u => u.includes("social-frame")));
    console.log("Contains image_1080?", mediaUrls.some(u => u.includes("image_1080")));
    return { mediaUrls, captions: res.package.captions };
  } catch (e) {
    console.error("debug error", e);
  }
}

export function captionForPlatform(packageData: SocialPostPackage, platform: BlotatoPlatform): string {
  let base: string;
  if (platform === "x" || platform === "twitter") base = packageData.captions.x;
  else if (platform === "instagram") base = packageData.captions.instagram;
  else base = packageData.captions.facebook;

  return base;
}

function platformTargetType(platform: BlotatoPlatform): string {
  if (platform === "x") return "twitter";
  return platform;
}

function fetchErrorMessage(err: unknown, apiBase: string): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message) {
    return `${err.message}: ${cause.message}`;
  }
  return `${err.message} while contacting ${apiBase}`;
}

async function resolveFacebookPageId(env: ReturnType<typeof getEnv>, accountId: string): Promise<string | null> {
  if (env.pageIds.facebook) return env.pageIds.facebook;

  const res = await fetch(`${env.apiBase}/users/me/accounts/${encodeURIComponent(accountId)}/subaccounts`, {
    headers: { "blotato-api-key": env.apiKey ?? "" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown Blotato error");
    throw new Error(`Facebook requires a pageId, but Blotato could not list Facebook pages: ${res.status} ${text}`);
  }

  const data = (await res.json().catch(() => ({}))) as {
    items?: Array<{ id?: string; name?: string }>;
  };
  const pages = (data.items ?? []).filter(page => page.id);
  if (pages.length === 0) {
    throw new Error("Facebook requires a pageId, but Blotato returned no Facebook pages for this account.");
  }
  if (pages.length === 1) {
    return pages[0].id ?? null;
  }

  const standWithMeg = pages.find(page => /stand\s+with\s+meg/i.test(page.name ?? ""));
  if (standWithMeg?.id) return standWithMeg.id;

  throw new Error(
    `Facebook requires a pageId and Blotato has ${pages.length} pages. Set BLOTATO_FACEBOOK_PAGE_ID in Vercel. Options: ${pages.map(page => `${page.name ?? "Unnamed"} (${page.id})`).join(", ")}.`
  );
}

export async function publishToBlotato(args: {
  package: SocialPostPackage;
  platforms?: BlotatoPlatform[];
  scheduledTime?: Date;
}): Promise<BlotatoPublishResult[]> {
  const env = getEnv();
  const platforms = args.platforms ?? (["facebook", "instagram", "x"] as BlotatoPlatform[]);
  const results: BlotatoPublishResult[] = [];

  if (!env.apiKey) {
    return platforms.map(platform => ({ platform, success: false, error: "BLOTATO_API_KEY not configured." }));
  }

  const mediaUrls = buildMediaUrls(args.package);
  if (mediaUrls.length === 0) {
    return platforms.map(platform => ({
      platform,
      success: false,
      error: "No valid court-actor slide frames found (only frame-*.jpg allowed; hero/image_1080 portrait is excluded by design).",
    }));
  }

  for (const platform of platforms) {
    const accountId = env.accounts[platform];
    if (!accountId) {
      results.push({ platform, success: false, error: `BLOTATO_ACCOUNT_${platform.toUpperCase()} not configured.` });
      continue;
    }

    const targetType = platformTargetType(platform);
    const text = captionForPlatform(args.package, platform);

    let target: Record<string, unknown> = { targetType };
    if (targetType === "facebook") {
      try {
        const pageId = await resolveFacebookPageId(env, accountId);
        if (pageId) target = { targetType, pageId };
      } catch (err: unknown) {
        results.push({ platform, success: false, error: err instanceof Error ? err.message : String(err) });
        continue;
      }
    }

    const payload: Record<string, unknown> = {
      post: {
        accountId,
        content: {
          text,
          mediaUrls,
          platform: targetType,
          ...(platform === "instagram" ? { altText: text.slice(0, 100) + " | Stand With Meg court actor report" } : {}),
        },
        target,
      },
    };
    if (args.scheduledTime) {
      payload.scheduledTime = args.scheduledTime.toISOString();
    }

    try {
      const res = await fetch(`${env.apiBase}/posts`, {
        method: "POST",
        headers: {
          "blotato-api-key": env.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "Unknown Blotato error");
        results.push({ platform, success: false, error: `Blotato ${res.status}: ${text}` });
        continue;
      }

      const data = (await res.json().catch(() => ({}))) as { id?: string; postId?: string; postSubmissionId?: string };
      results.push({ platform, success: true, postId: data.postSubmissionId ?? data.id ?? data.postId });
    } catch (err: unknown) {
      results.push({ platform, success: false, error: fetchErrorMessage(err, env.apiBase) });
    }
  }

  return results;
}
