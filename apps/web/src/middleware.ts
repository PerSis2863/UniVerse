import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function middleware(req: NextRequest) {
  return applySecurityHeaders(NextResponse.next());
}

function applySecurityHeaders(res: NextResponse) {
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://*.clerk.accounts.dev https://*.clerk.com https://clerk.com https://challenges.cloudflare.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: https://images.unsplash.com https://img.clerk.com https://*.clerk.com https://ui-avatars.com;
    font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;
    connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://api.clerk.dev wss://*.clerk.accounts.dev https://vitals.vercel-insights.com https://*.onrender.com http://localhost:*;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-src 'self' https://challenges.cloudflare.com;
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
