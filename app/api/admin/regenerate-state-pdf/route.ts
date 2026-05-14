import { createServerSupabaseClient } from "../../../../lib/supabase";
import { isAdminEmail } from "../../../../lib/require-auth";

const WORKFLOW_FILE = "regenerate-state-pdfs.yml";

type GitHubWorkflowRun = {
  id: number;
  html_url: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  run_number: number;
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
  const { data: { user } } = await supabase.auth.getUser();
  return !!user?.email && isAdminEmail(user.email);
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

async function getWorkflowRun(repo: string, token: string, runId: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}`, {
    headers: githubHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("GitHub workflow run status failed:", res.status, text);
    return Response.json({
      error: `GitHub workflow status failed: ${res.status}`,
      detail: text.slice(0, 300),
    }, { status: 502 });
  }
  const run = await res.json() as GitHubWorkflowRun;
  return Response.json({
    ...runPayload(run),
    workflow_url: workflowUrl(repo),
  });
}

/**
 * POST /api/admin/regenerate-state-pdf
 * Body: { state: "MD" }   // "" or omitted => regenerate every 30+ state
 *
 * Admin-only. Triggers the "Regenerate State PDFs and Actor Shares" GitHub Actions workflow
 * via workflow_dispatch. The workflow itself pulls data from Supabase,
 * regenerates the PDF(s) plus public court actor share pages, and commits them
 * back to main — Vercel auto-deploys.
 *
 * Requires env vars:
 *   GITHUB_REPO           e.g. "standwithmeg/standwithmeg-registry"
 *   GITHUB_DISPATCH_TOKEN a PAT with `repo:workflow` scope
 */
export async function POST(request: Request) {
  // 1. Auth — must be a signed-in admin
  if (!(await requireAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let state = "";
  try {
    const body = await request.json();
    state = String(body?.state || "").trim().toUpperCase();
  } catch {
    // empty body = regenerate all
  }
  if (state && !/^[A-Z]{2}$/.test(state)) {
    return Response.json({ error: "State must be a 2-letter code" }, { status: 400 });
  }

  // 3. Env check
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!repo || !token) {
    return Response.json({
      error: "Server not configured: missing GITHUB_REPO or GITHUB_DISPATCH_TOKEN",
    }, { status: 500 });
  }

  // 4. Dispatch the workflow
  const dispatchStartedAt = new Date(Date.now() - 5000).toISOString();
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: githubHeaders(token),
    body: JSON.stringify({
      ref:    "main",
      inputs: { state },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GitHub dispatch failed:", res.status, text);
    return Response.json({
      error: `GitHub workflow dispatch failed: ${res.status}`,
      detail: text.slice(0, 300),
    }, { status: 502 });
  }

  // GitHub dispatch returns 204 without a run id. Wait briefly, then look up
  // the newly-created run so the admin UI can track queued/running/done/failed.
  await new Promise(resolve => setTimeout(resolve, 1500));
  const run = await findRecentWorkflowRun(repo, token, dispatchStartedAt);

  return Response.json({
    success: true,
    state:   state || "all-30plus",
    message: state
      ? `Regeneration of ${state}.pdf and ${state} court actor share pages queued. Allow ~2–3 min for the workflow to finish.`
      : "Regeneration of every 30+ state PDF and court actor share page queued. Allow ~5–10 min.",
    workflow_url: workflowUrl(repo),
    ...(run ? runPayload(run) : {}),
  });
}

/**
 * GET /api/admin/regenerate-state-pdf?run_id=123
 *
 * Admin-only status check for a workflow run returned by POST.
 */
export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("run_id") ?? "";
  if (!/^\d+$/.test(runId)) {
    return Response.json({ error: "run_id is required" }, { status: 400 });
  }

  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!repo || !token) {
    return Response.json({
      error: "Server not configured: missing GITHUB_REPO or GITHUB_DISPATCH_TOKEN",
    }, { status: 500 });
  }

  return getWorkflowRun(repo, token, runId);
}
