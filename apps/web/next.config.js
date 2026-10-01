/** @type {import('next').NextConfig} */

// Rewrites are resolved at build time, so they target the stable in-cluster
// service names created by the Helm chart (override at build if needed).
const LIBRECHAT_URL = process.env.LIBRECHAT_INTERNAL_URL || "http://librechat:3080";
const OTEL_ENDPOINT = process.env.OTEL_COLLECTOR_INTERNAL_URL || "http://otel-collector:4318";

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: "2mb",
    },
    // Agent frameworks with native/OTel internals must stay external to the bundler.
    serverComponentsExternalPackages: [
      "@mastra/core",
      "@mastra/langfuse",
      "@mastra/observability",
      "llamaindex",
      "@llamaindex/core",
      "@llamaindex/anthropic",
      "@llamaindex/openai",
      "@llamaindex/env",
      "pdf-parse",
    ],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
  // LibreChat is served same-origin through this app: every path that is not
  // a Next.js page or API route falls through to LibreChat. This keeps its
  // auth cookies first-party inside the embedded iframe.
  rewrites: async () => ({
    beforeFiles: [
      { source: "/otel/v1/:path*", destination: `${OTEL_ENDPOINT}/v1/:path*` },
    ],
    fallback: [{ source: "/:path*", destination: `${LIBRECHAT_URL}/:path*` }],
  }),
};

module.exports = nextConfig;
