import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Electron loads the generated files locally, so the UI must be self-contained.
  output: "export",
  // Static files must be relative to index.html when Electron uses file:// URLs.
  assetPrefix: process.env.NODE_ENV === "production" ? "./" : undefined,
};

export default nextConfig;
