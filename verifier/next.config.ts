import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Same Tailwind 4 wiring as the root app: Turbopack compiles globals.css directly.
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
