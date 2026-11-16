import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { COOKIE, startConnection } from '@/server/connections';
import { HttpException } from '@/server/http';

type Ctx = { params: Promise<{ service: string }> };

// POST { back? }: the service's sign-in address. The cookie binds the connection to this browser, so the
// callback can't be used to attach an account to someone else (src/server/connections.ts).
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const url = new URL(req.url);
  try {
    const b = (await req.json().catch(() => ({}))) as { back?: unknown };
    const { url: to, nonce } = await startConnection(user, (await params).service, url.origin, b.back);
    const res = NextResponse.json({ url: to }, { headers: { 'Cache-Control': 'no-store' } });
    res.cookies.set(COOKIE, nonce, { httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax', path: '/api/connections', maxAge: 600 });
    return res;
  } catch (e) {
    const status = e instanceof HttpException ? e.getStatus() : 500;
    return NextResponse.json({ error: e instanceof HttpException ? e.message : 'Couldn’t start connecting. Try again.' }, { status });
  }
}
