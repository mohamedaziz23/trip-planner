import type { NextConfig } from "next";

// The Express API. Every /api/v1 and /uploads request is proxied to it, so the
// browser only ever talks to this origin: the refresh cookie stays first-party
// and the service worker can cache API reads.
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Data is loaded on the client (IndexedDB + API) so the app works offline;
  // Cache Components / partial prefetching are not needed for that model.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` },
      { source: "/uploads/:path*", destination: `${API_URL}/uploads/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
