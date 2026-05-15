import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { isAdminEmail } from "../../../../../lib/require-auth";
import {
  manifestStateSlugKey,
  type CourtActorManifest,
  type CourtActorManifestEntry,
} from "../../../../../lib/court-actor-deploy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKFLOW_FILE = "regenerate-state-pdfs.yml";
const MANIFEST_PATH = "public/court-actors/manifest.json";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

class PhotoValidationError extends Error {}

type ImageDimensions = {
  width: number;
  height: number;
};

function githubHeaders(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "standwithmeg-registry",
  };
}

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email);
}

async function fetchGithubJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...githubHeaders(token), ...(init?.headers ?? {}) }, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API failed ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function getManifestFromGithub(repo: string, token: string): Promise<{ manifest: CourtActorManifest; sha: string }> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${MANIFEST_PATH}?ref=main`, {
    headers: githubHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not read manifest from GitHub: ${res.status} ${text.slice(0, 300)}`);
  }
  const json = await res.json() as { content?: string; encoding?: string; sha?: string };
  if (json.encoding !== "base64" || !json.content || !json.sha) {
    throw new Error("GitHub manifest response was not base64 content.");
  }
  return {
    manifest: JSON.parse(Buffer.from(json.content, "base64").toString("utf8")) as CourtActorManifest,
    sha: json.sha,
  };
}

function findManifestEntry(manifest: CourtActorManifest, stateAbbr: string, slug: string): CourtActorManifestEntry | null {
  const key = manifestStateSlugKey(stateAbbr, slug);
  return (manifest.actors ?? []).find(entry =>
    entry.slug && entry.state_abbr && manifestStateSlugKey(entry.state_abbr, entry.slug) === key
  ) ?? null;
}

function manifestWithPhotoUrl(manifest: CourtActorManifest, stateAbbr: string, slug: string): CourtActorManifest | null {
  const key = manifestStateSlugKey(stateAbbr, slug);
  const actors = (manifest.actors ?? []).map(entry => {
    if (!entry.slug || !entry.state_abbr || manifestStateSlugKey(entry.state_abbr, entry.slug) !== key) return entry;
    return {
      ...entry,
      photo_url: `/court-actors/${stateAbbr.toLowerCase()}/${slug}/image_1080.png`,
      share_url: entry.share_url ?? `/court-actors/${stateAbbr.toLowerCase()}/${slug}/share.html`,
    };
  });
  return actors.some(entry => entry.slug && entry.state_abbr && manifestStateSlugKey(entry.state_abbr, entry.slug) === key)
    ? { ...manifest, generated_at: new Date().toISOString(), actors }
    : null;
}

function readPngDimensions(input: Buffer): ImageDimensions {
  if (input.length < 24 || !input.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new PhotoValidationError("Uploaded PNG file is invalid.");
  }
  return {
    width: input.readUInt32BE(16),
    height: input.readUInt32BE(20),
  };
}

function isJpegStartOfFrame(marker: number) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readJpegDimensions(input: Buffer): ImageDimensions {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new PhotoValidationError("Uploaded JPEG file is invalid.");
  }

  let offset = 2;
  while (offset < input.length) {
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    if (offset >= input.length) break;

    const marker = input[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > input.length) break;

    const segmentLength = input.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > input.length) {
      throw new PhotoValidationError("Uploaded JPEG file is invalid.");
    }

    if (isJpegStartOfFrame(marker)) {
      if (segmentLength < 7) throw new PhotoValidationError("Uploaded JPEG file is invalid.");
      return {
        height: input.readUInt16BE(offset + 3),
        width: input.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  throw new PhotoValidationError("Could not read uploaded image dimensions.");
}

function readImageDimensions(input: Buffer, contentType: string): ImageDimensions {
  if (contentType === "image/png") return readPngDimensions(input);
  if (contentType === "image/jpeg") return readJpegDimensions(input);
  throw new PhotoValidationError("Photo must be a PNG or JPEG image.");
}

async function normalizeUploadedPhoto(photo: File): Promise<Buffer> {
  const contentType = photo.type.toLowerCase();
  if (contentType !== "image/png" && contentType !== "image/jpeg") {
    throw new PhotoValidationError("Photo must be a PNG or JPEG image.");
  }

  const input = Buffer.from(await photo.arrayBuffer());
  const dimensions = readImageDimensions(input, contentType);
  if (
    dimensions.width < 200 ||
    dimensions.height < 200 ||
    dimensions.width > 4000 ||
    dimensions.height > 4000
  ) {
    throw new PhotoValidationError("Uploaded image dimensions are outside the allowed 200px to 4000px range.");
  }
  const aspectRatio = dimensions.width / dimensions.height;
  if (aspectRatio < 0.5 || aspectRatio > 0.8) {
    throw new PhotoValidationError("Uploaded image is not a portrait. Use a portrait photo instead of a webpage screenshot.");
  }

  return input;
}

async function commitPhoto(args: {
  repo: string;
  token: string;
  message: string;
  stateAbbr: string;
  slug: string;
  photoBuffer: Buffer;
  manifest: CourtActorManifest | null;
}) {
  const api = `https://api.github.com/repos/${args.repo}`;
  const ref = await fetchGithubJson<{ object: { sha: string } }>(`${api}/git/ref/heads/main`, args.token);
  const baseCommit = await fetchGithubJson<{ tree: { sha: string } }>(`${api}/git/commits/${ref.object.sha}`, args.token);
  const photoBlob = await fetchGithubJson<{ sha: string }>(`${api}/git/blobs`, args.token, {
    method: "POST",
    body: JSON.stringify({
      content: args.photoBuffer.toString("base64"),
      encoding: "base64",
    }),
  });
  const treeItems: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [{
    path: `public/court-actors/${args.stateAbbr.toLowerCase()}/${args.slug}/image_1080.png`,
    mode: "100644",
    type: "blob",
    sha: photoBlob.sha,
  }];
  if (args.manifest) {
    const manifestBlob = await fetchGithubJson<{ sha: string }>(`${api}/git/blobs`, args.token, {
      method: "POST",
      body: JSON.stringify({
        content: JSON.stringify(args.manifest, null, 2) + "\n",
        encoding: "utf-8",
      }),
    });
    treeItems.push({ path: MANIFEST_PATH, mode: "100644", type: "blob", sha: manifestBlob.sha });
  }
  const tree = await fetchGithubJson<{ sha: string }>(`${api}/git/trees`, args.token, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeItems }),
  });
  const commit = await fetchGithubJson<{ sha: string; html_url: string }>(`${api}/git/commits`, args.token, {
    method: "POST",
    body: JSON.stringify({
      message: args.message,
      tree: tree.sha,
      parents: [ref.object.sha],
      author: { name: "Meghann Miller", email: "founder@standwithmeg.com" },
      committer: { name: "Meghann Miller", email: "founder@standwithmeg.com" },
    }),
  });
  await fetchGithubJson(`${api}/git/refs/heads/main`, args.token, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit;
}

async function dispatchCanonicalStateRegen(repo: string, token: string, stateAbbr: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: githubHeaders(token),
    body: JSON.stringify({
      ref: "main",
      inputs: {
        state: stateAbbr,
        // Photo replacement must always rebuild from the versioned canonical
        // scripts/share-pages/regenerate_deployed_actors.py pipeline on main.
        force: "true",
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub workflow dispatch failed ${res.status}: ${text.slice(0, 300)}`);
  }
}

export async function POST(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const form = await request.formData();
    const slug = String(form.get("slug") ?? "").trim();
    const stateAbbr = String(form.get("state_abbr") ?? "").trim().toUpperCase();
    const photo = form.get("photo");

    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(slug)) {
      return Response.json({ error: "slug must be lowercase words separated by underscores." }, { status: 400 });
    }
    if (!/^[A-Z]{2}$/.test(stateAbbr)) {
      return Response.json({ error: "state_abbr must be a 2-letter state code." }, { status: 400 });
    }
    if (!(photo instanceof File)) {
      return Response.json({ error: "photo file is required." }, { status: 400 });
    }

    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!repo || !token) {
      return Response.json({ error: "Server not configured: missing GITHUB_REPO or GITHUB_DISPATCH_TOKEN." }, { status: 500 });
    }

    const [{ manifest }, photoBuffer] = await Promise.all([
      getManifestFromGithub(repo, token),
      normalizeUploadedPhoto(photo),
    ]);
    const entry = findManifestEntry(manifest, stateAbbr, slug);
    if (!entry) {
      return Response.json({ error: `${slug} (${stateAbbr}) is not deployed in manifest.json.` }, { status: 404 });
    }

    const displayName = entry.display_name || entry.canonical_name || slug.replace(/_/g, " ");
    const nextManifest = entry.photo_url ? null : manifestWithPhotoUrl(manifest, stateAbbr, slug);
    const message = `fix(actors): replace photo for ${displayName} (${stateAbbr})`;
    const commit = await commitPhoto({
      repo,
      token,
      message,
      stateAbbr,
      slug,
      photoBuffer,
      manifest: nextManifest,
    });

    let dispatchWarning: string | null = null;
    try {
      await dispatchCanonicalStateRegen(repo, token, stateAbbr);
    } catch (err) {
      dispatchWarning = err instanceof Error ? err.message : "Workflow dispatch failed.";
      console.error("court actor replace-photo regen dispatch failed:", dispatchWarning);
    }

    return Response.json({
      success: true,
      slug,
      state_abbr: stateAbbr,
      display_name: displayName,
      commit_sha: commit.sha,
      commit_url: commit.html_url,
      message: dispatchWarning
        ? `Photo replaced for ${displayName}, but regen dispatch needs manual retry: ${dispatchWarning}`
        : `Photo replaced for ${displayName}. Regeneration queued for ${stateAbbr}.`,
      warning: dispatchWarning,
    });
  } catch (err) {
    console.error("POST /api/admin/court-actors/replace-photo error:", err);
    if (err instanceof PhotoValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json({ error: err instanceof Error ? err.message : "Photo replacement failed." }, { status: 500 });
  }
}
