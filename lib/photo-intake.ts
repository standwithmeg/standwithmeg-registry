import { promises as fs } from "fs";
import path from "path";
import { createAdminSupabaseClient } from "./supabase-admin";
import { actorBucketKeyWithLocation, actorLooseNameKey, COURT_ACTOR_PUBLIC_THRESHOLD } from "./court-actors";
import { getGmailClient, listMessages, getMessage, findImageAttachments, attachmentToBuffer, getAttachment, targetGmailMailboxEmail, type GmailMessage } from "./gmail";
import { spotlightSlug, type CourtActorManifest } from "./court-actor-deploy";
import { publicAssetOrigin, publicCourtActorAssetExists } from "./court-actor-public-assets";
import type { PublicActorLike } from "./social-post/package";

export type PhotoIntakeSource = "desktop" | "gmail";

export type MatchedActor = {
  name: string;
  state_abbr: string;
  location_key: string | null;
  role: string;
  slug: string;
  family_count: number;
  bucket_key: string;
  photo_url: string | null;
  share_url: string | null;
  already_deployed: boolean;
};

export type PhotoIntakeItem = {
  id: string;
  source: PhotoIntakeSource;
  filename: string;
  display_name_guess: string;
  state_abbr_guess: string | null;
  file_path: string | null;
  message_id: string | null;
  attachment_id: string | null;
  buffer: Buffer | null;
  status: "matched" | "ambiguous" | "unmatched" | "needs_review";
  confidence: "high" | "medium" | "low";
  candidates: MatchedActor[];
  review_notes: string | null;
  created_at: string;
};

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".heic", ".heif", ".webp"]);
const PROCESSED_TABLE = "photo_intake_processed";

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

function normalizeFilename(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function filenameTokens(filename: string): string[] {
  const base = filename.replace(/\.[^.]+$/, "");
  return base
    .toLowerCase()
    .split(/[_\-\s.]+/)
    .map(t => t.replace(/[^a-z0-9]/g, ""))
    .filter(t => t.length > 1);
}

function guessStateFromFilename(filename: string): string | null {
  const tokens = filenameTokens(filename);
  for (const token of tokens) {
    if (/^[a-z]{2}$/.test(token)) {
      return token.toUpperCase();
    }
    const stateAbbr = STATE_NAMES[token];
    if (stateAbbr) return stateAbbr;
  }
  return null;
}

function guessDisplayNameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const clean = base
    .replace(/^\d+[_\-]?/, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Preserve the user's original casing when it looks intentional; otherwise
  // title-case an all-lowercase filename.
  const looksTitleCased = /[A-Z]/.test(clean);
  if (looksTitleCased) return clean;
  return clean
    .split(" ")
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

function decodeBase64UrlText(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "===".slice((base64.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf-8");
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function messageText(message: GmailMessage): string {
  const chunks: string[] = [];
  if (message.snippet) chunks.push(message.snippet);

  function walk(part: GmailMessage["payload"] | undefined) {
    if (!part) return;
    const data = part.body?.data;
    if (data) {
      try {
        const decoded = decodeBase64UrlText(data);
        chunks.push(part.mimeType === "text/html" ? stripHtml(decoded) : decoded);
      } catch {
        // Ignore malformed inline bodies.
      }
    }
    for (const child of part.parts ?? []) walk(child);
  }

  walk(message.payload);
  return chunks.join("\n").replace(/\s+/g, " ").trim();
}

function stateNameToAbbr(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (/^[a-z]{2}$/i.test(normalized)) return normalized.toUpperCase();
  return STATE_NAMES[normalized] ?? null;
}

function inferActorFromMessage(message: GmailMessage): { name: string; stateAbbr: string | null } | null {
  const text = messageText(message);
  const patterns = [
    /photo needed:\s+(.+?)\s+\(([A-Z]{2}|[A-Za-z][A-Za-z\s]+)\)/i,
    /look for a public photo of (.+?)\s+\(([A-Za-z][A-Za-z\s]+)\)/i,
    /public photo of (.+?)\s+\(([A-Za-z][A-Za-z\s]+)\)/i,
    /court actor you named,?\s+(.+?)\s+in\s+([A-Za-z][A-Za-z\s]+?),?\s+has now reached/i,
    /court actor,?\s+(.+?)\s+in\s+([A-Za-z][A-Za-z\s]+?),?\s+has now reached/i,
    /(?:photo|profile)\s+(?:for|of)\s+(.+?)\s+in\s+([A-Za-z][A-Za-z\s]+?)(?:\.|,|\s|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const name = match[1]?.replace(/^["'\s]+|["'\s]+$/g, "").trim();
    const stateAbbr = stateNameToAbbr(match[2] ?? "");
    if (name) return { name, stateAbbr };
  }

  return null;
}

function isMissingProcessedTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01"
    || error.code === "PGRST205"
    || /Could not find the table/i.test(error.message ?? "");
}

async function loadProcessedPhotoIntakeIds(): Promise<Set<string>> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from(PROCESSED_TABLE)
    .select("id");
  if (error) {
    if (isMissingProcessedTable(error)) return new Set();
    console.error("Failed to load processed photo intake ids:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map(row => String((row as { id: string }).id)));
}

async function recordProcessedPhotoIntakeItem(
  item: PhotoIntakeItem,
  candidate: MatchedActor,
  note: string | null,
): Promise<void> {
  const sb = createAdminSupabaseClient();
  const { error } = await sb
    .from(PROCESSED_TABLE)
    .upsert({
      id: item.id,
      source: item.source,
      filename: item.filename,
      actor_bucket_key: candidate.bucket_key,
      actor_name: candidate.name,
      state_abbr: candidate.state_abbr,
      processed_at: new Date().toISOString(),
      note,
    }, { onConflict: "id" });
  if (error && !isMissingProcessedTable(error)) {
    console.error("Failed to record processed photo intake item:", error.message);
  }
}

async function archiveDesktopPhotoItem(item: PhotoIntakeItem): Promise<void> {
  if (item.source !== "desktop" || !item.file_path) return;
  try {
    const folder = path.dirname(item.file_path);
    const archiveFolder = path.join(folder, "_processed");
    await fs.mkdir(/*turbopackIgnore: true*/ archiveFolder, { recursive: true });
    const ext = path.extname(item.file_path);
    const base = path.basename(item.file_path, ext);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(archiveFolder, `${base}.${stamp}${ext}`);
    await fs.rename(/*turbopackIgnore: true*/ item.file_path, /*turbopackIgnore: true*/ target);
  } catch (err) {
    console.error("Failed to archive processed desktop photo:", item.file_path, err);
  }
}

async function latestGmailTokenEmail(sb: ReturnType<typeof createAdminSupabaseClient>): Promise<string | null> {
  const { data, error } = await sb
    .from("gmail_tokens")
    .select("email")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.email?.trim() || null;
}

export async function resolveDesktopDropFolder(): Promise<string> {
  const configured = process.env.COURT_ACTOR_PHOTO_DROP_FOLDER?.trim();
  if (configured) return configured;

  const home = process.env.HOME || "/Users/meghannmiller";
  const desktop = path.join(home, "Desktop");
  const candidates = [
    path.join(desktop, "📸 Drop Court-Actor Photos Here"),
    path.join(desktop, "Court Actor Photos"),
    path.join(desktop, "court-actor-photos"),
    path.join(home, "Code", "court-actor-posts", "_inbox", "photos"),
  ];
  for (const candidate of candidates) {
    try {
      const resolved = await fs.realpath(/*turbopackIgnore: true*/ candidate);
      return resolved;
    } catch {
      // continue
    }
  }
  return candidates[candidates.length - 1];
}

async function isImageFile(filePath: string): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) return false;
  try {
    const stat = await fs.stat(/*turbopackIgnore: true*/ filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function scanDesktopPhotoDropFolder(): Promise<PhotoIntakeItem[]> {
  const folder = await resolveDesktopDropFolder();
  const items: PhotoIntakeItem[] = [];
  try {
    const entries = await fs.readdir(/*turbopackIgnore: true*/ folder, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filename = entry.name;
      const filePath = path.join(folder, filename);
      if (!(await isImageFile(filePath))) continue;

      const normalized = normalizeFilename(filename);
      const displayNameGuess = guessDisplayNameFromFilename(normalized);
      const stateGuess = guessStateFromFilename(normalized);

      items.push({
        id: `desktop:${filePath}`,
        source: "desktop",
        filename: normalized,
        display_name_guess: displayNameGuess,
        state_abbr_guess: stateGuess,
        file_path: filePath,
        message_id: null,
        attachment_id: null,
        buffer: null,
        status: "unmatched",
        confidence: "low",
        candidates: [],
        review_notes: null,
        created_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("Failed to scan desktop photo drop folder:", folder, err);
  }
  return items;
}

async function fetchPublicActors(): Promise<PublicActorLike[]> {
  const origin = publicAssetOrigin();
  const res = await fetch(`${origin}/api/survey/court-actors?limit=1000`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch public actors: ${res.status}`);
  }
  const json = (await res.json()) as { actors?: PublicActorLike[] };
  return json.actors ?? [];
}

function deriveSlug(actor: PublicActorLike): string | null {
  if (actor.share_url) {
    const m = actor.share_url.match(/\/court-actors\/([a-z]{2})\/([^/]+)\/(?:share\.html|)$/i);
    if (m) return m[2];
  }
  if (actor.photo_url) {
    const m = actor.photo_url.match(/\/court-actors\/([a-z]{2})\/([^/]+)\//i);
    if (m) return m[2];
  }
  return spotlightSlug(actor.name);
}

async function loadDeployedActorLookup(): Promise<Map<string, MatchedActor>> {
  try {
    const res = await fetch(`${publicAssetOrigin()}/court-actors/manifest.json`, { cache: "no-store" });
    if (!res.ok) return new Map();
    const manifest = (await res.json()) as CourtActorManifest;
    const lookup = new Map<string, MatchedActor>();
    for (const entry of manifest.actors ?? []) {
      if (!entry.slug || !entry.state_abbr) continue;
      const state = entry.state_abbr.toUpperCase();
      const bucketKey = entry.actor_bucket_key?.trim().toLowerCase() || null;
      const namesToKey = [entry.canonical_name, entry.display_name].filter(Boolean) as string[];
      if (bucketKey) {
        lookup.set(bucketKey, {
          name: entry.canonical_name || entry.display_name || entry.slug.replace(/_/g, " "),
          state_abbr: state,
          location_key: state,
          role: "Court Actor",
          slug: entry.slug,
          family_count: 0,
          bucket_key: bucketKey,
          photo_url: entry.photo_url,
          share_url: entry.share_url,
          already_deployed: true,
        });
      }
      for (const name of namesToKey) {
        const key = actorBucketKeyWithLocation(name, "", state).toLowerCase();
        if (!lookup.has(key)) {
          lookup.set(key, {
            name,
            state_abbr: state,
            location_key: state,
            role: "Court Actor",
            slug: entry.slug,
            family_count: 0,
            bucket_key: bucketKey || key,
            photo_url: entry.photo_url,
            share_url: entry.share_url,
            already_deployed: true,
          });
        }
      }
    }
    return lookup;
  } catch {
    return new Map();
  }
}

export async function matchPhotosToActors(items: PhotoIntakeItem[]): Promise<PhotoIntakeItem[]> {
  const [publicActors, deployedLookup] = await Promise.all([
    fetchPublicActors(),
    loadDeployedActorLookup(),
  ]);

  const candidateActors: MatchedActor[] = publicActors.map(actor => {
    const state = (actor.location_key ?? actor.state_code ?? "").toUpperCase();
    const slug = deriveSlug(actor);
    return {
      name: actor.name,
      state_abbr: state,
      location_key: actor.location_key,
      role: actor.role,
      slug: slug ?? spotlightSlug(actor.name),
      family_count: actor.count,
      bucket_key: actorBucketKeyWithLocation(actor.name, actor.role, state).toLowerCase(),
      photo_url: actor.photo_url,
      share_url: actor.share_url,
      already_deployed: false,
    };
  });

  // Merge deployed actors (which may include actors below the public threshold).
  for (const deployed of deployedLookup.values()) {
    const existing = candidateActors.find(
      a => a.state_abbr === deployed.state_abbr && a.bucket_key === deployed.bucket_key
    );
    if (existing) {
      existing.already_deployed = true;
      existing.photo_url = deployed.photo_url;
      existing.share_url = deployed.share_url;
      continue;
    }
    candidateActors.push(deployed);
  }

  return items.map(item => {
    const tokens = filenameTokens(item.filename);
    if (tokens.length < 2) {
      return { ...item, status: "needs_review", review_notes: "Filename does not contain enough name tokens to match safely." };
    }

    const alphaTokens = tokens.filter(t => /^[a-z]+$/.test(t));
    const lastToken = alphaTokens[alphaTokens.length - 1] ?? "";

    const normalizedTokens = alphaTokens.map(t => actorLooseNameKey(t).split(" ").pop() || t);

    const scored = candidateActors
      .map(actor => {
        const actorLoose = actorLooseNameKey(actor.name).split(" ");
        const nameKey = actorLooseNameKey(actor.name);
        const actorSlugTokens = actor.slug.split("_").filter(t => t.length > 1);

        const exactMatch =
          actorBucketKeyWithLocation(item.display_name_guess, "", item.state_abbr_guess || actor.state_abbr)
            .toLowerCase() === actor.bucket_key;

        let score = 0;
        const overlap = new Set(normalizedTokens.filter(t => actorLoose.includes(t)));
        score += overlap.size * 2;
        if (lastToken && actorLoose.includes(actorLooseNameKey(lastToken))) score += 3;
        if (nameKey && normalizedTokens.some(t => t === nameKey.split(" ").pop())) score += 2;
        if (actorSlugTokens.length > 0 && normalizedTokens.filter(t => actorSlugTokens.includes(t)).length >= 2) {
          score += 6;
        }
        if (item.state_abbr_guess && item.state_abbr_guess !== actor.state_abbr) score -= 5;
        if (exactMatch) score += 10;

        return { actor, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return {
        ...item,
        status: "needs_review",
        candidates: [],
        review_notes: "No public actor matched this photo. It needs manual review or a web-search-sourced image before it can be used. Do not auto-use questionable images.",
      };
    }

    const top = scored[0];
    const runnerUp = scored[1];
    const isAmbiguous = !!runnerUp && runnerUp.score >= top.score - 2 && runnerUp.actor.state_abbr === top.actor.state_abbr;

    if (isAmbiguous) {
      return {
        ...item,
        status: "ambiguous",
        confidence: "low",
        candidates: scored.slice(0, 3).map(s => s.actor),
        review_notes: `Could match multiple actors: ${scored.slice(0, 3).map(s => s.actor.name).join(", ")}.`,
      };
    }

    if (top.score < 4) {
      return {
        ...item,
        status: "needs_review",
        confidence: "low",
        candidates: scored.slice(0, 3).map(s => s.actor),
        review_notes: `Low-confidence match to ${top.actor.name}. Please confirm before deploying.`,
      };
    }

    const candidate = top.actor;
    const reviewNotes: string[] = [];
    if (candidate.already_deployed && candidate.photo_url) {
      reviewNotes.push(`${candidate.name} already has a deployed photo. Replacing it will overwrite the existing portrait.`);
    } else if (candidate.family_count < COURT_ACTOR_PUBLIC_THRESHOLD) {
      reviewNotes.push(`${candidate.name} is below the ${COURT_ACTOR_PUBLIC_THRESHOLD}-family public threshold.`);
    }

    return {
      ...item,
      status: reviewNotes.length > 0 ? "needs_review" : "matched",
      confidence: top.score >= 8 ? "high" : "medium",
      candidates: [candidate],
      review_notes: reviewNotes.join(" ") || null,
    };
  });
}

export async function loadPhotoBuffers(items: PhotoIntakeItem[]): Promise<PhotoIntakeItem[]> {
  return Promise.all(
    items.map(async item => {
      if (item.source === "desktop" && item.file_path) {
        try {
          const buffer = await fs.readFile(/*turbopackIgnore: true*/ item.file_path);
          return { ...item, buffer };
        } catch (err) {
          console.error("Failed to read desktop photo:", item.file_path, err);
          return { ...item, review_notes: (item.review_notes ?? "") + " Could not read file." };
        }
      }
      return item;
    })
  );
}

export async function scanGmailPhotoSubmissions(): Promise<PhotoIntakeItem[]> {
  let client;
  try {
    const sb = createAdminSupabaseClient();
    const approvalEmail = targetGmailMailboxEmail(await latestGmailTokenEmail(sb));
    if (!approvalEmail) return [];
    client = await getGmailClient(sb, approvalEmail);
  } catch {
    return [];
  }

  const items: PhotoIntakeItem[] = [];
  const seen = new Set<string>();
  const queries = [
    'subject:("Photo needed:") has:attachment newer_than:30d',
    'subject:("Court actor update") has:attachment newer_than:30d',
    'subject:(court actor photo) has:attachment',
    'subject:(actor photo) has:attachment',
    'subject:(photo submission) has:attachment',
    '"court actor you named" has:attachment newer_than:30d',
    '"has now reached the public reporting threshold" has:attachment newer_than:30d',
  ];

  for (const q of queries) {
    try {
      const messages = await listMessages(client, { q, maxResults: 20 });
      for (const meta of messages) {
        if (!meta.id) continue;
        const msg = await getMessage(client, meta.id, "full");
        const attachments = findImageAttachments(msg);
        const inferred = inferActorFromMessage(msg);
        for (const attachment of attachments) {
          const itemKey = `${meta.id}:${attachment.attachmentId}`;
          if (seen.has(itemKey)) continue;
          seen.add(itemKey);
          const normalized = normalizeFilename(attachment.filename);
          const displayNameGuess = inferred?.name ?? guessDisplayNameFromFilename(normalized);
          const stateGuess = inferred?.stateAbbr ?? guessStateFromFilename(normalized);
          items.push({
            id: `gmail:${meta.id}:${attachment.attachmentId}`,
            source: "gmail",
            filename: normalized,
            display_name_guess: displayNameGuess,
            state_abbr_guess: stateGuess,
            file_path: null,
            message_id: meta.id,
            attachment_id: attachment.attachmentId,
            buffer: null,
            status: "unmatched",
            confidence: "low",
            candidates: [],
            review_notes: null,
            created_at: new Date(Number(msg.internalDate) || Date.now()).toISOString(),
          });
        }
      }
    } catch (err) {
      console.error("Failed to scan Gmail photo submissions for query:", q, err);
    }
  }

  return items;
}

export async function downloadGmailAttachments(items: PhotoIntakeItem[]): Promise<PhotoIntakeItem[]> {
  const approvalEmail = targetGmailMailboxEmail();
  if (!approvalEmail) return items;

  let client;
  try {
    const sb = createAdminSupabaseClient();
    client = await getGmailClient(sb, approvalEmail);
  } catch {
    return items;
  }

  return Promise.all(
    items.map(async item => {
      if (item.source !== "gmail" || !item.message_id || !item.attachment_id) return item;
      try {
        const attachment = await getAttachment(client, item.message_id, item.attachment_id);
        const buffer = attachmentToBuffer(attachment);
        return { ...item, buffer };
      } catch (err) {
        console.error("Failed to download Gmail attachment:", item.id, err);
        return { ...item, review_notes: (item.review_notes ?? "") + " Could not download attachment." };
      }
    })
  );
}

export async function scanPhotoIntake(): Promise<PhotoIntakeItem[]> {
  const [desktopItems, gmailItems, processedIds] = await Promise.all([
    scanDesktopPhotoDropFolder(),
    scanGmailPhotoSubmissions(),
    loadProcessedPhotoIntakeIds(),
  ]);
  const unprocessed = [...desktopItems, ...gmailItems].filter(item => !processedIds.has(item.id));
  const matched = await matchPhotosToActors(unprocessed);
  return loadPhotoBuffers(matched);
}

export async function markPhotoIntakeItemProcessed(
  item: PhotoIntakeItem,
  candidate: MatchedActor,
  note: string | null = null,
): Promise<void> {
  await Promise.all([
    recordProcessedPhotoIntakeItem(item, candidate, note),
    archiveDesktopPhotoItem(item),
  ]);
}

export async function verifyLiveShareAssets(stateAbbr: string, slug: string): Promise<{
  ready: boolean;
  photo_ready: boolean;
  share_ready: boolean;
  frames_ready: boolean;
  notes: string[];
}> {
  const stateLower = stateAbbr.toLowerCase();
  const photoUrl = `/court-actors/${stateLower}/${slug}/image_1080.png`;
  const shareUrl = `/court-actors/${stateLower}/${slug}/share.html`;
  const specUrl = `/court-actors/${stateLower}/${slug}/spec.json`;
  const notes: string[] = [];

  const [photoExists, shareExists, specExists] = await Promise.all([
    publicCourtActorAssetExists(photoUrl),
    publicCourtActorAssetExists(shareUrl),
    publicCourtActorAssetExists(specUrl),
  ]);

  if (!specExists) notes.push("spec.json is not live yet.");
  if (!photoExists) notes.push("image_1080.png is not live yet.");
  if (!shareExists) notes.push("share.html is not live yet.");

  let framesReady = false;
  if (specExists) {
    try {
      const res = await fetch(`${publicAssetOrigin()}${specUrl}`, { cache: "no-store" });
      if (res.ok) {
        const spec = (await res.json()) as {
          photo?: { exists?: boolean };
          unresolved?: { court_actors?: string };
        };
        if (spec.photo?.exists === false) notes.push("spec.json reports photo.exists=false.");
        if (spec.unresolved?.court_actors) notes.push(`Unresolved spec: ${spec.unresolved.court_actors}`);
      }
    } catch {
      // ignore
    }

    const frameChecks = await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const order = i + 1;
        return publicCourtActorAssetExists(`/court-actors/${stateLower}/${slug}/frame-${String(order).padStart(2, "0")}.jpg`);
      })
    );
    framesReady = frameChecks.some(Boolean);
    if (!framesReady) notes.push("No carousel frames are live yet.");
  }

  const ready = specExists && photoExists && shareExists && framesReady;
  return {
    ready,
    photo_ready: photoExists,
    share_ready: shareExists,
    frames_ready: framesReady,
    notes,
  };
}
