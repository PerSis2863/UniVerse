import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { GET as me } from '../me/route';
import { GET as notifications } from '../notifications/route';
import { GET as incomingCalls } from '../chat/incoming/route';
import { GET as studentOverview } from '../student/overview/route';
import { POST as realtimeTicket } from '../realtime/ticket/route';
import { api } from '@/server/app';

// Everything the app asks for when it opens, in one request instead of six to eight: the signed-in
// profile, notifications, incoming calls, the dashboard's data, a live-updates ticket and the
// "app opened" entry for sign-in history. Each part runs the same code as its own endpoint (with
// the caller's own credentials), so the answers are identical. The client uses each answer once,
// in place of the request it would have made.
//
// POST { keys: string[], ticket?: boolean, session?: boolean }
//   → { results: { [key]: { status, body } }, ticket?: string }

type Handler = (req: Request) => Promise<Response>;
const core = (path: string): Handler => (req) => api.handle(req, path);

// The requests that can be bundled (GET only). Anything else is ignored.
const ROUTES: Record<string, Handler> = {
  '/api/me': me,
  '/api/notifications': notifications,
  '/api/chat/incoming': incomingCalls,
  '/api/student/overview': studentOverview,
  '/api/core/users/me': core('users/me'),
  '/api/core/dashboard/teacher': core('dashboard/teacher'),
  '/api/core/dashboard/admin': core('dashboard/admin'),
};
const MAX_KEYS = 8;

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const keys: string[] = Array.isArray(b.keys) ? [...new Set(b.keys.filter((k: unknown): k is string => typeof k === 'string'))].slice(0, MAX_KEYS) as string[] : [];

  // The caller's own headers (credentials, address, browser) so each part sees the same request.
  const headers = new Headers(req.headers);
  headers.delete('content-length');
  headers.delete('content-type');
  const inner = (path: string, method = 'GET', body?: unknown) => {
    const h = new Headers(headers);
    if (body !== undefined) h.set('content-type', 'application/json');
    return new Request(new URL(path, req.url), { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  const read = async (res: Response) => ({ status: res.status, body: await res.json().catch(() => null) });

  const results: Record<string, { status: number; body: unknown }> = {};
  const tasks: Promise<unknown>[] = keys.map(async (key) => {
    let url: URL;
    try { url = new URL(key, req.url); } catch { return; }
    const handler = url.origin === new URL(req.url).origin ? ROUTES[url.pathname] : undefined;
    if (!handler) return;
    try { results[key] = await read(await handler(inner(url.pathname + url.search))); }
    catch { results[key] = { status: 500, body: null }; }
  });

  let ticket: string | undefined;
  if (b.ticket === true) {
    tasks.push(realtimeTicket(inner('/api/realtime/ticket', 'POST')).then(read).then((r) => {
      const path = (r.body as { path?: unknown } | null)?.path;
      if (r.status === 200 && typeof path === 'string') ticket = path;
    }).catch(() => {}));
  }
  if (b.session === true) tasks.push(api.handle(inner('/api/core/auth/session', 'POST', { kind: 'SESSION' }), 'auth/session').catch(() => {}));

  await Promise.all(tasks);
  return NextResponse.json({ results, ...(ticket ? { ticket } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
