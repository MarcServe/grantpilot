import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production: ensure strict mode and no dev-only behavior
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/get-started", destination: "/sign-up", permanent: false },
      { source: "/start", destination: "/sign-up", permanent: false },
      { source: "/join", destination: "/sign-up", permanent: false },
      { source: "/register", destination: "/sign-up", permanent: false },
      { source: "/create-account", destination: "/sign-up", permanent: false },
      { source: "/signup", destination: "/sign-up", permanent: false },
      { source: "/sign_up", destination: "/sign-up", permanent: false },
      { source: "/login", destination: "/sign-in", permanent: false },
      { source: "/signin", destination: "/sign-in", permanent: false },
      { source: "/sign_in", destination: "/sign-in", permanent: false },
      { source: "/log-in", destination: "/sign-in", permanent: false },
      { source: "/pricing", destination: "/billing", permanent: false },
      { source: "/plans", destination: "/billing", permanent: false },
      { source: "/contact", destination: "/feedback", permanent: false },
      { source: "/contact-us", destination: "/feedback", permanent: false },
      { source: "/support", destination: "/feedback", permanent: false },
      { source: "/help", destination: "/feedback", permanent: false },
      { source: "/book-demo", destination: "/feedback", permanent: false },
    ];
  },
  turbopack: {
    root: process.cwd(),
  },
  // Optional: use "standalone" for Docker/self-hosted to reduce output size
  // output: "standalone",
};

export default nextConfig;
