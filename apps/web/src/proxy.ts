import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function proxy(req: NextRequest) {
  return applySecurityHeaders(NextResponse.next());
}

function applySecurityHeaders(res: NextResponse) {
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://www.gstatic.com https://apis.google.com https://www.google.com https://www.googletagmanager.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: https://*.public.blob.vercel-storage.com https://images.unsplash.com https://ui-avatars.com https://lh3.googleusercontent.com https://*.googleusercontent.com;
    font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;
    connect-src 'self' https://vercel.com https://blob.vercel-storage.com https://*.blob.vercel-storage.com https://vitals.vercel-insights.com https://*.onrender.com http://localhost:* https://*.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://*.firebaseapp.com https://*.firebase.com wss://*.firebaseio.com https://firebaseinstallations.googleapis.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com;
    media-src 'self' blob: https://*.public.blob.vercel-storage.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-src 'self' https://universe-71e68.firebaseapp.com https://accounts.google.com https://appleid.apple.com https://www.google.com;
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `;

  res.headers.set('Content-Security-Policy', cspHeader.replace(/\s{2,}/g, ' ').trim());
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  return res;
}
export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
