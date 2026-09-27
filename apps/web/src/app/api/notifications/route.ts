import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// The signed-in user's notifications (newest first), and marking them read.

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, title: true, body: true, type: true, read: true, link: true, createdAt: true },
  });
  return NextResponse.json(notifications, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [];
  await prisma.notification.updateMany({
    where: { userId: user.id, read: false, ...(ids.length ? { id: { in: ids } } : {}) },
    data: { read: true },
  });
  return NextResponse.json({ ok: true });
}
