import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let parallel local QA runs keep their generated output separate from the app.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", ...(process.env.DEV_ALLOWED_ORIGINS?.split(",").map(host => host.trim()).filter(Boolean) ?? [])]
};

export default nextConfig;
