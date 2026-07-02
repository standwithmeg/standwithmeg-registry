import type { SocialPostPackage } from "./types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function nl2br(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function publicAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://my.standwithmeg.com")
  ).replace(/\/+$/, "");
}

export type ApprovalEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function buildApprovalEmail(args: {
  to: string;
  package: SocialPostPackage;
  queueId: string;
  reviewNotes?: string | null;
}): ApprovalEmail {
  const { to, package: pkg, queueId, reviewNotes } = args;
  const appUrl = publicAppUrl();
  const adminUrl = `${appUrl}/admin`;
  const approveUrl = `${appUrl}/api/admin/social-post-queue/${queueId}/approve?source=email&publish=true`;
  const rejectUrl = `${appUrl}/api/admin/social-post-queue/${queueId}/reject?source=email`;

  const subject = `Approve post: ${pkg.role} ${pkg.actor_name} · ${pkg.state_abbr}`;

  const legislatorLines = pkg.legislators
    .map(l => {
      const links = [...(l.socials ?? [])];
      if (l.profile_url && !links.some(link => link.url === l.profile_url)) {
        links.unshift({
          platform: l.profile_url.includes("facebook.com")
            ? "Facebook"
            : l.profile_url.includes("instagram.com")
              ? "Instagram"
              : l.profile_url.includes("x.com") || l.profile_url.includes("twitter.com")
                ? "X"
                : "Official",
          handle: l.handle,
          url: l.profile_url,
        });
      }
      const linkHtml = links
        .map(
          link =>
            `<a href="${escapeHtml(link.url)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(link.platform)}${link.handle ? ` ${escapeHtml(link.handle)}` : ""}</a>`,
        )
        .join(" · ");
      return `<li><strong>${escapeHtml(l.title)}</strong> — ${escapeHtml(l.name)}${linkHtml ? `<br>${linkHtml}` : l.handle ? ` (${escapeHtml(l.handle)})` : ""}</li>`;
    })
    .join("");

  const reviewBanner = reviewNotes
    ? `<p style="color:#b45309;background:#fffbeb;border:1px solid #fcd34d;padding:10px;border-radius:6px;"><strong>Needs review:</strong> ${escapeHtml(reviewNotes)}</p>`
    : "";

  const heroPath = pkg.hero_url || pkg.share_url.replace(/share\.html$/, "image_1080.png");
  const heroUrl = heroPath.startsWith("http") ? heroPath : `${appUrl}${heroPath.startsWith("/") ? "" : "/"}${heroPath}`;
  const frameLinks = pkg.frames
    .map(f => `<a href="${appUrl}${f.url}" style="display:inline-block;margin:0 8px 8px 0;font-size:12px;color:#2563eb;text-decoration:underline;">Slide ${f.order}</a>`)
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#666;">Stand With Meg — Court Actor Post Queue</p>
  <h2 style="margin-top:0;">⚠️ ${escapeHtml(pkg.role)} ${escapeHtml(pkg.actor_name)} — ${escapeHtml(pkg.state_abbr)}</h2>
  ${reviewBanner}
  <p>A new court actor has crossed the public threshold and is ready for your review.</p>

  <div style="margin:20px 0;">
    <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700;margin-right:8px;">✅ Approve</a>
    <a href="${rejectUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700;margin-right:8px;">❌ Reject</a>
    <a href="${adminUrl}" style="display:inline-block;background:#e5e7eb;color:#111827;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700;">Open Dashboard</a>
  </div>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

  <h3>Media links</h3>
  <p style="font-size:13px;">
    <a href="${heroUrl}" style="color:#2563eb;text-decoration:underline;">Hero image</a>
    <span style="color:#666;margin:0 8px;">·</span>
    <a href="${appUrl}${pkg.share_url}" style="color:#2563eb;text-decoration:underline;">Share page</a>
  </p>
  <p style="font-size:13px;">Carousel: ${frameLinks}</p>

  <h3>Facebook / Instagram caption</h3>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:16px;border-radius:8px;white-space:pre-wrap;">${nl2br(pkg.captions.facebook)}</div>

  <h3>X caption</h3>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:16px;border-radius:8px;white-space:pre-wrap;">${nl2br(pkg.captions.x)}</div>

  <h3>Share to professional page</h3>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:16px;border-radius:8px;white-space:pre-wrap;">${nl2br(pkg.captions.firstComment)}</div>
  ${pkg.captions.legislatorComment ? `<h3>Legislator tags (FB/IG first comment)</h3>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:16px;border-radius:8px;white-space:pre-wrap;">${nl2br(pkg.captions.legislatorComment)}</div>` : ""}

  <h3>Legislators</h3>
  <ul>${legislatorLines}</ul>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

  <p><strong>Reply to approve or reject</strong><br>
  Just reply with one of these lines:</p>
  <ul>
    <li><code>approve ${escapeHtml(pkg.actor_name)}</code></li>
    <li><code>reject ${escapeHtml(pkg.actor_name)}</code></li>
    <li><code>skip ${escapeHtml(pkg.actor_name)}</code></li>
  </ul>
  <p style="font-size:13px;color:#666;">This email was sent by the Stand With Meg auto-post pipeline.</p>
</body>
</html>`;

  const text = [
    `Stand With Meg — Court Actor Post Queue`,
    ``,
    `${pkg.role} ${pkg.actor_name} — ${pkg.state_abbr}`,
    reviewNotes ? `Needs review: ${reviewNotes}` : "",
    `A new court actor has crossed the public threshold and is ready for your review.`,
    ``,
    `Approve: ${approveUrl}`,
    `Reject: ${rejectUrl}`,
    `Dashboard: ${adminUrl}`,
    `Share page: ${appUrl}${pkg.share_url}`,
    `Hero image: ${heroUrl}`,
    `Carousel slides: ${pkg.frames.map(f => `${appUrl}${f.url}`).join(" / ")}`,
    ``,
    `--- Facebook / Instagram caption ---`,
    pkg.captions.facebook,
    ``,
    `--- X caption ---`,
    pkg.captions.x,
    ``,
    `--- Share to professional page ---`,
    pkg.captions.firstComment,
    ...(pkg.captions.legislatorComment ? ["", `--- Legislator tags ---`, pkg.captions.legislatorComment] : []),
    ``,
    `Reply with: approve ${pkg.actor_name} / reject ${pkg.actor_name} / skip ${pkg.actor_name}`,
  ].join("\n");

  return { to, subject, html, text };
}
