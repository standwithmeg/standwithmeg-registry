import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // Next.js, generated court-actor share pages, and Vercel's runtime scripts
  // currently require inline/eval allowances. Keep the policy explicit enough
  // for browser protection while avoiding a launch-blocking CSP regression.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "media-src 'self' data: blob: https:",
  "form-action 'self' https:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // pdfkit reads Helvetica.afm from node_modules at runtime — must not be webpack-bundled.
  serverExternalPackages: ["pdfkit"],
  // Court-actor photos/slides live under public/court-actors (~870MB). Exclude heavy
  // assets from API bundles but keep manifest.json — /api/survey/court-actors reads
  // it to attach photo_url + share_url to every public actor card.
  // private-docs/ holds the non-deployable Shawn source archive and must never
  // enter page or API file traces, server bundles, or static output.
  outputFileTracingExcludes: {
    "/*": ["./private-docs/**/*"],
    "/**/*": ["./private-docs/**/*"],
    "/api/**/*": [
      "./private-docs/**/*",
      "./public/court-actors/**/*.jpg",
      "./public/court-actors/**/*.jpeg",
      "./public/court-actors/**/*.png",
      "./public/court-actors/**/*.webp",
      "./public/court-actors/**/share.html",
      "./public/court-actors/**/spec.json",
      "./public/court-actors/**/.regen-cache.json",
    ],
    "/api/*": [
      "./private-docs/**/*",
      "./public/court-actors/**/*.jpg",
      "./public/court-actors/**/*.jpeg",
      "./public/court-actors/**/*.png",
      "./public/court-actors/**/*.webp",
      "./public/court-actors/**/share.html",
      "./public/court-actors/**/spec.json",
      "./public/court-actors/**/.regen-cache.json",
    ],
  },
  async redirects() {
    return [
      { source: "/submit", destination: "/survey", permanent: true },
      { source: "/submit/:path*", destination: "/survey/:path*", permanent: true },
      { source: "/impact", destination: "/report", permanent: true },
      { source: "/impact/:path*", destination: "/report/:path*", permanent: true },
      { source: "/connections", destination: "/connect", permanent: true },
      { source: "/connections/:path*", destination: "/connect/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Court-actor portrait + share assets need CORS headers so html2canvas
      // (used by the Save/Share buttons in share.html on iOS Safari) can read
      // the resulting canvas without throwing "The operation is insecure".
      {
        source: "/court-actors/:path*",
        headers: [
          ...securityHeaders,
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
