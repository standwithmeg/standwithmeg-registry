import { createServerSupabaseClient } from "../../../../lib/supabase";
import { isAdminEmail } from "../../../../lib/require-auth";

/**
 * POST /api/admin/regenerate-state-pdf
 * Body: { state: "MD" }   // "" or omitted => regenerate every 30+ state
 *
 * Admin-only. Triggers the "Regenerate State PDFs" GitHub Actions workflow
 * via workflow_dispatch. The workflow itself pulls data from Supabase,
 * regenerates the PDF(s), and commits them back to main — Vercel auto-deploys.
 *
 * Requires env vars:
 *   GITHUB_REPO           e.g. "standwithmeg/standwithmeg-registry"
 *   GITHUB_DISPATCH_TOKEN a PAT with `repo:workflow` scope
 */
export async function POST(request: Request) {
  // 1. Auth — must be a signed-in admin
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
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
  const url = `https://api.github.com/repos/${repo}/actions/workflows/regenerate-state-pdfs.yml/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept":        "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type":  "application/json",
    },
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

  return Response.json({
    success: true,
    state:   state || "all-30plus",
    message: state
      ? `Regeneration of ${state}.pdf queued. Allow ~2–3 min for the workflow to finish.`
      : "Regeneration of every 30+ state queued. Allow ~5–10 min.",
    workflow_url: `https://github.com/${repo}/actions/workflows/regenerate-state-pdfs.yml`,
  });
}
