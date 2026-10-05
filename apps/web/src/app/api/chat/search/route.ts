import prisma from '@/lib/db';
import { visibleTo } from '@/lib/chat';
import { route } from '@/server/assignments';

// GET ?q=: messages in any of my chats that contain the words (newest first, 30 at most), for the
// search box in Messages. Each result opens its chat at that message.
export const GET = (req: Request) =>
  route(req, async (user) => {
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 100);
    if (q.length < 2) return [];
    const rows = await prisma.message.findMany({
      where: {
        type: 'TEXT', deletedAt: null, body: { contains: q },
        conversation: { participants: { some: { userId: user.id } } },
        ...visibleTo(user.id),
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true, body: true, createdAt: true, conversationId: true,
        sender: { select: { id: true, name: true } },
        conversation: { select: { isGroup: true, name: true, participants: { where: { userId: { not: user.id } }, take: 1, select: { user: { select: { name: true, avatar: true } } } } } },
      },
    });
    return rows.map((m) => {
      const i = m.body.toLowerCase().indexOf(q.toLowerCase());
      const start = Math.max(0, i - 40);
      return {
        id: m.id,
        conversationId: m.conversationId,
        title: m.conversation.isGroup ? m.conversation.name ?? 'Group chat' : m.conversation.participants[0]?.user.name ?? 'Chat',
        avatar: m.conversation.isGroup ? null : m.conversation.participants[0]?.user.avatar ?? null,
        sender: m.sender.id === user.id ? 'You' : m.sender.name.split(' ')[0],
        snippet: (start > 0 ? '…' : '') + m.body.slice(start, start + 140),
        createdAt: m.createdAt,
      };
    });
  });
