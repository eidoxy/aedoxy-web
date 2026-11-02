import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TRD section 12: deployed as a Docker image running `node server.js`.
  output: "standalone",
  cacheComponents: true,
  // Site image uploads (admin > Pengaturan situs) are at most 1 MB; the default 1 MB cap would reject them with the form overhead.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
