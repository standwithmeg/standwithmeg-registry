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
};

export default nextConfig;
