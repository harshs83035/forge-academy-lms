import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  turbopack: { root: path.resolve(__dirname) },
  serverExternalPackages: ["pg", "bcryptjs", "pdf-lib", "qrcode"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "fullscreen=(), camera=(self), microphone=()" },
        ],
      },
    ];
  },
};
export default config;
