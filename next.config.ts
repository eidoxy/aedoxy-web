import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TRD section 12: deployed as a Docker image running `node server.js`.
  output: "standalone",
  cacheComponents: true,
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
