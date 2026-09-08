import type { NextConfig } from "next";

const nextConfig: NextConfig = { devIndicators: false, async headers() { return [{ source: "/media/frames/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }]; } };

export default nextConfig;
