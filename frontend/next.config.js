/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // Proxy Firebase auth handler through our domain so mobile redirect flow
  // stays same-origin (avoids third-party cookie blocking on mobile browsers)
  rewrites: async () => [
    {
      source: "/__/auth/:path*",
      destination: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "gg-ai-fed66"}.firebaseapp.com/__/auth/:path*`,
    },
  ],
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "X-DNS-Prefetch-Control",
          value: "on",
        },
      ],
    },
    {
      source: "/fonts/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
  ],
};

module.exports = nextConfig;
