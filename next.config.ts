import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/submit", destination: "/survey", permanent: true },
      { source: "/submit/:path*", destination: "/survey/:path*", permanent: true },
      { source: "/impact", destination: "/report", permanent: true },
      { source: "/impact/:path*", destination: "/report/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      // Court-actor portrait + share assets need CORS headers so html2canvas
      // (used by the Save/Share buttons in share.html on iOS Safari) can read
      // the resulting canvas without throwing "The operation is insecure".
      {
        source: "/court-actors/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
