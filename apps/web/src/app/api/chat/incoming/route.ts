import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

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
      sender: { select: { name: true, avatar: true } },
      conversation: { select: { isGroup: true, name: true } },
    },
  });
  return NextResponse.json(calls, { headers: { 'Cache-Control': 'no-store' } });
}
