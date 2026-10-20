import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/** Clerk's Frontend API host is base64-encoded inside the publishable key. */
function clerkFrontendApi(): string[] {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const encoded = key.split("_")[2];
  if (!encoded) return [];
  try {
    const host = Buffer.from(encoded, "base64").toString("utf-8").replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) && host.includes(".") ? [`https://${host}`] : [];
  } catch {
    return [];
  }
}

const clerk = [...clerkFrontendApi(), "https://*.clerk.accounts.dev", "https://challenges.cloudflare.com"];
const razorpay = ["https://checkout.razorpay.com", "https://api.razorpay.com", "https://lumberjack.razorpay.com"];

const csp = [
  "default-src 'self'",
  // Next.js inlines bootstrap scripts; dev mode additionally needs eval for HMR
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} ${["https://checkout.razorpay.com", ...clerk].join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${[...razorpay, ...clerk, "https://api.mapbox.com", "https://events.mapbox.com"].join(" ")} ${isDev ? "ws:" : ""}`,
  `frame-src ${[...razorpay, ...clerk].join(" ")}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Riders and customers need geolocation; nothing needs camera/microphone
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(self \"https://checkout.razorpay.com\")" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    "@startup/api-client",
    "@startup/config",
    "@startup/contracts",
    "@startup/core",
    "@startup/database",
    "@startup/integrations",
  ],
  // Server-only packages that must not be bundled into client or edge code
  serverExternalPackages: ["pg", "web-push"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The service worker must always be revalidated or users get stuck on old code
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      { source: "/icons/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "public, max-age=3600" }] },
    ];
  },
};

export default nextConfig;
