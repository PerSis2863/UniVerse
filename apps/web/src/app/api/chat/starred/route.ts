import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { messageSelect, serializeMessage } from '@/lib/chat';

// GET: the caller's starred messages across all their chats (newest first).
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const states = await prisma.messageUserState.findMany({
    where: {
      userId: user.id, starred: true, hidden: false,
      message: { deletedAt: null, conversation: { participants: { some: { userId: user.id } } }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      message: {
        select: {
          ...messageSelect,
          sender: { select: { id: true, name: true, avatar: true } },
          conversation: { select: { id: true, isGroup: true, name: true, participants: { select: { user: { select: { id: true, name: true } } } } } },
        },
      },
    },
  });
  const items = states.map(({ message: { conversation, ...m } }) => ({
    ...serializeMessage(m),
    starred: true,
    poll: null,
    chat: { id: conversation.id, title: conversation.isGroup ? conversation.name || 'Group chat' : conversation.participants.find((p) => p.user.id !== user.id)?.user.name ?? 'Chat' },
  }));
  return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } });
}
