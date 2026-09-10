import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";

const nextConfig: NextConfig = {
  // Let parallel local QA runs keep their generated output separate from the app.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Inlined into the compiled registration client. Each build installs its own
  // complete shell cache; an interrupted replacement leaves the active one intact.
  env: { NEXT_PUBLIC_OFFLINE_BUILD: randomUUID() },
  devIndicators: false,
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Content-Type", value: "application/javascript; charset=utf-8" }, { key: "Service-Worker-Allowed", value: "/" }] }];
  },
  allowedDevOrigins: ["127.0.0.1", ...(process.env.DEV_ALLOWED_ORIGINS?.split(",").map(host => host.trim()).filter(Boolean) ?? [])]
};

export default nextConfig;
