import JSZip from "jszip";
import { publicAssetOrigin } from "../../../../../../lib/court-actor-public-assets";
import { requireFounderApi } from "../../../../../../lib/social-post/admin-auth";
import { findQueueById } from "../../../../../../lib/social-post/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireFounderApi();
    const { id } = await context.params;
    const row = await findQueueById(id);
    if (!row) {
      return Response.json({ error: "Post not found." }, { status: 404 });
    }

    const pkg = row.package_json;
    const zip = new JSZip();
    const folder = zip.folder(pkg.actor_slug) ?? zip;

    folder.file("caption-facebook.txt", pkg.captions.facebook);
    folder.file("caption-instagram.txt", pkg.captions.instagram);
    folder.file("caption-x.txt", pkg.captions.x);
    folder.file("share-to-professional-page.txt", pkg.captions.firstComment);
    if (pkg.captions.legislatorComment) {
      folder.file("legislator-tags.txt", pkg.captions.legislatorComment);
    }
    folder.file("location-tag.txt", pkg.captions.locationTag);
    folder.file("package.json", JSON.stringify(pkg, null, 2));

    const origin = publicAssetOrigin();
    for (const frame of pkg.frames) {
      const frameUrl = `${origin}${frame.url.startsWith("/") ? "" : "/"}${frame.url}`;
      try {
        const res = await fetch(frameUrl, { cache: "no-store" });
        if (!res.ok) throw new Error("not found");
        const bytes = new Uint8Array(await res.arrayBuffer());
        folder.file(frame.filename, bytes);
      } catch {
        folder.file(`${frame.filename}.url`, frameUrl);
      }
    }

    const zipBuffer = (await zip.generateAsync({ type: "arraybuffer" })) as ArrayBuffer;
    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    headers.set("Content-Disposition", `attachment; filename="${pkg.actor_slug}-social-post.zip"`);
    return new Response(zipBuffer, { headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Founder access required.") {
      return Response.json({ error: message }, { status: 403 });
    }
    console.error("GET download social post error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
