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
  // Off: these fetched every page a second time in the background, just to store it for offline
  // use, doubling the Worker requests of each click. Pages are still cached as they load.
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  // Don't reload the page when the connection comes back (it wiped whatever people were typing);
  // OfflineBar refetches the data on screen instead.
  reloadOnOnline: false,
  // The whiteboard's fonts (14 MB, mostly Chinese/Japanese glyphs) load on demand, not at install.
  // `_headers` is Cloudflare's config file and is never served: listing it made every install fail
  // (a 404), so from 29 Sep no device got a working service worker. Lookup data loads when needed.
  publicExcludes: ['!noprecache/**/*', '!excalidraw-assets/**/*', '!legal/**/*', '!google*.html', '!robots.txt', '!voice-worklet.js', '!sitemap.xml', '!offline.html', '!.well-known/**/*', '!_headers', '!data/**/*', '!assets/**/*'],
  // Shown for pages not saved on the device when offline: a plain static page (public/offline.html,
  // served at /offline by Cloudflare's free static files, not the Worker).
  fallbacks: {
    document: '/offline',
  },
  // Don't download the start page a second time at install just to store it: it's saved from the
  // normal page load like any other page (one Worker request less per new visitor).
  cacheStartUrl: false,
  // Off: with it, the page downloaded the home page again in the background whenever its address
  // became "/" (every visitor: one extra Worker request).
  dynamicStartUrl: false,
  workboxOptions: {
    // A new version waits instead of taking over open tabs: taking over deletes the old version's
    // files that those tabs still need (the next page they opened came up blank). UpdateNotifier
    // offers a refresh, which activates it (SKIP_WAITING message).
    skipWaiting: false,
    disableDevLogs: true,
    // Don't download the whole app (about 14 MB, 500 files) in the background at install: phones on
    // mobile data felt that. The app's code is saved as it's used instead (the rule below).
    exclude: [/.*/],
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
        // The app's code and styles as they load. Their names change with every version, so a saved
        // copy never goes stale; old versions' files stay available to tabs still running them.
        urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) => sameOrigin && url.pathname.startsWith('/_next/static/'),
        // Only complete, successful answers are kept: a redirect or error saved here was served again
        // on every later visit (the page came up without its styles and never recovered).
        handler: 'CacheFirst',
        options: { cacheName: 'static-v2', cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 400, maxAgeSeconds: 30 * 24 * 60 * 60 } },
      },
      {
        // API responses are per-user (grades, messages, billing): never store them on the device,
        // so nothing leaks between people sharing a computer and plan changes show immediately.
        urlPattern: /\/api\//,
        handler: 'NetworkOnly',
      },
      {
        // Pages as they load (full loads): kept for offline use. No extra requests: the copy is
        // saved from the normal response. Pages hold no personal data (that comes from /api).
        urlPattern: ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
          sameOrigin && request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
        handler: 'NetworkFirst',
        options: { cacheName: 'pages-v2', cacheableResponse: { statuses: [200] }, networkTimeoutSeconds: 8, expiration: { maxEntries: 80, maxAgeSeconds: 14 * 24 * 60 * 60 } },
      },
      {
        // In-app navigation (React Server Component payloads), likewise kept for offline use.
        urlPattern: ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
          sameOrigin && request.headers.get('RSC') === '1' && request.headers.get('Next-Router-Prefetch') !== '1' && !url.pathname.startsWith('/api/'),
        handler: 'NetworkFirst',
        options: { cacheName: 'pages-rsc-v2', cacheableResponse: { statuses: [200] }, networkTimeoutSeconds: 8, matchOptions: { ignoreSearch: true }, expiration: { maxEntries: 80, maxAgeSeconds: 14 * 24 * 60 * 60 } },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Reopening a page within 5 minutes shows the copy already in the browser instead of asking the
    // server again (pages hold no personal data; their data refreshes on its own). Faster and fewer
    // Worker requests.
    staleTimes: { dynamic: 300, static: 300 },
  },
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
    // The Terms and Privacy Policy pages show legal/*.md, bundled as text.
    config.module.rules.push({ test: /[\\/]legal[\\/][^\\/]+\.md$/, type: 'asset/source' });
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
