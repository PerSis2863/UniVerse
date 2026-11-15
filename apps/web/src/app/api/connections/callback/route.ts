import { NextResponse } from 'next/server';
import { COOKIE, finishConnection } from '@/server/connections';

// GET ?code&state: where Google, Microsoft and Slack send a person back after they allowed a connection.
// Open by necessity (the browser comes back without the app's sign-in): the sealed `state` names who
// started it, and only the browser that started it (its cookie) can finish it (src/server/connections.ts).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cookie = (req.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? null;
  let to = '/student/inbox?space=connections&connected=failed';
  try { to = await finishConnection(url.searchParams, cookie, url.origin); } catch { /* the page says it didn't work */ }
  const res = NextResponse.redirect(new URL(to, url.origin), 303);
  res.cookies.set(COOKIE, '', { path: '/api/connections', maxAge: 0 });
  return res;
}
