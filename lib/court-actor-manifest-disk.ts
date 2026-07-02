import { promises as fs } from "fs";
import path from "path";
import type { CourtActorManifest } from "./court-actor-deploy";
import { publicAssetOrigin } from "./court-actor-public-url";

const MANIFEST_RELATIVE_PATH = path.join("public", "court-actors", "manifest.json");
const MANIFEST_WEB_PATH = "/court-actors/manifest.json";

let manifestTextCache: { fingerprint: string; text: string } | null = null;

function manifestFingerprint(text: string): string {
  const head = text.slice(0, 512);
  const tail = text.length > 512 ? text.slice(-512) : "";
  return `${text.length}:${head}:${tail}`;
}

async function readManifestTextFromDisk(): Promise<string> {
  const manifestPath = path.join(process.cwd(), MANIFEST_RELATIVE_PATH);
  return fs.readFile(manifestPath, "utf-8");
}

async function readManifestTextFromCdn(): Promise<string> {
  const res = await fetch(new URL(MANIFEST_WEB_PATH, publicAssetOrigin()), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Could not fetch ${MANIFEST_WEB_PATH}: HTTP ${res.status}`);
  }
  return res.text();
}

/** Read manifest JSON from disk, falling back to the deployed CDN copy on Vercel. */
export async function readCourtActorManifestText(): Promise<string> {
  try {
    const text = await readManifestTextFromDisk();
    manifestTextCache = { fingerprint: manifestFingerprint(text), text };
    return text;
  } catch {
    const cached = manifestTextCache?.text;
    if (cached) return cached;

    const text = await readManifestTextFromCdn();
    manifestTextCache = { fingerprint: manifestFingerprint(text), text };
    return text;
  }
}

export async function loadCourtActorManifestFromDisk(): Promise<CourtActorManifest> {
  const text = await readCourtActorManifestText();
  return JSON.parse(text) as CourtActorManifest;
}