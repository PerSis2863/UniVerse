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

const csp = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://static.cloudflareinsights.com https://www.gstatic.com https://apis.google.com https://www.google.com https://www.googletagmanager.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: ${FILES_ORIGIN} https://images.unsplash.com https://ui-avatars.com https://lh3.googleusercontent.com https://*.googleusercontent.com;
    font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;
    connect-src 'self' ${FILES_ORIGIN} https://*.r2.cloudflarestorage.com https://cloudflareinsights.com http://localhost:* https://*.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://*.firebaseapp.com https://*.firebase.com wss://*.firebaseio.com https://firebaseinstallations.googleapis.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com;
    media-src 'self' blob: ${FILES_ORIGIN};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-src 'self' https://universe-71e68.firebaseapp.com https://accounts.google.com https://appleid.apple.com https://www.google.com https://www.openstreetmap.org;
    frame-ancestors 'none';
    upgrade-insecure-requests;
`;

export const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp.replace(/\s{2,}/g, ' ').trim() },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
];
