import { NextResponse } from 'next/server';
import { lookupSso } from '@/server/sso';

// Public endpoint: resolves SSO provider for a school subdomain or student/teacher email domain.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  const slug = url.searchParams.get('slug');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');

  const result = await lookupSso({ email, slug, host });
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}
