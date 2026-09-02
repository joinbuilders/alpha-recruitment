import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The worker decides what's available offline, so it must never be
        // served from cache itself — otherwise a device keeps an old caching
        // policy (and an old precache list) until the browser feels like
        // revalidating. Registration also passes updateViaCache: "none".
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
