import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { isOnline, SYSTEM_EMAIL } from '@/lib/chat';

// GET ?q=: find people to message (name or email), excluding yourself and the system account.
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80);

  const people = await prisma.user.findMany({
    where: {
      id: { not: user.id },
      email: { not: SYSTEM_EMAIL },
      status: { not: 'SUSPENDED' },
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
    take: 25,
    select: { id: true, name: true, avatar: true, role: true, lastSeenAt: true },
  });
  return NextResponse.json(
    people.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, role: p.role, online: isOnline(p.lastSeenAt) })),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
