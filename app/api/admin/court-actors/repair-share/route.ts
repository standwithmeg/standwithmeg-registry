import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../../lib/require-auth";
import { actorLooseNameKey } from "../../../../../lib/court-actors";
import { buildClusterKey } from "../../../../../lib/court-actor-similarity";
import { expirePublicActorCache, refreshPublicActorCache } from "../../../survey/court-actors/route";
import {
  actorManifestEntry,
  manifestStateSlugKey,
  type CourtActorManifest,
} from "../../../../../lib/court-actor-deploy";
import { after } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKFLOW_FILE = "regenerate-state-pdfs.yml";
const MANIFEST_PATH = "public/court-actors/manifest.json";
const OVERRIDES_PATH = "scripts/share-pages/actor_overrides.json";

type GitHubWorkflowRun = {
  id: number;
  html_url: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  run_number: number;
};

type GitHubContentResponse = {
  content?: string;
  encoding?: string;
  sha?: string;
};

type AliasDecisionRecord = {
  cluster_key: string;
  location_key: string | null;
  decision: "same_actor" | "keep_separate";
  canonical_name: string | null;
  canonical_role: string | null;
  name_keys: string[];
  variants: unknown;
  note: string | null;
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

async function requireAdminEmail() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email) ? user.email : null;
}

async function fetchGithubJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...githubHeaders(token), ...(init?.headers ?? {}) }, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API failed ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function getGithubText(repo: string, token: string, filePath: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=main`, {
    headers: githubHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not read ${filePath} from GitHub: ${res.status} ${text.slice(0, 300)}`);
  }
  const json = await res.json() as GitHubContentResponse;
  if (json.encoding !== "base64" || !json.content) {
    throw new Error(`${filePath} response was not base64 content.`);
  }
  return {
    text: Buffer.from(json.content, "base64").toString("utf8"),
    sha: json.sha ?? null,
  };
}

async function githubFileExists(repo: string, token: string, filePath: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=main`, {
    headers: githubHeaders(token),
    cache: "no-store",
  });
  if (res.ok) return true;
  if (res.status === 404) return false;
  const text = await res.text();
  throw new Error(`Could not check ${filePath} on GitHub: ${res.status} ${text.slice(0, 300)}`);
}

function workflowUrl(repo: string) {
  return `https://github.com/${repo}/actions/workflows/${WORKFLOW_FILE}`;
}

function runPayload(run: GitHubWorkflowRun) {
  return {
    run_id: run.id,
    run_url: run.html_url,
    run_status: run.status,
    run_conclusion: run.conclusion,
    run_created_at: run.created_at,
    run_updated_at: run.updated_at,
    run_number: run.run_number,
  };
}

async function findRecentWorkflowRun(repo: string, token: string, notBeforeIso: string) {
  const runsUrl = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&branch=main&per_page=10`;
  const res = await fetch(runsUrl, { headers: githubHeaders(token), cache: "no-store" });
  if (!res.ok) {
    console.error("GitHub workflow run lookup failed:", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  const notBefore = Date.parse(notBeforeIso);
  const runs = (json.workflow_runs ?? []) as GitHubWorkflowRun[];
  return runs.find(run => Date.parse(run.created_at) >= notBefore) ?? null;
}

async function dispatchStateRegen(repo: string, token: string, stateAbbr: string) {
  const dispatchStartedAt = new Date(Date.now() - 5000).toISOString();
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: githubHeaders(token),
    body: JSON.stringify({
      ref: "main",
      inputs: {
        state: stateAbbr,
        force: "true",
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub workflow dispatch failed ${res.status}: ${text.slice(0, 300)}`);
  }
  await new Promise(resolve => setTimeout(resolve, 1500));
  return findRecentWorkflowRun(repo, token, dispatchStartedAt);
}

function splitDisplayName(displayName: string) {
  const parts = displayName.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length <= 1) {
    return { first_name: displayName, last_name: "" };
  }
  return {
    first_name: parts.slice(0, -1).join(" "),
    last_name: parts[parts.length - 1] ?? "",
  };
}

const HONORIFICS = new Set([
  "dr",
  "mr",
  "mrs",
  "ms",
  "miss",
  "hon",
  "honorable",
  "judge",
  "justice",
  "atty",
  "attorney",
  "the",
  "gal",
  "esq",
]);

function personIdentity(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.replace(/[^a-z0-9]/g, ""))
    .filter(token => token && !HONORIFICS.has(token))
    .join(" ");
}

function repairedManifest(manifest: CourtActorManifest, args: {
  slug: string;
  stateAbbr: string;
  displayName: string;
  actorBucketKey: string | null;
  hasPhoto: boolean;
}) {
  const key = manifestStateSlugKey(args.stateAbbr, args.slug);
  const stateLower = args.stateAbbr.toLowerCase();
  const current = (manifest.actors ?? []).find(entry =>
    entry.slug && entry.state_abbr && manifestStateSlugKey(entry.state_abbr, entry.slug) === key
  );
  const actorBucketKey = args.actorBucketKey ?? current?.actor_bucket_key ?? null;
  const targetBucket = actorBucketKey?.trim().toLowerCase() || null;
  const targetIdentity = personIdentity(args.displayName);
  const targetState = args.stateAbbr.toUpperCase();
  const replacement = actorManifestEntry({
    slug: args.slug,
    stateAbbr: args.stateAbbr,
    displayName: args.displayName,
    actorBucketKey,
    hasPhoto: args.hasPhoto,
    shareReady: true,
  });

  // Repair must leave one public card per person. Remove stale siblings by
  // state+slug, resolved bucket key, or state+normalized display identity
  // before adding the corrected entry back.
  const actors = (manifest.actors ?? []).filter(entry => {
    if (!entry.slug || !entry.state_abbr) return true;
    if (manifestStateSlugKey(entry.state_abbr, entry.slug) === key) return false;
    if (targetBucket && (entry.actor_bucket_key?.trim().toLowerCase() || null) === targetBucket) return false;
    if (
      targetIdentity
      && String(entry.state_abbr ?? "").toUpperCase() === targetState
      && personIdentity(entry.canonical_name || entry.display_name) === targetIdentity
    ) {
      return false;
    }
    return true;
  });
  actors.push({
    ...replacement,
    photo_url: args.hasPhoto ? `/court-actors/${stateLower}/${args.slug}/image_1080.png` : null,
    share_url: `/court-actors/${stateLower}/${args.slug}/share.html`,
  });
  actors.sort((a, b) => {
    const stateCmp = String(a.state_abbr ?? "").localeCompare(String(b.state_abbr ?? ""));
    return stateCmp || String(a.slug ?? "").localeCompare(String(b.slug ?? ""));
  });
  return { ...manifest, generated_at: new Date().toISOString(), actors };
}

function repairedOverrides(current: Record<string, unknown>, args: {
  slug: string;
  displayName: string;
  role: string | null;
  courtOrCounty: string | null;
}) {
  const { first_name, last_name } = splitDisplayName(args.displayName);
  const previous = current[args.slug];
  const previousObject = previous && typeof previous === "object" && !Array.isArray(previous)
    ? previous as Record<string, unknown>
    : {};
  return {
    ...current,
    [args.slug]: {
      ...previousObject,
      display_name: args.displayName,
      first_name,
      last_name,
      ...(args.role ? { role: args.role } : {}),
      ...(args.courtOrCounty ? { county: args.courtOrCounty, court_or_county: args.courtOrCounty } : {}),
      _note: `Auto-repaired from the admin actor detail on ${new Date().toISOString().slice(0, 10)}. Locks the current approved display name, role, and court/county before forcing state PDF and actor slide regeneration.`,
    },
  };
}

function actorBucketNameKey(actorBucketKey: string | null) {
  return actorBucketKey?.split("|")[0]?.trim() || "";
}

async function upsertReportDisplayNameDecision(args: {
  stateAbbr: string;
  slug: string;
  displayName: string;
  actorBucketKey: string | null;
  role: string | null;
  adminEmail: string | null;
}) {
  const sb = createAdminSupabaseClient();
  const seedKeys = [
    actorBucketNameKey(args.actorBucketKey),
    actorLooseNameKey(args.slug.replace(/_/g, " ")),
    actorLooseNameKey(args.displayName),
  ].filter(Boolean);
  const requestedKeys = new Set(seedKeys);
  if (requestedKeys.size === 0) return { sb, changed: false };

  let existing: AliasDecisionRecord | null = null;
  const { data, error } = await sb
    .from("court_actor_alias_decisions")
    .select("cluster_key, location_key, decision, canonical_name, canonical_role, name_keys, variants, note")
    .eq("location_key", args.stateAbbr)
    .eq("decision", "same_actor");

  if (error) {
    const missing = error.code === "42P01"
      || error.code === "PGRST205"
      || /Could not find the table/i.test(error.message ?? "");
    if (missing) return { sb, changed: false };
    throw new Error(`Could not read alias decisions: ${error.message}`);
  }

  for (const row of (data ?? []) as AliasDecisionRecord[]) {
    if ((row.name_keys ?? []).some(key => requestedKeys.has(key))) {
      existing = row;
      break;
    }
  }

  const nameKeys = Array.from(new Set([...(existing?.name_keys ?? []), ...requestedKeys])).sort();
  const clusterKey = existing?.cluster_key || buildClusterKey(nameKeys, args.stateAbbr);
  const variants = Array.isArray(existing?.variants) ? existing.variants : [];
  const note = `Admin share repair set report display name to ${args.displayName} on ${new Date().toISOString().slice(0, 10)}.`;
  const now = new Date().toISOString();

  const { error: upsertError } = await sb
    .from("court_actor_alias_decisions")
    .upsert(
      {
        cluster_key: clusterKey,
        location_key: args.stateAbbr,
        decision: "same_actor",
        canonical_name: args.displayName,
        canonical_role: existing?.canonical_role ?? args.role,
        name_keys: nameKeys,
        variants,
        note: existing?.note ? `${existing.note}\n${note}` : note,
        decided_by: args.adminEmail,
        decided_at: now,
        updated_at: now,
      },
      { onConflict: "cluster_key" },
    );

  if (upsertError) {
    throw new Error(`Could not save report display-name decision: ${upsertError.message}`);
  }

  return { sb, changed: true };
}

async function commitRepairFiles(args: {
  repo: string;
  token: string;
  message: string;
  manifestText: string;
  overridesText: string;
}) {
  const api = `https://api.github.com/repos/${args.repo}`;
  const ref = await fetchGithubJson<{ object: { sha: string } }>(`${api}/git/ref/heads/main`, args.token);
  const baseCommit = await fetchGithubJson<{ tree: { sha: string } }>(`${api}/git/commits/${ref.object.sha}`, args.token);
  const [manifestBlob, overridesBlob] = await Promise.all([
    fetchGithubJson<{ sha: string }>(`${api}/git/blobs`, args.token, {
      method: "POST",
      body: JSON.stringify({ content: args.manifestText, encoding: "utf-8" }),
    }),
    fetchGithubJson<{ sha: string }>(`${api}/git/blobs`, args.token, {
      method: "POST",
      body: JSON.stringify({ content: args.overridesText, encoding: "utf-8" }),
    }),
  ]);
  const tree = await fetchGithubJson<{ sha: string }>(`${api}/git/trees`, args.token, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: [
        { path: MANIFEST_PATH, mode: "100644", type: "blob", sha: manifestBlob.sha },
        { path: OVERRIDES_PATH, mode: "100644", type: "blob", sha: overridesBlob.sha },
      ],
    }),
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

export async function POST(request: Request) {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const slug = String(body?.slug ?? "").trim();
    const stateAbbr = String(body?.state_abbr ?? "").trim().toUpperCase();
    const displayName = String(body?.display_name ?? "").trim().replace(/\s+/g, " ");
    const role = String(body?.role ?? "").trim().replace(/\s+/g, " ") || null;
    const courtOrCounty = String(body?.court_or_county ?? "").trim().replace(/\s+/g, " ") || null;
    const actorBucketKey = String(body?.actor_bucket_key ?? "").trim() || null;

    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(slug)) {
      return Response.json({ error: "slug must be lowercase words separated by underscores." }, { status: 400 });
    }
    if (!/^[A-Z]{2}$/.test(stateAbbr)) {
      return Response.json({ error: "state_abbr must be a 2-letter state code." }, { status: 400 });
    }
    if (!displayName) {
      return Response.json({ error: "display_name is required." }, { status: 400 });
    }

    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!repo || !token) {
      return Response.json({ error: "Server not configured: missing GITHUB_REPO or GITHUB_DISPATCH_TOKEN." }, { status: 500 });
    }

    const photoPath = `public/court-actors/${stateAbbr.toLowerCase()}/${slug}/image_1080.png`;
    const [manifestFile, overridesFile, hasPhoto] = await Promise.all([
      getGithubText(repo, token, MANIFEST_PATH),
      getGithubText(repo, token, OVERRIDES_PATH),
      githubFileExists(repo, token, photoPath),
    ]);
    const manifest = JSON.parse(manifestFile.text) as CourtActorManifest;
    const overrides = JSON.parse(overridesFile.text) as Record<string, unknown>;
    const nextManifest = repairedManifest(manifest, { slug, stateAbbr, displayName, actorBucketKey, hasPhoto });
    const nextOverrides = repairedOverrides(overrides, { slug, displayName, role, courtOrCounty });
    const reportDecision = await upsertReportDisplayNameDecision({
      stateAbbr,
      slug,
      displayName,
      actorBucketKey,
      role,
      adminEmail,
    });

    const manifestText = JSON.stringify(nextManifest, null, 2) + "\n";
    const overridesText = JSON.stringify(nextOverrides, null, 2) + "\n";
    const changed = manifestText !== manifestFile.text || overridesText !== overridesFile.text;
    const commit = changed
      ? await commitRepairFiles({
          repo,
          token,
          message: `fix(actors): repair ${displayName} share metadata`,
          manifestText,
          overridesText,
        })
      : null;

    let dispatchWarning: string | null = null;
    let run: GitHubWorkflowRun | null = null;
    try {
      run = await dispatchStateRegen(repo, token, stateAbbr);
    } catch (err) {
      dispatchWarning = err instanceof Error ? err.message : "Workflow dispatch failed.";
      console.error("court actor repair regen dispatch failed:", dispatchWarning);
    }

    if (changed) {
      after(() => expirePublicActorCache(reportDecision.sb).catch(err => {
        console.error("public actor cache expiry failed after actor share repair:", err);
      }));
    } else if (reportDecision.changed) {
      after(() => refreshPublicActorCache(reportDecision.sb).catch(err => {
        console.error("public actor cache refresh failed after actor share repair:", err);
      }));
    }

    return Response.json({
      success: true,
      changed,
      slug,
      state_abbr: stateAbbr,
      display_name: displayName,
      commit_sha: commit?.sha ?? null,
      commit_url: commit?.html_url ?? null,
      workflow_url: workflowUrl(repo),
      ...(run ? runPayload(run) : {}),
      message: dispatchWarning
        ? `Repaired ${displayName}, but regen dispatch needs manual retry: ${dispatchWarning}`
        : `Repaired ${displayName} and queued forced ${stateAbbr} PDF/share-slide regeneration.`,
      report_display_name_updated: reportDecision.changed,
      warning: dispatchWarning,
    });
  } catch (err) {
    console.error("POST /api/admin/court-actors/repair-share error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Repair failed." }, { status: 500 });
  }
}
