import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// connect-src: realtime needs the wss:// scheme explicitly (a schemeless
// host-source does not reliably match WebSocket connections). In dev we also
// allow the localhost HMR/RSC sockets so Turbopack's runtime works under CSP.
// CSP matches hosts literally — "localhost" does NOT also match "127.0.0.1" —
// and the local Supabase CLI's default NEXT_PUBLIC_SUPABASE_URL is
// http://127.0.0.1:54321, so both loopback forms must be listed or the
// Realtime websocket silently gets blocked (confirmed via a real browser
// console during the E2E audit: CSP violation on the 127.0.0.1 socket).
const connectSrc = [
  "'self'",
  "*.supabase.co",
  "wss://*.supabase.co",
  "api.ycloud.com",
  "openrouter.ai",
  "services.leadconnectorhq.com",
  ...(isDev
    ? ["ws://localhost:*", "http://localhost:*", "ws://127.0.0.1:*", "http://127.0.0.1:*"]
    : []),
].join(" ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: *.supabase.co",
      "media-src 'self' blob: *.supabase.co",
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV !== "production" && {
    experimental: {
      mcpServer: true,
    },
  }),
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
  // Serve the app icon for legacy /favicon.ico probes (avoids a 404).
  rewrites: async () => [{ source: "/favicon.ico", destination: "/icon.png" }],
};

export default nextConfig;
