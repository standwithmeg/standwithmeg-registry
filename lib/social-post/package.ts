import {
  localPublicFileExists,
  publicCourtActorAssetExists,
  readLocalPublicText,
  resolvePublicAssetUrl,
} from "../court-actor-public-assets";
import { publicAssetOrigin } from "../court-actor-public-url";
import { assessActorPortraitAssets, specPhotoWebPath as portraitSpecPhotoWebPath } from "./portrait-sync";
import { actorBucketKeyWithLocation } from "../court-actors";
import { generateCaptions, type CaptionInput } from "./captions";
import { buildLegislatorBlock, formatFirstComment, type LegislatorBlock } from "./legislators";
import { socialPostPackageSignature } from "./signature";
import type { SocialPostPackage, SocialPostFrame } from "./types";

export type PublicActorLike = {
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  count: number;
  photo_url: string | null;
  share_url: string | null;
};

type SpecJson = {
  actor?: {
    slug?: string;
    display_name?: string;
    role?: string;
    county?: string;
    court_or_county?: string;
    state_abbr?: string;
    mention_count?: number;
    family_count?: number;
    public_family_count?: number;
  };
  photo?: {
    path?: string;
    exists?: boolean;
  };
  state_stats?: {
    state_family_count?: number;
    median_financial_loss?: number;
    pro_se_pct?: number;
    median_months_lost?: number;
  };
  movement_total?: number;
  supabase?: {
    public_comments?: Array<{ comment_text?: string; author?: string }>;
  };
  public_share?: {
    recommended_route?: string;
  };
};

function spotlightSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseShareUrl(shareUrl: string | null | undefined): { state: string; slug: string } | null {
  if (!shareUrl) return null;
  const match = shareUrl.match(/\/court-actors\/([a-z]{2})\/([^/]+)\/(?:share\.html|)$/i);
  if (!match) return null;
  return { state: match[1].toLowerCase(), slug: match[2] };
}

function parsePhotoUrl(photoUrl: string | null | undefined): { state: string; slug: string } | null {
  if (!photoUrl) return null;
  const match = photoUrl.match(/\/court-actors\/([a-z]{2})\/([^/]+)\//i);
  if (!match) return null;
  return { state: match[1].toLowerCase(), slug: match[2] };
}

function deriveActorSlug(actor: PublicActorLike): { state: string; slug: string } | null {
  const fromShare = parseShareUrl(actor.share_url);
  if (fromShare) return fromShare;
  const fromPhoto = parsePhotoUrl(actor.photo_url);
  if (fromPhoto) return fromPhoto;
  const state = (actor.location_key ?? actor.state_code)?.toLowerCase();
  if (!state) return null;
  return { state, slug: spotlightSlug(actor.name) };
}

function canonicalActorPaths(
  derived: { state: string; slug: string },
  spec: SpecJson,
): { state: string; slug: string } {
  const actorSpec = spec.actor ?? {};
  const state = (actorSpec.state_abbr?.trim() || derived.state).toLowerCase();
  const slug = actorSpec.slug?.trim() || derived.slug;
  return { state, slug };
}

function extractCounty(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/([A-Za-z][A-Za-z\s]+(?:County|Parish))(?:\b|$)/i);
  if (match) return match[1].trim();
  return value.trim();
}

function assetUrl(path: string): string {
  const origin = publicAssetOrigin();
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function readSpec(state: string, slug: string): Promise<SpecJson | null> {
  const webPath = `/court-actors/${state.toLowerCase()}/${slug}/spec.json`;
  const local = readLocalPublicText(webPath);
  if (local) {
    try {
      return JSON.parse(local) as SpecJson;
    } catch {
      // Fall through to HTTP.
    }
  }
  const url = assetUrl(webPath);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SpecJson;
  } catch {
    return null;
  }
}

async function frameExists(path: string): Promise<boolean> {
  return localPublicFileExists(path) || publicCourtActorAssetExists(path);
}

async function discoverFrames(state: string, slug: string, preferSocial = false): Promise<SocialPostFrame[]> {
  const prefix = preferSocial ? "social-frame" : "frame";
  // Check up to 12 frames to support variable quote slides + the final "Stand with Meg" CTA (frame N).
  const checks = Array.from({ length: 12 }, (_, i) => {
    const order = i + 1;
    const filename = `${prefix}-${String(order).padStart(2, "0")}.jpg`;
    const path = `/court-actors/${state.toLowerCase()}/${slug}/${filename}`;
    return frameExists(path).then(exists =>
      exists ? { url: resolvePublicAssetUrl(path), filename, order } : null
    );
  });
  const results = await Promise.all(checks);
  const found = results.filter(Boolean) as SocialPostFrame[];
  return found;
}

export type BuildPackageResult =
  | { ok: true; package: SocialPostPackage; missingLegislators: string[] }
  | { ok: false; reason: string };

export async function buildSocialPostPackage(actor: PublicActorLike): Promise<BuildPackageResult> {
  const derived = deriveActorSlug(actor);
  if (!derived) {
    return { ok: false, reason: `Could not derive state/slug for ${actor.name}` };
  }
  let { state, slug } = derived;

  const spec = await readSpec(state, slug);
  if (!spec) {
    return { ok: false, reason: `No spec.json found for ${actor.name} (${state}/${slug})` };
  }

  ({ state, slug } = canonicalActorPaths(derived, spec));

  const portrait = await assessActorPortraitAssets(state, slug, spec, actor.photo_url);
  if (!portrait.share_has_portrait && !portrait.photo_file_live) {
    return {
      ok: false,
      reason: `No portrait on the live share page for ${actor.name} (${state}/${slug}) — add a photo and regenerate slides.`,
    };
  }
  if (portrait.slides_stale) {
    return {
      ok: false,
      reason: `Share page has a portrait for ${actor.name} (${state}/${slug}) but slides are stale — regenerate slides, then refresh the queue item.`,
    };
  }

  // Prefer feed-safe social-frame-*.jpg (4:5 or square) for Blotato publishing to avoid FB blurred side-fill.
  // Fall back to vertical frame-*.jpg if no social versions present.
  let frames = await discoverFrames(state, slug, true);
  if (frames.length === 0) {
    frames = await discoverFrames(state, slug, false);
  }
  if (frames.length === 0) {
    return { ok: false, reason: `No share-page frames found for ${actor.name} (${state}/${slug})` };
  }
  if (!frames.some(frame => frame.order === 1)) {
    return {
      ok: false,
      reason: `Portrait slide (frame-01) is missing for ${actor.name} (${state}/${slug}) — regenerate share slides first.`,
    };
  }

  const photoPath = portraitSpecPhotoWebPath(spec, state, slug, actor.photo_url);
  const shareExists = await publicCourtActorAssetExists(`/court-actors/${state}/${slug}/share.html`);
  if (!shareExists) {
    return { ok: false, reason: `Share page is not live for ${actor.name} (${state}/${slug})` };
  }
  if (!portrait.photo_file_live && !portrait.share_has_portrait) {
    return { ok: false, reason: `Hero photo is not live for ${actor.name} (${state}/${slug})` };
  }

  const actorSpec = spec.actor ?? {};
  const displayName = actorSpec.display_name?.trim() || actor.name;
  const role = actorSpec.role?.trim() || actor.role;
  const county = actorSpec.county?.trim() || extractCounty(actorSpec.court_or_county) || extractCounty(actor.court_or_county);
  const stateAbbr = (actorSpec.state_abbr?.trim() || state).toUpperCase();
  const familyCount = actorSpec.public_family_count ?? actorSpec.family_count ?? actor.count;
  const bucketKey = actorBucketKeyWithLocation(actor.name, actor.role, stateAbbr).toLowerCase();

  const stats = spec.state_stats ?? {};
  const movementTotal = spec.movement_total ?? null;

  const publicComments = (spec.supabase?.public_comments ?? []).map(c => c.comment_text?.trim()).filter(Boolean) as string[];

  const captionInput: CaptionInput = {
    actorName: displayName,
    role,
    county,
    stateAbbr,
    familyCount,
    stateFamilyCount: stats.state_family_count ?? null,
    medianFinancialLoss: stats.median_financial_loss ?? null,
    proSePct: stats.pro_se_pct ?? null,
    medianMonthsLost: stats.median_months_lost ?? null,
    movementTotal,
    quotes: publicComments,
    shareUrl: actor.share_url ?? spec.public_share?.recommended_route ?? `/court-actors/${state}/${slug}/share.html`,
    rotationKey: bucketKey,
  };

  const captions = generateCaptions(captionInput);

  const legislatorResult = buildLegislatorBlock({ stateAbbr, county, rotationKey: bucketKey });

  const pkg: SocialPostPackage = {
    actor_bucket_key: bucketKey,
    actor_slug: slug,
    state_abbr: stateAbbr,
    actor_name: displayName,
    role,
    county: county || null,
    family_count: familyCount,
    frames,
    captions: {
      facebook: captions.facebook,
      instagram: captions.instagram,
      x: captions.x,
      firstComment: captions.firstComment,
      legislatorComment: captions.legislatorComment,
      locationTag: captions.locationTag,
    },
    legislators: legislatorsFromBlock(legislatorResult.block),
    stats: {
      state_family_count: stats.state_family_count ?? null,
      median_financial_loss: stats.median_financial_loss ?? null,
      pro_se_pct: stats.pro_se_pct ?? null,
      median_months_lost: stats.median_months_lost ?? null,
      movement_total: movementTotal,
    },
    quotes: publicComments.slice(0, 3).map(text => ({ text, attribution: `Anonymous Parent · ${stateAbbr}` })),
    share_url: captionInput.shareUrl || `/court-actors/${state}/${slug}/share.html`,
    hero_url: photoPath,
    spec_source: `/court-actors/${state}/${slug}/spec.json`,
    portrait_verified: portrait.share_has_portrait || portrait.photo_file_live,
  };
  pkg.content_signature = socialPostPackageSignature(pkg);

  return { ok: true, package: pkg, missingLegislators: captions.missingLegislators };
}

function legislatorsFromBlock(block: LegislatorBlock | null): SocialPostPackage["legislators"] {
  if (!block) return [];
  return [
    { level: "congress", party: block.congressD.party, name: block.congressD.name, title: block.congressD.title, handle: block.congressD.handle, profile_url: block.congressD.profile_url, socials: block.congressD.socials, note: block.congressD.note },
    { level: "congress", party: block.congressR.party, name: block.congressR.name, title: block.congressR.title, handle: block.congressR.handle, profile_url: block.congressR.profile_url, socials: block.congressR.socials, note: block.congressR.note },
    ...(block.stateSenate
      ? [{
          level: "state_senate" as const,
          party: block.stateSenate.party,
          name: block.stateSenate.name,
          title: block.stateSenate.title,
          handle: block.stateSenate.handle,
          profile_url: block.stateSenate.profile_url,
          socials: block.stateSenate.socials,
          note: block.stateSenate.note,
        }]
      : []),
    ...(block.stateHouse
      ? [{
          level: "state_house" as const,
          party: block.stateHouse.party,
          name: block.stateHouse.name,
          title: block.stateHouse.title,
          handle: block.stateHouse.handle,
          profile_url: block.stateHouse.profile_url,
          socials: block.stateHouse.socials,
          note: block.stateHouse.note,
        }]
      : []),
  ];
}

function packageHasStateLegislators(pkg: SocialPostPackage): boolean {
  return pkg.legislators.some(l => l.level === "state_senate" || l.level === "state_house");
}

function legislatorCommentHasStateTags(text: string | null | undefined): boolean {
  return /state legislators/i.test(text ?? "");
}

/** Re-derive legislator rows from county/state when older packages were staged without them. */
export function enrichPackageLegislators(pkg: SocialPostPackage): SocialPostPackage {
  const comment = pkg.captions.legislatorComment?.trim()
    || (legislatorCommentHasStateTags(pkg.captions.firstComment) ? pkg.captions.firstComment.trim() : "");
  if (packageHasStateLegislators(pkg) && legislatorCommentHasStateTags(comment)) {
    return pkg;
  }

  const result = buildLegislatorBlock({
    stateAbbr: pkg.state_abbr,
    county: pkg.county,
    rotationKey: pkg.actor_bucket_key,
  });
  if (!result.block) return pkg;

  const legislators = legislatorsFromBlock(result.block);
  const legislatorComment = formatFirstComment(result.block, pkg.state_abbr, pkg.county);

  return {
    ...pkg,
    legislators,
    captions: {
      ...pkg.captions,
      legislatorComment: legislatorComment || pkg.captions.legislatorComment || "",
      locationTag: result.block.locationTag || pkg.captions.locationTag,
    },
  };
}
