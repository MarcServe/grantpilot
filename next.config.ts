import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production: ensure strict mode and no dev-only behavior
  reactStrictMode: true,
  // Optional: use "standalone" for Docker/self-hosted to reduce output size
  // output: "standalone",
};

export default nextConfig;
