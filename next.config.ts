import type { NextConfig } from "next";

/* Un valor por deploy: lo usan Next para detectar versiones mezcladas y el service worker para sus caches.
   Queda en el entorno para que todos los procesos del build vean el mismo. */
const version = process.env.NEXT_PUBLIC_VERSION || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_DEPLOYMENT_ID || `local-${Date.now().toString(36)}`;
process.env.NEXT_PUBLIC_VERSION = version;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  deploymentId: version,
  env: { NEXT_PUBLIC_VERSION: version },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self)" },
        ],
      },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
      /* Sin hash en el nombre: un día fresco y después revalida, para que un dato corregido llegue */
      { source: "/data/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      { source: "/ciudad/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
    ];
  },
};

export default nextConfig;
