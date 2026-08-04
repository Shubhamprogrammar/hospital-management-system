import type { NextConfig } from "next";

/**
 * Backend API origin. The browser never talks to this host directly — every
 * /api/v1/* request is proxied through the Next.js app so session cookies are
 * first-party on the app's own domain (required by the auth proxy/middleware
 * and by third-party-cookie blockers on Vercel).
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
