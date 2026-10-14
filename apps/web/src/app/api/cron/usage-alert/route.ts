import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { ownerEmails } from '@/server/auth';
import { publish } from '@/server/realtime';
import { pushService } from '@/server/services/push.service';

// Workers Free's daily allowances (cloudflare/usage-guard.ts): tells the owner when one passes 70% and
// again at 90%, in the app and by push (never email). Run by the 15-minute cron (cloudflare/worker.ts)
// only when a warning is due. Not reachable from outside: only the scheduled handler knows the token.

declare global {
  var __universeCronToken: string | undefined;
}

export async function POST(req: Request) {
  const token = req.headers.get('x-cron-token');
  if (!token || !globalThis.__universeCronToken || token !== globalThis.__universeCronToken) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const b = (await req.json().catch(() => null)) as { title?: unknown; body?: unknown } | null;
  const title = typeof b?.title === 'string' ? b.title.slice(0, 160) : '';
  const body = typeof b?.body === 'string' ? b.body.slice(0, 600) : '';
  if (!title) return NextResponse.json({ error: 'Nothing to send' }, { status: 400 });
  const owners = await prisma.user.findMany({ where: { email: { in: ownerEmails() } }, select: { id: true } });
  const ids = owners.map((o) => o.id);
  if (!ids.length) return NextResponse.json({ sent: 0 });
  const link = '/console?tab=server';
  await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title, body, type: 'warning', link })) });
  publish(ids, { type: 'notification' });
  await pushService.sendToMany(ids, { title, body, url: link, tag: 'cloudflare-daily' }).catch(() => 0);
  return NextResponse.json({ sent: ids.length });
}
