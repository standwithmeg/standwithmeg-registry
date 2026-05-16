import { promises as fs } from "fs";
import path from "path";

export type CourtActorManifestEntry = {
  slug: string;
  state_abbr: string | null;
  display_name: string | null;
  canonical_name: string | null;
  actor_bucket_key: string | null;
  photo_url: string | null;
  share_url: string | null;
};

export type CourtActorManifest = {
  generated_at?: string;
  actors?: CourtActorManifestEntry[];
};

export function spotlightSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function manifestStateSlugKey(stateAbbr: string, slug: string): string {
  return `${stateAbbr.trim().toLowerCase()}/${slug.trim()}`;
}

export function actorManifestEntry(args: {
  slug: string;
  stateAbbr: string;
  displayName: string;
  actorBucketKey?: string | null;
  hasPhoto: boolean;
  shareReady?: boolean;
}): CourtActorManifestEntry {
  const state = args.stateAbbr.trim().toUpperCase();
  const stateLower = state.toLowerCase();
  return {
    slug: args.slug,
    state_abbr: state,
    display_name: args.displayName,
    canonical_name: args.displayName,
    actor_bucket_key: args.actorBucketKey ?? null,
    photo_url: args.hasPhoto ? `/court-actors/${stateLower}/${args.slug}/image_1080.png` : null,
    share_url: args.shareReady === false ? null : `/court-actors/${stateLower}/${args.slug}/share.html`,
  };
}

export async function loadCourtActorManifestFromDisk(): Promise<CourtActorManifest> {
  const manifestPath = path.join(process.cwd(), "public", "court-actors", "manifest.json");
  const text = await fs.readFile(manifestPath, "utf-8");
  return JSON.parse(text) as CourtActorManifest;
}

export function manifestHasActor(manifest: CourtActorManifest, stateAbbr: string, slug: string): boolean {
  const key = manifestStateSlugKey(stateAbbr, slug);
  return (manifest.actors ?? []).some(entry =>
    entry.slug && entry.state_abbr && manifestStateSlugKey(entry.state_abbr, entry.slug) === key
  );
}

export function addActorToManifest(
  manifest: CourtActorManifest,
  entry: CourtActorManifestEntry,
): CourtActorManifest {
  const actors = (manifest.actors ?? []).filter(actor =>
    !(actor.slug && actor.state_abbr && manifestStateSlugKey(actor.state_abbr, actor.slug) === manifestStateSlugKey(entry.state_abbr ?? "", entry.slug))
  );
  actors.push(entry);
  actors.sort((a, b) => {
    const stateCmp = String(a.state_abbr ?? "").localeCompare(String(b.state_abbr ?? ""));
    return stateCmp || String(a.slug ?? "").localeCompare(String(b.slug ?? ""));
  });
  return {
    ...manifest,
    generated_at: new Date().toISOString(),
    actors,
  };
}

export function manifestStateSlugSet(manifest: CourtActorManifest): Set<string> {
  const deployed = new Set<string>();
  for (const entry of manifest.actors ?? []) {
    if (!entry.slug || !entry.state_abbr) continue;
    deployed.add(manifestStateSlugKey(entry.state_abbr, entry.slug));
  }
  return deployed;
}

export function manifestReadyShareStateSlugSet(manifest: CourtActorManifest): Set<string> {
  const ready = new Set<string>();
  for (const entry of manifest.actors ?? []) {
    if (!entry.slug || !entry.state_abbr || !entry.share_url) continue;
    ready.add(manifestStateSlugKey(entry.state_abbr, entry.slug));
  }
  return ready;
}
