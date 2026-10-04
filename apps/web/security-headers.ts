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
const csp = `
    default-src 'self';
    script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"} https://static.cloudflareinsights.com https://apis.google.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/;
    script-src-attr 'none';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: ${FILES_ORIGIN} https://images.unsplash.com https://ui-avatars.com https://lh3.googleusercontent.com https://*.googleusercontent.com;
    font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;
    connect-src 'self' ${FILES_ORIGIN} https://*.r2.cloudflarestorage.com https://cloudflareinsights.com ${process.env.NODE_ENV === 'production' ? '' : 'http://localhost:* ws://localhost:*'} https://*.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://*.firebaseapp.com https://*.firebase.com wss://*.firebaseio.com https://firebaseinstallations.googleapis.com;
    media-src 'self' blob: ${FILES_ORIGIN};
    object-src 'none';
    worker-src 'self' blob:;
    manifest-src 'self';
    base-uri 'self';
    form-action 'self';
    frame-src 'self' https://universe-71e68.firebaseapp.com https://accounts.google.com https://appleid.apple.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.openstreetmap.org;
    frame-ancestors 'none';
    upgrade-insecure-requests;
`;

export const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp.replace(/\s{2,}/g, ' ').trim() },
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
