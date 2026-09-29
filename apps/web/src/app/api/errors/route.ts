import { NextResponse } from 'next/server';
import { extractBearer, resolveUser } from '@/server/auth';
import { recordError } from '@/server/errors';
import { later } from '@/server/email';

// POST: a browser reports errors it caught (src/lib/error-monitor.ts). Signed-in or not, since a
// crash can happen anywhere. Accepts up to 10 at a time; everything is size-limited and grouped.
const KINDS = new Set(['runtime', 'promise', 'render', 'chunk', 'api', 'manual']);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { errors?: unknown } | null;
  const list = Array.isArray(body?.errors) ? body.errors.slice(0, 10) : [];
  if (!list.length) return NextResponse.json({ ok: true });
  const token = extractBearer(req.headers.get('authorization'));
  const user = token ? await resolveUser(token).catch(() => null) : null;
  const userAgent = req.headers.get('user-agent');
  later(async () => {
    for (const raw of list) {
      const e = raw as { kind?: unknown; message?: unknown; stack?: unknown; path?: unknown };
      if (typeof e.message !== 'string' || !e.message.trim()) continue;
      await recordError({
        source: 'CLIENT',
        kind: typeof e.kind === 'string' && KINDS.has(e.kind) ? e.kind : 'runtime',
        message: e.message,
        stack: typeof e.stack === 'string' ? e.stack : null,
        path: typeof e.path === 'string' ? e.path : null,
        userAgent,
        userId: user?.id ?? null,
      });
    }
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}
