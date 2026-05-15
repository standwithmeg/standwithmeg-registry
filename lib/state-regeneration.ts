import { after } from "next/server";

const WORKFLOW_FILE = "regenerate-state-pdfs.yml";
const RECENT_DISPATCH_WINDOW_MS = 60_000;

const recentStateDispatches = new Map<string, number>();

function githubHeaders(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "standwithmeg-registry",
  };
}

export function queueStateRegeneration(state: string | null | undefined, reason: string) {
  const stateAbbr = String(state ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(stateAbbr)) return;

  const now = Date.now();
  const last = recentStateDispatches.get(stateAbbr) ?? 0;
  if (now - last < RECENT_DISPATCH_WINDOW_MS) {
    console.log(`state regen skipped for ${stateAbbr}: dispatched recently (${reason})`);
    return;
  }
  recentStateDispatches.set(stateAbbr, now);

  after(() => dispatchStateRegeneration(stateAbbr).catch(err => {
    recentStateDispatches.delete(stateAbbr);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`state regen dispatch failed for ${stateAbbr} (${reason}):`, message);
  }));
}

async function dispatchStateRegeneration(stateAbbr: string) {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!repo || !token) {
    throw new Error("missing GITHUB_REPO or GITHUB_DISPATCH_TOKEN");
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: githubHeaders(token),
    body: JSON.stringify({
      ref: "main",
      inputs: { state: stateAbbr },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub workflow dispatch failed ${res.status}: ${text.slice(0, 300)}`);
  }

  console.log(`state regen queued for ${stateAbbr}`);
}
