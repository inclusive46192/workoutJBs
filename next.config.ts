import type { NextConfig } from "next";
import path from "node:path";

/**
 * Two build modes:
 *
 * - default (`npm run build`)  -> server build for Netlify, incl. Supabase sync
 * - `npm run build:offline`    -> fully static folder in ./out. No server,
 *                                 no Netlify, no Supabase required.
 */
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  ...(isStaticExport
    ? {
        output: "export" as const,
        // Static hosting has no image optimizer available.
        images: { unoptimized: true },
        // Emits /lite/index.html so the route resolves without a router.
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
