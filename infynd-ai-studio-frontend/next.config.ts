import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/lf/:path*",
        destination: "http://localhost:8000/lf/:path*",
      },
      // Proxy Langflow API calls to the mounted path
      {
        source: "/api/v1/auto_login",
        destination: "http://localhost:8000/lf/api/v1/auto_login",
      },
      {
        source: "/api/v1/version",
        destination: "http://localhost:8000/lf/api/v1/version",
      },
      {
        source: "/api/v1/projects/:path*",
        destination: "http://localhost:8000/lf/api/v1/projects/:path*",
      },
      {
        source: "/api/v1/flows/:path*",
        destination: "http://localhost:8000/lf/api/v1/flows/:path*",
      },
      {
        source: "/api/v1/variables/:path*",
        destination: "http://localhost:8000/lf/api/v1/variables/:path*",
      },
      {
        source: "/api/v1/session/:path*",
        destination: "http://localhost:8000/lf/api/v1/session/:path*",
      },
      {
        source: "/api/v1/health_check",
        destination: "http://localhost:8000/lf/api/v1/health_check",
      },
      {
        source: "/health_check",
        destination: "http://localhost:8000/lf/health_check",
      },
      {
        source: "/api/v1/config",
        destination: "http://localhost:8000/lf/api/v1/config",
      },
      {
        source: "/api/v1/components/:path*",
        destination: "http://localhost:8000/lf/api/v1/components/:path*",
      },
      {
        source: "/api/v1/store/:path*",
        destination: "http://localhost:8000/lf/api/v1/store/:path*",
      },
      {
        source: "/api/v1/users/:path*",
        destination: "http://localhost:8000/lf/api/v1/users/:path*",
      },
      // Catch-all for all other Infynd API calls
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:8000/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
