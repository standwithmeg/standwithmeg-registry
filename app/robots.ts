import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = siteUrl.replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/report", "/survey", "/actors", "/about", "/contact", "/privacy", "/sponsor", "/partners", "/court-actor-update", "/connect"],
        disallow: ["/admin", "/api", "/swm-login", "/connect/auth", "/connect/requests"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
