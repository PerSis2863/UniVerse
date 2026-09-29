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
  // The whiteboard's fonts (14 MB, mostly Chinese/Japanese glyphs) load on demand, not at install.
  publicExcludes: ['!noprecache/**/*', '!excalidraw-assets/**/*', '!legal/**/*'],
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
  webpack(config) {
    // The whiteboard (Excalidraw) loads its fonts from this site instead of its CDN.
    config.module.rules.push({
      test: /[\\/]@excalidraw[\\/]excalidraw[\\/]dist[\\/](prod|dev)[\\/].*\.js$/,
      loader: path.join(__dirname, 'scripts/excalidraw-assets-loader.cjs'),
    });
    return config;
  },
  async headers() {
    const csp = securityHeaders.filter((h) => h.key === 'Content-Security-Policy');
    const rest = securityHeaders.filter((h) => h.key !== 'Content-Security-Policy');
    return [
      { source: '/:path*', headers: rest },
      // Uploaded files and certificate pages send their own, stricter policy.
      { source: '/((?!api/files/|api/core/impact/certificates/).*)', headers: csp },
    ];
  },
};

export default withPWA(nextConfig);
