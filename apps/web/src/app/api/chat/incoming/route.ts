import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { quietFor } from '@/server/focus';

// Calls started in the last 45 seconds in the caller's chats, by someone else (for the ringing card).
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const calls = await prisma.message.findMany({
    where: {
      type: 'CALL',
      deletedAt: null,
      senderId: { not: user.id },
      createdAt: { gte: new Date(Date.now() - 45_000) },
      conversation: { participants: { some: { userId: user.id } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      id: true,
      conversationId: true,
      metadata: true,
      createdAt: true,
      senderId: true,
      sender: { select: { name: true, avatar: true } },
      conversation: { select: { isGroup: true, name: true } },
    },
  });
  // In Focus (Busy, In class, Sleeping), calls show quietly unless the caller is a favourite.
  const quiet = new Set<string>();
  for (const c of calls) if ((await quietFor([user.id], c.senderId)).size) quiet.add(c.id);
  return NextResponse.json(calls.map(({ senderId: _s, ...c }) => ({ ...c, quiet: quiet.has(c.id) })), { headers: { 'Cache-Control': 'no-store' } }); // eslint-disable-line @typescript-eslint/no-unused-vars
}
