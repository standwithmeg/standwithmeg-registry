import { createHash } from "node:crypto";
import type { SocialPostPackage } from "./types";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "content_signature")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function socialPostPackageSignature(pkg: SocialPostPackage): string {
  const relevant = {
    actor_bucket_key: pkg.actor_bucket_key,
    actor_slug: pkg.actor_slug,
    state_abbr: pkg.state_abbr,
    actor_name: pkg.actor_name,
    role: pkg.role,
    county: pkg.county,
    family_count: pkg.family_count,
    frames: pkg.frames.map(frame => ({
      filename: frame.filename,
      order: frame.order,
      url: frame.url,
    })),
    captions: pkg.captions,
    legislators: pkg.legislators,
    stats: pkg.stats,
    quotes: pkg.quotes,
    share_url: pkg.share_url,
    hero_url: pkg.hero_url,
    spec_source: pkg.spec_source,
  };
  return createHash("sha256").update(stableStringify(relevant)).digest("hex");
}
