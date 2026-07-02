import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile, rm, readFile } from "fs/promises";
import { generateCaptions, type CaptionInput } from "../lib/social-post/captions";
import type { PublicActorLike } from "../lib/social-post/package";

loadEnvConfig(process.cwd());

type LocalSpec = {
  actor?: {
    slug?: string;
    display_name?: string;
    role?: string;
    county?: string | null;
    court_or_county?: string | null;
    state_abbr?: string;
    family_count?: number;
    public_family_count?: number;
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
};

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function extractCounty(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/([A-Za-z][A-Za-z\s]+(?:County|Parish))(?:\b|$)/i);
  if (match) return match[1].trim();
  return value.trim();
}

function deriveStateSlug(actor: PublicActorLike): { state: string; slug: string } | null {
  const state = (actor.state_code ?? actor.location_key)?.toLowerCase();
  if (!state) return null;
  const fromShare = actor.share_url?.match(/\/court-actors\/([a-z]{2})\/([^/]+)\/(?:share\.html|)$/i);
  if (fromShare) return { state: fromShare[1].toLowerCase(), slug: fromShare[2] };
  const fromPhoto = actor.photo_url?.match(/\/court-actors\/([a-z]{2})\/([^/]+)\//i);
  if (fromPhoto) return { state: fromPhoto[1].toLowerCase(), slug: fromPhoto[2] };
  const slug = actor.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return { state, slug };
}

async function readLocalSpec(state: string, slug: string): Promise<LocalSpec | null> {
  try {
    const raw = await readFile(`public/court-actors/${state.toLowerCase()}/${slug}/spec.json`, "utf-8");
    return JSON.parse(raw) as LocalSpec;
  } catch {
    return null;
  }
}

async function listLocalFrames(state: string, slug: string): Promise<string[]> {
  const frames: string[] = [];
  for (let i = 1; i <= 7; i += 1) {
    const filename = `frame-${String(i).padStart(2, "0")}.jpg`;
    try {
      await readFile(`public/court-actors/${state.toLowerCase()}/${slug}/${filename}`);
      frames.push(filename);
    } catch {
      // frame does not exist
    }
  }
  return frames;
}

async function main() {
  const origin = process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com";
  const res = await fetch(`${origin}/api/survey/court-actors?limit=1000`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch public actors: ${res.status}`);
  const json = (await res.json()) as { actors?: PublicActorLike[] };
  const actors = json.actors ?? [];

  const baseDir = "content/social-posts/by-actor";
  await rm(baseDir, { recursive: true, force: true });
  await mkdir(baseDir, { recursive: true });

  const results: Array<{ state: string; slug: string; actor: string; ok: boolean; note?: string }> = [];

  for (const actor of actors) {
    const derived = deriveStateSlug(actor);
    if (!derived) {
      results.push({ state: "?", slug: "?", actor: actor.name, ok: false, note: "Could not derive state/slug" });
      continue;
    }
    const { state, slug } = derived;
    const spec = await readLocalSpec(state, slug);
    if (!spec) {
      results.push({ state, slug, actor: actor.name, ok: false, note: `No local spec.json for ${state}/${slug}` });
      continue;
    }

    const actorSpec = spec.actor ?? {};
    const displayName = actorSpec.display_name?.trim() || actor.name;
    const role = actorSpec.role?.trim() || actor.role;
    const county = actorSpec.county?.trim() || extractCounty(actorSpec.court_or_county) || extractCounty(actor.court_or_county);
    const stateAbbr = (actorSpec.state_abbr?.trim() || state).toUpperCase();
    const familyCount = actorSpec.public_family_count ?? actorSpec.family_count ?? actor.count;
    const stats = spec.state_stats ?? {};
    const comments = (spec.supabase?.public_comments ?? [])
      .map(c => c.comment_text?.trim())
      .filter(Boolean) as string[];

    const input: CaptionInput = {
      actorName: displayName,
      role,
      county,
      stateAbbr,
      familyCount,
      stateFamilyCount: stats.state_family_count ?? null,
      medianFinancialLoss: stats.median_financial_loss ?? null,
      proSePct: stats.pro_se_pct ?? null,
      medianMonthsLost: stats.median_months_lost ?? null,
      movementTotal: spec.movement_total ?? null,
      quotes: comments,
      shareUrl: actor.share_url ?? `/court-actors/${state}/${slug}/share.html`,
    };

    const captions = generateCaptions(input);

    const frames = await listLocalFrames(state, slug);

    const lines: string[] = [];
    lines.push(`> **Auto-generated post package — ${displayName} (${stateAbbr})**`);
    lines.push(`> Generated: ${new Date().toISOString().slice(0, 10)}`);
    lines.push(`> Folder: \`public/court-actors/${state}/${slug}/\``);
    lines.push(`> Hero image: \`image_1080.png\``);
    lines.push(`> Carousel frames: ${frames.length > 0 ? frames.join(", ") : "none found"}`);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Facebook / Instagram caption");
    lines.push("");
    lines.push(captions.facebook);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## X / Twitter caption");
    lines.push("");
    lines.push(captions.x);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## First comment (tags)");
    lines.push("");
    lines.push(captions.firstComment);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Location tag");
    lines.push("");
    lines.push(captions.locationTag);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Media upload order");
    lines.push("1. `image_1080.png` — hero image");
    if (frames.length > 0) {
      lines.push(`2. Optional carousel: ${frames.join(", ")}`);
    }
    lines.push("");

    const dir = `${baseDir}/${state}`;
    await mkdir(dir, { recursive: true });
    const filename = `${dir}/${sanitizeFilename(displayName)}.md`;
    await writeFile(filename, lines.join("\n"), "utf-8");
    results.push({ state: stateAbbr, slug, actor: displayName, ok: true });
  }

  // Write an index file.
  const indexLines: string[] = [];
  indexLines.push("# Court Actor Post Captions — Index");
  indexLines.push("");
  indexLines.push(`Generated: ${new Date().toISOString().slice(0, 10)}  `);
  indexLines.push(`Total public actors: ${actors.length}  `);
  indexLines.push(`Successfully generated: ${results.filter(r => r.ok).length}  `);
  indexLines.push(`Failed: ${results.filter(r => !r.ok).length}`);
  indexLines.push("");
  indexLines.push("| Actor | State | File |");
  indexLines.push("|---|---|---|");
  for (const r of results.filter(r => r.ok).sort((a, b) => a.actor.localeCompare(b.actor))) {
    const stateLower = r.state.toLowerCase();
    indexLines.push(`| ${r.actor} | ${r.state.toUpperCase()} | [caption](by-actor/${stateLower}/${sanitizeFilename(r.actor)}.md) |`);
  }
  if (results.some(r => !r.ok)) {
    indexLines.push("");
    indexLines.push("## Failed to generate");
    indexLines.push("| Actor | Reason |");
    indexLines.push("|---|---|");
    for (const r of results.filter(r => !r.ok)) {
      indexLines.push(`| ${r.actor} | ${r.note ?? ""} |`);
    }
  }
  await writeFile(`${baseDir}/../INDEX.md`, indexLines.join("\n"), "utf-8");

  console.log(`Generated ${results.filter(r => r.ok).length} caption packages in ${baseDir}`);
  console.log(`Failed: ${results.filter(r => !r.ok).length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
