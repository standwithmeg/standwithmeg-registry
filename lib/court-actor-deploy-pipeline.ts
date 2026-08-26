import { createAdminSupabaseClient } from "./supabase-admin";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorBucketKeyWithLocation, courtActorLocationKey, isRoleOnlyActorName, publicActorRoleEntries, resolveFamilyKey, type CourtActorRowReviewDecision } from "./court-actors";
import { AliasResolver, type AliasDecisionRow } from "./court-actor-similarity";
import { isCountableSubmission } from "./submission-public-visibility";
import {
  actorManifestEntry,
  addActorToManifest,
  manifestStateSlugKey,
  type CourtActorManifest,
  type CourtActorManifestEntry,
} from "./court-actor-deploy";
import { expirePublicActorCacheRows } from "./public-actor-cache";
import { after } from "next/server";

export type DeployBucket = {
  actor_bucket_key: string;
  display_name: string;
  role: string;
  court_or_county: string | null;
  state_abbr: string;
  slug: string;
  family_count: number;
};

export type DeployResult = {
  success: true;
  slug: string;
  state_abbr: string;
  display_name: string;
  requested_display_name: string;
  family_count: number;
  deployed_key: string;
  commit_sha: string;
  commit_url: string;
  warning: string | null;
  message: string;
};

export type ReplacePhotoResult = {
  success: true;
  slug: string;
  state_abbr: string;
  display_name: string;
  commit_sha: string;
  commit_url: string;
  warning: string | null;
  message: string;
};

const WORKFLOW_FILE = "regenerate-court-actor-shares.yml";
const MANIFEST_PATH = "public/court-actors/manifest.json";

type ActorRow = {
  id: string;
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  submission_id: string;
  survey_submissions:
    | { email: string | null; state_of_occurrence: string | null; outside_us_country: string | null; permission_to_share: string | null; approved: boolean | null }
    | { email: string | null; state_of_occurrence: string | null; outside_us_country: string | null; permission_to_share: string | null; approved: boolean | null }[]
    | null;
};

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

function githubHeaders(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "standwithmeg-registry",
  };
}

async function fetchGithubJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...githubHeaders(token), ...(init?.headers ?? {}) }, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API failed ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function getManifestFromGithub(repo: string, token: string): Promise<CourtActorManifest> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${MANIFEST_PATH}?ref=main`, {
    headers: githubHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not read manifest from GitHub: ${res.status} ${text.slice(0, 300)}`);
  }
  const json = await res.json() as { content?: string; encoding?: string };
  if (json.encoding !== "base64" || !json.content) {
    throw new Error("GitHub manifest response was not base64 content.");
  }
  return JSON.parse(Buffer.from(json.content, "base64").toString("utf8")) as CourtActorManifest;
}

function joinedSubmission(row: ActorRow) {
  return Array.isArray(row.survey_submissions)
    ? row.survey_submissions[0] ?? null
    : row.survey_submissions;
}

function actorLocation(row: ActorRow): string | null {
  if (row.location_key?.trim()) return row.location_key.trim();
  const submission = joinedSubmission(row);
  return courtActorLocationKey(submission?.state_of_occurrence || null, submission?.outside_us_country || null);
}

async function loadRowReviewMap(sb: AdminClient): Promise<Map<string, CourtActorRowReviewDecision>> {
  const { data, error } = await sb.from("court_actor_row_review").select("row_id, decision");
  if (error) {
    const missing = error.code === "42P01" || error.code === "PGRST205" || /Could not find the table/i.test(error.message ?? "");
    if (missing) return new Map();
    console.error("deploy row-review select error:", error.message);
    return new Map();
  }
  const map = new Map<string, CourtActorRowReviewDecision>();
  for (const row of (data ?? []) as Array<{ row_id: string; decision: CourtActorRowReviewDecision }>) {
    map.set(row.row_id, row.decision);
  }
  return map;
}

async function loadAliasResolver(sb: AdminClient): Promise<AliasResolver | null> {
  const { data, error } = await sb
    .from("court_actor_alias_decisions")
    .select("cluster_key, location_key, decision, canonical_name, canonical_role, name_keys")
    .eq("decision", "same_actor");
  if (error) {
    const missing = error.code === "42P01"
      || error.code === "42703"
      || error.code === "PGRST205"
      || /Could not find the table/i.test(error.message ?? "");
    if (missing) return null;
    console.error("deploy alias select error:", error.message);
    return null;
  }
  return new AliasResolver((data ?? []) as AliasDecisionRow[]);
}

function mostFrequent<T>(values: Map<T, number>): T | null {
  let best: T | null = null;
  let max = 0;
  for (const [value, count] of values.entries()) {
    if (count > max) {
      best = value;
      max = count;
    }
  }
  return best;
}

function roleSummary(roles: Map<string, number>) {
  const sorted = publicActorRoleEntries(roles);
  if (sorted.length === 0) return "Court Actor";
  if (sorted.length <= 3) return sorted.map(row => row[0]).join(" / ");
  return `${sorted.slice(0, 2).map(row => row[0]).join(" / ")} + ${sorted.length - 2} more roles`;
}

async function loadActorRows(sb: AdminClient): Promise<ActorRow[]> {
  const rows: ActorRow[] = [];
  let from = 0;
  const pageSize = 1000;
  let includeLocationKey = true;
  while (true) {
    const select = includeLocationKey
      ? "id, role, name, court_or_county, state_code, location_key, submission_id, survey_submissions(email, state_of_occurrence, outside_us_country, permission_to_share, approved)"
      : "id, role, name, court_or_county, state_code, submission_id, survey_submissions(email, state_of_occurrence, outside_us_country, permission_to_share, approved)";
    const { data, error } = await sb
      .from("court_actors")
      .select(select)
      .eq("source", "form_direct")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      if (includeLocationKey && error.code === "42703") {
        includeLocationKey = false;
        rows.length = 0;
        from = 0;
        continue;
      }
      throw new Error(error.message);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as ActorRow[]).map(row => ({ ...row, location_key: includeLocationKey ? row.location_key : null })));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export async function findDeployBucket(stateAbbr: string, slug: string): Promise<DeployBucket | null> {
  const sb = createAdminSupabaseClient();
  const [rows, rowReviewMap, aliasResolver] = await Promise.all([
    loadActorRows(sb),
    loadRowReviewMap(sb),
    loadAliasResolver(sb),
  ]);

  type Bucket = {
    families: Set<string>;
    roles: Map<string, number>;
    names: Map<string, number>;
    courts: Map<string, number>;
  };
  const buckets = new Map<string, Bucket>();
  for (const row of rows) {
    const submission = joinedSubmission(row);
    if (!row.role || !row.name || !isCountableSubmission(submission)) continue;
    // Role-only or placeholder "names" ("Guardian ad Litem", "Unknown", "DCF")
    // are testimony, not people — never a state-report actor card.
    if (isRoleOnlyActorName(row.name)) continue;
    const location = actorLocation(row);
    if (location !== stateAbbr) continue;
    const familyKey = resolveFamilyKey({
      row_id: row.id,
      reporter_email: submission?.email ?? null,
      submission_id: row.submission_id,
      location_key: location,
      review_decision: rowReviewMap.get(row.id) ?? null,
    });
    if (familyKey === null) continue;
    const aliasHit = aliasResolver?.resolve(row.name, location) ?? null;
    const effectiveName = aliasHit?.canonical_name ?? row.name;
    const key = actorBucketKeyWithLocation(effectiveName, row.role, location);
    if (!key.split("|")[0]) continue;
    const bucket = buckets.get(key) ?? { families: new Set<string>(), roles: new Map<string, number>(), names: new Map<string, number>(), courts: new Map<string, number>() };
    bucket.families.add(familyKey);
    bucket.roles.set(row.role, (bucket.roles.get(row.role) ?? 0) + 1);
    bucket.names.set(effectiveName, (bucket.names.get(effectiveName) ?? 0) + 1);
    if (row.court_or_county) bucket.courts.set(row.court_or_county, (bucket.courts.get(row.court_or_county) ?? 0) + 1);
    buckets.set(key, bucket);
  }

  for (const [actor_bucket_key, bucket] of buckets.entries()) {
    const displayName = mostFrequent(bucket.names) ?? "";
    const bucketSlug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (bucketSlug !== slug) continue;
    return {
      actor_bucket_key,
      display_name: displayName,
      role: roleSummary(bucket.roles),
      court_or_county: mostFrequent(bucket.courts),
      state_abbr: stateAbbr,
      slug,
      family_count: bucket.families.size,
    };
  }
  return null;
}

async function commitDeployFiles(args: {
  repo: string;
  token: string;
  message: string;
  manifest: CourtActorManifest;
  photoBuffer: Buffer | null;
  slug: string;
  stateAbbr: string;
}) {
  const api = `https://api.github.com/repos/${args.repo}`;
  const ref = await fetchGithubJson<{ object: { sha: string } }>(`${api}/git/ref/heads/main`, args.token);
  const baseCommit = await fetchGithubJson<{ tree: { sha: string } }>(`${api}/git/commits/${ref.object.sha}`, args.token);
  const manifestBlob = await fetchGithubJson<{ sha: string }>(`${api}/git/blobs`, args.token, {
    method: "POST",
    body: JSON.stringify({
      content: JSON.stringify(args.manifest, null, 2) + "\n",
      encoding: "utf-8",
    }),
  });
  const treeItems: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [
    { path: MANIFEST_PATH, mode: "100644", type: "blob", sha: manifestBlob.sha },
  ];
  if (args.photoBuffer) {
    const photoBlob = await fetchGithubJson<{ sha: string }>(`${api}/git/blobs`, args.token, {
      method: "POST",
      body: JSON.stringify({
        content: args.photoBuffer.toString("base64"),
        encoding: "base64",
      }),
    });
    treeItems.push({
      path: `public/court-actors/${args.stateAbbr.toLowerCase()}/${args.slug}/image_1080.png`,
      mode: "100644",
      type: "blob",
      sha: photoBlob.sha,
    });
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

export async function dispatchStateRegen(repo: string, token: string, stateAbbr: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: githubHeaders(token),
    body: JSON.stringify({ ref: "main", inputs: { state: stateAbbr, force: "true" } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub workflow dispatch failed ${res.status}: ${text.slice(0, 300)}`);
  }
}

export async function runActorDeploy(args: {
  repo: string;
  token: string;
  slug: string;
  stateAbbr: string;
  displayName: string;
  photoBuffer: Buffer | null;
}): Promise<DeployResult> {
  const { repo, token, slug, stateAbbr, displayName, photoBuffer } = args;

  const [manifest, bucket] = await Promise.all([
    getManifestFromGithub(repo, token),
    findDeployBucket(stateAbbr, slug),
  ]);

  const alreadyDeployed = (manifest.actors ?? []).some(
    entry => entry.slug === slug && entry.state_abbr?.toUpperCase() === stateAbbr && entry.photo_url
  );
  if (alreadyDeployed && photoBuffer) {
    throw new Error(`${displayName} (${stateAbbr}) already has a deployed photo. Use replace-photo to overwrite.`);
  }

  if (!bucket || bucket.family_count < COURT_ACTOR_PUBLIC_THRESHOLD) {
    throw new Error(`${displayName} (${stateAbbr}) is not at the ${COURT_ACTOR_PUBLIC_THRESHOLD}-family public threshold.`);
  }

  const canonicalDisplayName = bucket.display_name || displayName;
  const entry = actorManifestEntry({
    slug,
    stateAbbr,
    displayName: canonicalDisplayName,
    actorBucketKey: bucket.actor_bucket_key,
    hasPhoto: Boolean(photoBuffer),
    shareReady: true,
  });
  const nextManifest = addActorToManifest(manifest, entry);
  const message = `deploy(actors): wire photo for ${canonicalDisplayName} (${stateAbbr})`;
  const commit = await commitDeployFiles({
    repo,
    token,
    message,
    manifest: nextManifest,
    photoBuffer,
    slug,
    stateAbbr,
  });

  let warning: string | null = null;
  try {
    await dispatchStateRegen(repo, token, stateAbbr);
  } catch (err) {
    warning = err instanceof Error ? err.message : "Workflow dispatch failed.";
    console.error("court actor deploy regen dispatch failed:", warning);
  }

  after(() => expirePublicActorCacheRows(createAdminSupabaseClient()).catch(err => {
    console.error("public actor cache expiry failed after actor deploy:", err);
  }));

  return {
    success: true,
    slug,
    state_abbr: stateAbbr,
    display_name: canonicalDisplayName,
    requested_display_name: displayName,
    family_count: bucket.family_count,
    deployed_key: manifestStateSlugKey(stateAbbr, slug),
    commit_sha: commit.sha,
    commit_url: commit.html_url,
    warning,
    message: warning
      ? `Committed ${canonicalDisplayName}, but regen dispatch needs manual retry: ${warning}`
      : `Queued ${canonicalDisplayName}. The public share page, slides, and ${stateAbbr} PDF will update after forced regeneration finishes and Vercel deploys it.`,
  };
}

function findManifestEntry(manifest: CourtActorManifest, stateAbbr: string, slug: string): CourtActorManifestEntry | null {
  const key = manifestStateSlugKey(stateAbbr, slug);
  return (manifest.actors ?? []).find(entry =>
    entry.slug && entry.state_abbr && manifestStateSlugKey(entry.state_abbr, entry.slug) === key
  ) ?? null;
}

function manifestWithPhotoUrl(manifest: CourtActorManifest, stateAbbr: string, slug: string): CourtActorManifest {
  const key = manifestStateSlugKey(stateAbbr, slug);
  const shareUrl = `/court-actors/${stateAbbr.toLowerCase()}/${slug}/share.html`;
  const actors = (manifest.actors ?? []).map(entry => {
    if (!entry.slug || !entry.state_abbr || manifestStateSlugKey(entry.state_abbr, entry.slug) !== key) return entry;
    return {
      ...entry,
      photo_url: `/court-actors/${stateAbbr.toLowerCase()}/${slug}/image_1080.png`,
      share_url: entry.share_url ?? shareUrl,
    };
  });
  return { ...manifest, generated_at: new Date().toISOString(), actors };
}

async function commitPhoto(args: {
  repo: string;
  token: string;
  message: string;
  stateAbbr: string;
  slug: string;
  uploadedPhotoBuffer: Buffer;
  manifest: CourtActorManifest | null;
}) {
  const api = `https://api.github.com/repos/${args.repo}`;
  const ref = await fetchGithubJson<{ object: { sha: string } }>(`${api}/git/ref/heads/main`, args.token);
  const baseCommit = await fetchGithubJson<{ tree: { sha: string } }>(`${api}/git/commits/${ref.object.sha}`, args.token);
  const photoBlob = await fetchGithubJson<{ sha: string }>(`${api}/git/blobs`, args.token, {
    method: "POST",
    body: JSON.stringify({
      content: args.uploadedPhotoBuffer.toString("base64"),
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

export async function runActorPhotoReplace(args: {
  repo: string;
  token: string;
  slug: string;
  stateAbbr: string;
  photoBuffer: Buffer;
}): Promise<ReplacePhotoResult> {
  const { repo, token, slug, stateAbbr, photoBuffer } = args;

  const manifest = await getManifestFromGithub(repo, token);
  const entry = findManifestEntry(manifest, stateAbbr, slug);
  if (!entry) {
    throw new Error(`${slug} (${stateAbbr}) is not deployed in manifest.json.`);
  }

  const displayName = entry.display_name || entry.canonical_name || slug.replace(/_/g, " ");
  // Always bump manifest.generated_at so CDN + share pages pick up the new portrait.
  const nextManifest = manifestWithPhotoUrl(manifest, stateAbbr, slug);
  const message = `fix(actors): replace photo for ${displayName} (${stateAbbr})`;
  const commit = await commitPhoto({
    repo,
    token,
    message,
    stateAbbr,
    slug,
    uploadedPhotoBuffer: photoBuffer,
    manifest: nextManifest,
  });

  let warning: string | null = null;
  try {
    await dispatchStateRegen(repo, token, stateAbbr);
  } catch (err) {
    warning = err instanceof Error ? err.message : "Workflow dispatch failed.";
    console.error("court actor replace-photo regen dispatch failed:", warning);
  }

  after(() => expirePublicActorCacheRows(createAdminSupabaseClient()).catch(err => {
    console.error("public actor cache expiry failed after actor photo replacement:", err);
  }));

  return {
    success: true,
    slug,
    state_abbr: stateAbbr,
    display_name: displayName,
    commit_sha: commit.sha,
    commit_url: commit.html_url,
    warning,
    message: warning
      ? `Portrait uploaded for ${displayName}, but regen dispatch needs manual retry: ${warning}`
      : `Portrait uploaded for ${displayName}. Regeneration queued for ${stateAbbr}.`,
  };
}

export type PhotoDeployAction = "deploy" | "replace" | "skip";

export async function runPhotoIntakeDeploy(args: {
  repo: string;
  token: string;
  candidate: {
    slug: string;
    state_abbr: string;
    name: string;
    already_deployed: boolean;
    photo_url: string | null;
  };
  photoBuffer: Buffer;
}): Promise<DeployResult | ReplacePhotoResult> {
  const { repo, token, candidate, photoBuffer } = args;
  if (candidate.already_deployed && candidate.photo_url) {
    return runActorPhotoReplace({ repo, token, slug: candidate.slug, stateAbbr: candidate.state_abbr, photoBuffer });
  }
  return runActorDeploy({
    repo,
    token,
    slug: candidate.slug,
    stateAbbr: candidate.state_abbr,
    displayName: candidate.name,
    photoBuffer,
  });
}
