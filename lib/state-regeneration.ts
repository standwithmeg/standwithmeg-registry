import { after } from "next/server";

const WORKFLOW_FILE = "regenerate-state-pdfs.yml";
const RECENT_DISPATCH_WINDOW_MS = 60_000;

const recentStateDispatches = new Map<string, number>();

type GitHubWorkflowRun = {
  html_url: string;
  status: string;
  conclusion: string | null;
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

function isActiveRun(run: GitHubWorkflowRun) {
  return run.status !== "completed";
}

async function findActiveWorkflowRun(repo: string, token: string) {
  const runsUrl = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?branch=main&per_page=10`;
  const res = await fetch(runsUrl, { headers: githubHeaders(token), cache: "no-store" });
  if (!res.ok) {
    console.error("GitHub active workflow run lookup failed:", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  const runs = (json.workflow_runs ?? []) as GitHubWorkflowRun[];
  return runs.find(isActiveRun) ?? null;
}

export function queueStateRegeneration(state: string | null | undefined, reason: string) {
  let location = String(state ?? "").trim();
  if (/^[a-z]{2}$/i.test(location)) {
    location = location.toUpperCase();
  }
  if (!/^[A-Za-z][A-Za-z0-9 -]{1,80}$/.test(location)) return;

  const now = Date.now();
  const last = recentStateDispatches.get(location) ?? 0;
  if (now - last < RECENT_DISPATCH_WINDOW_MS) {
    console.log(`state regen skipped for ${location}: dispatched recently (${reason})`);
    return;
  }
  recentStateDispatches.set(location, now);

  after(() => dispatchStateRegeneration(location).catch(err => {
    recentStateDispatches.delete(location);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`state regen dispatch failed for ${location} (${reason}):`, message);
  }));
}

async function dispatchStateRegeneration(location: string) {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!repo || !token) {
    throw new Error("missing GITHUB_REPO or GITHUB_DISPATCH_TOKEN");
  }

  const activeRun = await findActiveWorkflowRun(repo, token);
  if (activeRun) {
    console.log(`state regen skipped for ${location}: workflow already ${activeRun.status} (${activeRun.html_url})`);
    return;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: githubHeaders(token),
    body: JSON.stringify({
      ref: "main",
      inputs: { state: location },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub workflow dispatch failed ${res.status}: ${text.slice(0, 300)}`);
  }

  console.log(`state regen queued for ${location}`);
}
