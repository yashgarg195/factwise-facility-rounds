import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML export: the app has no server code, so it runs on any static host
  // (Vercel, Render Static Site) and never sleeps on a free tier.
  output: "export",
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
