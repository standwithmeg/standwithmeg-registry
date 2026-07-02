import { createServerSupabaseClient } from "../../../../lib/supabase";
import { isAdminEmail } from "../../../../lib/require-auth";
import {
  scanPhotoIntake,
  matchPhotosToActors,
  downloadGmailAttachments,
  loadPhotoBuffers,
  markPhotoIntakeItemProcessed,
  verifyLiveShareAssets,
} from "../../../../lib/photo-intake";
import { runPhotoIntakeDeploy } from "../../../../lib/court-actor-deploy-pipeline";
import { PhotoValidationError } from "../../../../lib/court-actor-photo-upload";
import type { PhotoIntakeItem } from "../../../../lib/photo-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email);
}

function sanitizeId(id: string): string {
  return id.replace(/\0/g, "");
}

function photoItemRank(item: PhotoIntakeItem): number {
  const sourceRank = item.source === "desktop" ? 2 : 0;
  const confidenceRank = item.confidence === "high" ? 2 : item.confidence === "medium" ? 1 : 0;
  return sourceRank + confidenceRank;
}

function dedupeReadyPhotoItems(items: PhotoIntakeItem[]): PhotoIntakeItem[] {
  const byActor = new Map<string, PhotoIntakeItem>();
  for (const item of items) {
    const candidate = item.candidates[0];
    if (!candidate) continue;
    const key = `${candidate.state_abbr}:${candidate.slug}`;
    const existing = byActor.get(key);
    if (!existing) {
      byActor.set(key, item);
      continue;
    }
    const rank = photoItemRank(item);
    const existingRank = photoItemRank(existing);
    if (rank > existingRank) {
      byActor.set(key, item);
      continue;
    }
    if (rank === existingRank && new Date(item.created_at).getTime() > new Date(existing.created_at).getTime()) {
      byActor.set(key, item);
    }
  }
  return Array.from(byActor.values());
}

export async function GET(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source");
    let items = await scanPhotoIntake();
    if (source === "desktop" || source === "gmail") {
      items = items.filter(i => i.source === source);
    }

    return Response.json({
      ok: true,
      items,
      drop_folder: process.env.COURT_ACTOR_PHOTO_DROP_FOLDER?.trim() || null,
    });
  } catch (err) {
    console.error("GET /api/admin/photo-intake error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Failed to scan photo intake." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: "refresh" | "process" | "process-one";
      dry_run?: boolean;
      id?: string;
      candidate_index?: number;
    };
    const dryRun = body?.dry_run === true;
    const action = body?.action ?? "refresh";

    if (action === "refresh") {
      let items = await scanPhotoIntake();
      if (body?.id) {
        const targetId = sanitizeId(body.id);
        items = items.filter(i => i.id === targetId);
      }
      return Response.json({ ok: true, dry_run: dryRun, items });
    }

    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!repo || !token) {
      return Response.json({ error: "Server not configured: missing GITHUB_REPO or GITHUB_DISPATCH_TOKEN." }, { status: 500 });
    }

    if (action === "process-one") {
      if (!body?.id) {
        return Response.json({ error: "id is required for process-one." }, { status: 400 });
      }
      const targetId = sanitizeId(body.id);
      let items = await scanPhotoIntake();
      items = items.filter(i => i.id === targetId);
      if (items.length === 0) {
        // The file may have been moved; try a second pass without requiring the file to still exist.
        items = await matchPhotosToActors([{
          id: targetId,
          source: targetId.startsWith("gmail:") ? "gmail" : "desktop",
          filename: targetId.split("/").pop() ?? targetId,
          display_name_guess: "",
          state_abbr_guess: null,
          file_path: null,
          message_id: null,
          attachment_id: null,
          buffer: null,
          status: "unmatched",
          confidence: "low",
          candidates: [],
          review_notes: "Item no longer on disk; re-matching from id only.",
          created_at: new Date().toISOString(),
        }]);
      }
      if (items.length === 0) {
        return Response.json({ error: "Photo intake item not found." }, { status: 404 });
      }

      const item = items[0];
      const candidateIndex = typeof body.candidate_index === "number" ? body.candidate_index : 0;
      const candidate = item.candidates[candidateIndex];
      if (!candidate) {
        return Response.json({ error: "No candidate actor selected." }, { status: 400 });
      }

      if (!item.buffer) {
        // Re-load buffers if needed (e.g. Gmail attachment was not downloaded in scan).
        const withBuffers = item.source === "gmail"
          ? await downloadGmailAttachments([item])
          : await loadPhotoBuffers([item]);
        if (!withBuffers[0]?.buffer) {
          return Response.json({ error: "Could not load photo buffer." }, { status: 400 });
        }
        item.buffer = withBuffers[0].buffer;
      }

      if (dryRun) {
        return Response.json({
          ok: true,
          dry_run: true,
          would: "deploy or replace photo",
          item,
          candidate,
        });
      }

      try {
        const deployResult = await runPhotoIntakeDeploy({
          repo,
          token,
          candidate,
          photoBuffer: item.buffer,
        });
        const verification = await verifyLiveShareAssets(candidate.state_abbr, candidate.slug);
        await markPhotoIntakeItemProcessed(item, candidate, "Processed from admin photo intake.");
        return Response.json({
          ok: true,
          deploy: deployResult,
          verification,
        });
      } catch (err) {
        if (err instanceof PhotoValidationError) {
          return Response.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }
    }

    if (action === "process") {
      const items = await scanPhotoIntake();
      const toProcess = dedupeReadyPhotoItems(
        items.filter(i => i.status === "matched" && i.candidates[0] && !i.candidates[0].photo_url)
      );
      const results: Array<{
        id: string;
        ok: boolean;
        skipped?: boolean;
        error?: string;
        deploy?: unknown;
        verification?: unknown;
      }> = [];

      for (const item of toProcess) {
        const candidate = item.candidates[0];
        if (!candidate) {
          results.push({ id: item.id, ok: false, skipped: true, error: "No candidate actor." });
          continue;
        }
        if (!item.buffer) {
          results.push({ id: item.id, ok: false, skipped: true, error: "No photo buffer loaded." });
          continue;
        }
        if (dryRun) {
          results.push({ id: item.id, ok: true, skipped: false, deploy: { dry_run: true, candidate } });
          continue;
        }
        try {
          const deployResult = await runPhotoIntakeDeploy({
            repo,
            token,
            candidate,
            photoBuffer: item.buffer,
          });
          const verification = await verifyLiveShareAssets(candidate.state_abbr, candidate.slug);
          await markPhotoIntakeItemProcessed(item, candidate, "Processed from admin photo intake batch.");
          results.push({ id: item.id, ok: true, deploy: deployResult, verification });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({ id: item.id, ok: false, error: message });
        }
      }

      return Response.json({ ok: true, dry_run: dryRun, processed: results.length, results });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("POST /api/admin/photo-intake error:", err);
    if (err instanceof PhotoValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json({ error: err instanceof Error ? err.message : "Photo intake processing failed." }, { status: 500 });
  }
}
