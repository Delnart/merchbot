import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully client-side app: static export lets Render serve it as a free
  // static site from a CDN — no server process, no cold starts.
  output: "export",
};

export default nextConfig;
