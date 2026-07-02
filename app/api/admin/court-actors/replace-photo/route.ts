import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { isAdminEmail } from "../../../../../lib/require-auth";
import { PhotoValidationError, validateCourtActorPhoto } from "../../../../../lib/court-actor-photo-upload";
import { runActorPhotoReplace } from "../../../../../lib/court-actor-deploy-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email);
}

export async function POST(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const form = await request.formData();
    const slug = String(form.get("slug") ?? "").trim();
    const stateAbbr = String(form.get("state_abbr") ?? "").trim().toUpperCase();
    const photo = form.get("photo");

    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(slug)) {
      return Response.json({ error: "slug must be lowercase words separated by underscores." }, { status: 400 });
    }
    if (!/^[A-Z]{2}$/.test(stateAbbr)) {
      return Response.json({ error: "state_abbr must be a 2-letter state code." }, { status: 400 });
    }
    if (!(photo instanceof File)) {
      return Response.json({ error: "photo file is required." }, { status: 400 });
    }

    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!repo || !token) {
      return Response.json({ error: "Server not configured: missing GITHUB_REPO or GITHUB_DISPATCH_TOKEN." }, { status: 500 });
    }

    const photoBuffer = await validateCourtActorPhoto(photo);
    const result = await runActorPhotoReplace({ repo, token, slug, stateAbbr, photoBuffer });

    return Response.json(result);
  } catch (err) {
    console.error("POST /api/admin/court-actors/replace-photo error:", err);
    if (err instanceof PhotoValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json({ error: err instanceof Error ? err.message : "Photo replacement failed." }, { status: 500 });
  }
}
