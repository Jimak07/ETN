import path from "node:path";
import { fileURLToPath } from "node:url";

// Pin the tracing root to this project: without it Next infers the workspace
// root from the nearest lockfile, which can be a parent directory.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: projectRoot,
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Projects inside synced folders (OneDrive/Dropbox) get a constant stream
      // of filesystem events from build output, which makes the dev watcher
      // recompile in a loop and turns requests into multi-second waits.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.next/**", "**/.git/**"],
      };
    }
    return config;
  },
};

export default nextConfig;
