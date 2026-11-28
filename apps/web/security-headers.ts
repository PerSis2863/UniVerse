// Security headers for every response, applied through `headers()` in next.config.ts.
// (Previously set in proxy.ts; kept out of middleware so the Cloudflare Worker doesn't need
// Next's Node middleware.)

// Public domain of the R2 bucket that serves uploaded files (e.g. https://files.example.com).
const FILES_ORIGIN = (() => {
  try {
    return process.env.NEXT_PUBLIC_FILES_URL ? new URL(process.env.NEXT_PUBLIC_FILES_URL).origin : '';
  } catch {
    return '';
  }
})();

// Scripts: Next.js puts each page's data in inline <script> tags (different for every page and
// build), so 'unsafe-inline' has to stay unless every page is rendered per request with a nonce,
// which would end the edge page cache (worker.ts edgeCachedPage). What's locked down instead:
//   - script-src-attr 'none': no inline event handlers (<img onerror=…>, onclick=…), the usual way
//     injected HTML runs code. The app uses none (React and the recovery script use listeners).
//   - Google scripts only for sign-in (apis.google.com) and phone sign-in's reCAPTCHA, by path.
//     No Tag Manager: it would let anyone's container run here (Analytics was removed).
//   - 'unsafe-eval' only in `next dev` (its hot reload evaluates code); never in production.
// Media: also R2's own signed addresses, for private recordings (src/server/private-files.ts).
// Reports: what browsers block is sent to /api/csp-report (owner console → Errors). apis.google.com is
// in connect-src for the Google sign-in script's own ping (otherwise every sign-in page logs a block). hyperion-native: is
// Hyperion's computer app's private address for IBIS-AMI models (M577): it exists only inside that app.
// Frames: sign-in, maps and, for watching a video together in a call (Stage 4 · 4.8), YouTube's
// privacy-enhanced player (driven by messages, so no YouTube script runs here; thumbnails from i.ytimg.com).
const csp = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"} https://static.cloudflareinsights.com https://apis.google.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/;
    script-src-attr 'none';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: ${FILES_ORIGIN} https://i.ytimg.com https://images.unsplash.com https://ui-avatars.com https://lh3.googleusercontent.com https://*.googleusercontent.com https://covers.openlibrary.org https://commons.wikimedia.org https://upload.wikimedia.org https://thumb.wikimedia.org https://tiles.openfreemap.org https://elevation-tiles-prod.s3.amazonaws.com https://tiles.maps.eox.at https://panoramax.openstreetmap.fr https://panoramax.ign.fr https://panoramax.mapcomplete.org https://panoramax-storage-public-fast.s3.gra.perf.cloud.ovh.net https://gibs.earthdata.nasa.gov https://tile.waymarkedtrails.org;
    font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;
    connect-src 'self' ${FILES_ORIGIN} hyperion-native: https://eu.i.posthog.com https://*.r2.cloudflarestorage.com https://cloudflareinsights.com ${process.env.NODE_ENV === 'production' ? '' : 'http://localhost:* ws://localhost:*'} https://*.googleapis.com https://apis.google.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://*.firebaseapp.com https://*.firebase.com wss://*.firebaseio.com https://firebaseinstallations.googleapis.com wss://generativelanguage.googleapis.com https://tiles.openfreemap.org https://elevation-tiles-prod.s3.amazonaws.com https://tiles.maps.eox.at https://api.panoramax.xyz https://routing.openstreetmap.de https://valhalla1.openstreetmap.de https://gibs.earthdata.nasa.gov https://tile.waymarkedtrails.org https://nominatim.openstreetmap.org https://photon.komoot.io https://date.nager.at;
    media-src 'self' blob: ${FILES_ORIGIN} https://*.r2.cloudflarestorage.com;
    object-src 'none';
    worker-src 'self' blob:;
    manifest-src 'self';
    base-uri 'self';
    form-action 'self';
    frame-src 'self' https://universe-71e68.firebaseapp.com https://accounts.google.com https://appleid.apple.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.openstreetmap.org https://www.youtube-nocookie.com;
    frame-ancestors 'none';
    upgrade-insecure-requests;
    report-uri /api/csp-report;
    report-to csp;
`;

export const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp.replace(/\s{2,}/g, ' ').trim() },
  // Where report-to sends reports (the Reporting API; report-uri for older browsers).
  { key: 'Reporting-Endpoints', value: 'csp="/api/csp-report"' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera and microphone for chat photos and voice notes, location for BeeSafe: this site only.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), interest-cohort=()' },
  // Google sign-in opens a popup, so popups keep a link back; nothing else can reach this window.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Other sites can't load this site's pages, API answers or files into their own pages
  // (link previews and email images are fetched by servers, so they still work).
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
  // Keeps this site in its own browser process group (defence against memory side-channel attacks).
  { key: 'Origin-Agent-Cluster', value: '?1' },
  // No Flash / Acrobat cross-domain policy files.
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
];

// Hyperion's sealed runner for Python and R (M469, public/sandbox/run.html): the Code window frames it with
// sandbox="allow-scripts" (an opaque origin, nothing of the site's reachable), so it may have what Pyodide's and webR's
// WebAssembly loaders need (eval) while everything else stays shut: their own versioned folders only (not the whole of
// jsDelivr, which serves anyone's packages), R's package repository, and only Hyperion may frame it. The same text is in
// public/_headers for the static file on Cloudflare (sandbox-headers.test.ts keeps them equal).
export const SANDBOX_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net/pyodide/v0.29.5/full/ https://webr.r-wasm.org/v0.6.0/",
  'worker-src blob:',
  'connect-src blob: data: https://cdn.jsdelivr.net/pyodide/v0.29.5/full/ https://webr.r-wasm.org/v0.6.0/ https://repo.r-wasm.org/',
  'img-src blob: data:',
  "style-src 'unsafe-inline'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
export const sandboxHeaders = [
  { key: 'Content-Security-Policy', value: SANDBOX_CSP },
  // Framed by Hyperion's cross-origin-isolated pages (below), so it must take part too.
  { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
];

// Hyperion's sealed web link (M560, public/sandbox/net.html): webread, webwrite, websave and mqttclient reach other
// sites from this frame, framed with sandbox="allow-scripts" (an opaque origin, nothing of the site's reachable), so it
// may connect to any https or wss address; its one inline script runs and nothing else loads. The page asks the person
// once per site before sending a request here (src/components/lab/net-link.ts). Same text in public/_headers.
export const NET_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  'connect-src https: wss:',
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
export const netHeaders = [{ key: 'Content-Security-Policy', value: NET_CSP }, ...sandboxHeaders.slice(1)];

// Hyperion's pages are cross-origin isolated (M521): its engine's background thread may then sleep on memory shared
// with the page (SharedArrayBuffer and Atomics.wait) until a device's next line, a pin's next reading or another
// thread's result arrives, inside loops and functions too. Pages from other sites still load (credentialless: they
// come without cookies); popups opened from here lose their link back, which Hyperion doesn't use (sign-in happens
// elsewhere). Isolation is decided when a page is loaded, so the Hyperion pages reload once when entered from the
// rest of the site and the page reloads when left (src/components/lab/Isolated.tsx).
export const isolationHeaders = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // M526: Hyperion's pages may also ask for a USB device (WebUSB; the person picks it), Bluetooth and serial ports.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(self), serial=(self), bluetooth=(self), interest-cohort=()' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
];
