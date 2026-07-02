import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { isAdminEmail } from "../../../../../lib/require-auth";
import { PhotoValidationError, validateCourtActorPhoto } from "../../../../../lib/court-actor-photo-upload";
import { runActorDeploy } from "../../../../../lib/court-actor-deploy-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeployRequestBody = {
  slug: string;
  stateAbbr: string;
  displayName: string;
  photoBuffer: Buffer | null;
};

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email);
}

async function loadPhotoSource(photoSource: string | undefined): Promise<Buffer | null> {
  const source = photoSource?.trim();
  if (!source) return null;
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, { cache: "no-store" });
    if (!res.ok) throw new Error(`Photo URL failed: HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`Photo URL did not return an image (${contentType}).`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Photo source must be an image URL. Local file paths are not readable from production; use the photo upload field instead.");
}

async function parseDeployRequest(request: Request): Promise<DeployRequestBody> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const photo = form.get("photo");
    return {
      slug: String(form.get("slug") ?? "").trim(),
      stateAbbr: String(form.get("state_abbr") ?? "").trim().toUpperCase(),
      displayName: String(form.get("display_name") ?? "").trim().replace(/\s+/g, " "),
      photoBuffer: photo instanceof File && photo.size > 0 ? await validateCourtActorPhoto(photo) : null,
    };
  }

  const body = await request.json().catch(() => ({}));
  return {
    slug: String(body?.slug ?? "").trim(),
    stateAbbr: String(body?.state_abbr ?? "").trim().toUpperCase(),
    displayName: String(body?.display_name ?? "").trim().replace(/\s+/g, " "),
    photoBuffer: await loadPhotoSource(typeof body?.photo_source === "string" ? body.photo_source : undefined),
  };
}

export async function POST(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }
    const { slug, stateAbbr, displayName, photoBuffer } = await parseDeployRequest(request);

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

    const result = await runActorDeploy({ repo, token, slug, stateAbbr, displayName, photoBuffer });

    return Response.json(result);
  } catch (err) {
    console.error("POST /api/admin/court-actors/deploy error:", err);
    if (err instanceof PhotoValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json({ error: err instanceof Error ? err.message : "Deploy failed." }, { status: 500 });
  }
}
