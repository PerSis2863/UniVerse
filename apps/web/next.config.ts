import path from 'node:path';
import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import { securityHeaders } from './security-headers';

// Lets `next dev` read Cloudflare bindings from wrangler.jsonc (no effect on production builds).
if (process.env.NODE_ENV === 'development') initOpenNextCloudflareForDev();

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  fallbacks: {
    document: '/offline',
  },
  workboxOptions: {
    skipWaiting: true,
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-webfonts',
          expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'google-fonts-stylesheets',
          expiration: { maxEntries: 4, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      {
        // API responses are per-user (grades, messages, billing): never store them on the device,
        // so nothing leaks between people sharing a computer and plan changes show immediately.
        urlPattern: /\/api\//,
        handler: 'NetworkOnly',
      },
    ],
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Dependencies are installed by pnpm at the workspace root; trace server files from there so the
  // Cloudflare build (OpenNext) finds every file it needs.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // Cloudflare Workers have no built-in image optimizer (it would need the paid Images binding),
    // so images are served as-is.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withPWA(nextConfig);
