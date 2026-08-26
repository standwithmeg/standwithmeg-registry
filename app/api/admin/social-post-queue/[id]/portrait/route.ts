import { dispatchStateRegen, runActorPhotoReplace } from "../../../../../../lib/court-actor-deploy-pipeline";
import { PhotoValidationError, validateCourtActorPhoto } from "../../../../../../lib/court-actor-photo-upload";
import { requireFounderApi } from "../../../../../../lib/social-post/admin-auth";
import { findQueueById } from "../../../../../../lib/social-post/db";
import { assessActorPortraitAssets } from "../../../../../../lib/social-post/portrait-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WORKFLOW_FILE = "regenerate-court-actor-shares.yml";

type GitHubWorkflowRun = {
  id: number;
  html_url: string;
  status: string;
  conclusion: string | null;
  created_at: string;
};

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "standwithmeg-registry",
  };
}

function workflowUrl(repo: string) {
  return `https://github.com/${repo}/actions/workflows/${WORKFLOW_FILE}`;
}

async function findRecentWorkflowRun(repo: string, token: string, notBeforeIso: string) {
  const runsUrl = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&branch=main&per_page=10`;
  const res = await fetch(runsUrl, { headers: githubHeaders(token), cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  const notBefore = Date.parse(notBeforeIso);
  const runs = (json.workflow_runs ?? []) as GitHubWorkflowRun[];
  return runs.find(run => Date.parse(run.created_at) >= notBefore) ?? null;
}

async function portraitStatusForRow(row: NonNullable<Awaited<ReturnType<typeof findQueueById>>>) {
  const pkg = row.package_json;
  const fallbackPhoto = pkg.share_url.includes("/court-actors/")
    ? pkg.share_url.replace(/\/share\.html$/, "/image_1080.png")
    : `/court-actors/${row.state_abbr.toLowerCase()}/${row.actor_slug}/image_1080.png`;
  const portrait = await assessActorPortraitAssets(row.state_abbr, row.actor_slug, {}, fallbackPhoto);
  return {
    actor_name: pkg.actor_name,
    actor_slug: row.actor_slug,
    state_abbr: row.state_abbr,
    share_url: pkg.share_url,
    ...portrait,
    needs_regen: portrait.slides_stale || (!portrait.frame_one_live && portrait.share_has_portrait),
  };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireFounderApi();
    const { id } = await context.params;
    const row = await findQueueById(id);
    if (!row) {
      return Response.json({ error: "Post not found." }, { status: 404 });
    }
    return Response.json(await portraitStatusForRow(row));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Founder access required.") {
      return Response.json({ error: message }, { status: 403 });
    }
    console.error("GET social-post portrait status error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireFounderApi();
    const { id } = await context.params;
    const row = await findQueueById(id);
    if (!row) {
      return Response.json({ error: "Post not found." }, { status: 404 });
    }

    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!repo || !token) {
      return Response.json({ error: "Server not configured: missing GITHUB_REPO or GITHUB_DISPATCH_TOKEN." }, { status: 500 });
    }

    const form = await request.formData();
    const photo = form.get("photo");
    const regenOnly = form.get("regen_only") === "true" || form.get("regen_only") === "1";

    let photoMessage: string | null = null;
    let commitUrl: string | null = null;

    if (photo instanceof File && photo.size > 0) {
      const photoBuffer = await validateCourtActorPhoto(photo);
      const replaceResult = await runActorPhotoReplace({
        repo,
        token,
        slug: row.actor_slug,
        stateAbbr: row.state_abbr,
        photoBuffer,
      });
      photoMessage = replaceResult.message;
      commitUrl = replaceResult.commit_url;
    } else if (!regenOnly) {
      return Response.json({ error: "Choose a photo file or use regenerate-only mode." }, { status: 400 });
    } else {
      const dispatchStartedAt = new Date(Date.now() - 5000).toISOString();
      await dispatchStateRegen(repo, token, row.state_abbr);
      await new Promise(resolve => setTimeout(resolve, 1500));
      const run = await findRecentWorkflowRun(repo, token, dispatchStartedAt);
      return Response.json({
        ok: true,
        mode: "regen_only",
        message: `Queued forced slide regeneration for ${row.state_abbr}. Allow 2–3 minutes for GitHub Actions and Vercel deploy, then refresh the queue item.`,
        workflow_url: workflowUrl(repo),
        run_id: run?.id ?? null,
        run_url: run?.html_url ?? null,
        run_status: run?.status ?? null,
        ...(await portraitStatusForRow(row)),
      });
    }

    const dispatchStartedAt = new Date(Date.now() - 5000).toISOString();
    await new Promise(resolve => setTimeout(resolve, 1500));
    const run = await findRecentWorkflowRun(repo, token, dispatchStartedAt);

    return Response.json({
      ok: true,
      mode: "upload_and_regen",
      message: photoMessage
        ? `${photoMessage} When the workflow finishes and deploys, use Refresh queue item here.`
        : "Portrait uploaded. Regeneration queued.",
      commit_url: commitUrl,
      workflow_url: workflowUrl(repo),
      run_id: run?.id ?? null,
      run_url: run?.html_url ?? null,
      run_status: run?.status ?? null,
      ...(await portraitStatusForRow(row)),
    });
  } catch (err: unknown) {
    if (err instanceof PhotoValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Founder access required.") {
      return Response.json({ error: message }, { status: 403 });
    }
    console.error("POST social-post portrait error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
