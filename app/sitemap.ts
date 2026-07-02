import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const baseUrl = siteUrl.replace(/\/+$/, "");
  const routes = [
    { path: "/", changeFrequency: "weekly", priority: 0.8 },
    { path: "/survey", changeFrequency: "weekly", priority: 1 },
    { path: "/report", changeFrequency: "daily", priority: 0.9 },
    { path: "/actors", changeFrequency: "daily", priority: 0.85 },
    { path: "/about", changeFrequency: "monthly", priority: 0.55 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.5 },
    { path: "/sponsor", changeFrequency: "weekly", priority: 0.7 },
    { path: "/partners", changeFrequency: "weekly", priority: 0.65 },
    { path: "/partners/how-to-sell", changeFrequency: "monthly", priority: 0.5 },
    { path: "/court-actor-update", changeFrequency: "monthly", priority: 0.5 },
    { path: "/tools/fraud-packet", changeFrequency: "monthly", priority: 0.6 },
    { path: "/tools/fraud-kit", changeFrequency: "monthly", priority: 0.55 },
    { path: "/connect", changeFrequency: "monthly", priority: 0.45 },
    { path: "/connect/sponsor", changeFrequency: "monthly", priority: 0.4 },
  ] as const;

  return routes.map(route => ({
    url: `${baseUrl}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
