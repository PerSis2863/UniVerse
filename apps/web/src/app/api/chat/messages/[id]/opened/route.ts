import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { membership } from '@/lib/chat';
import { route } from '@/server/assignments';
import { NotFoundException } from '@/server/http';
import { publishChat } from '@/server/realtime';

// POST: I've opened this view-once message; from now on I'm not sent its file again.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => {
    const { id } = await params;
    const msg = await prisma.message.findUnique({ where: { id }, select: { conversationId: true, senderId: true, metadata: true, deletedAt: true } });
    if (!msg || msg.deletedAt || !(await membership(msg.conversationId, user.id))) throw new NotFoundException('Message not found.');
    const meta = (msg.metadata ?? {}) as { viewOnce?: boolean; openedBy?: string[] };
    if (!meta.viewOnce || msg.senderId === user.id) return { ok: true };
    const openedBy = Array.isArray(meta.openedBy) ? meta.openedBy : [];
    if (openedBy.includes(user.id)) return { ok: true };
    await prisma.message.update({ where: { id }, data: { metadata: { ...meta, openedBy: [...openedBy, user.id].slice(-500) } as Prisma.InputJsonValue } });
    publishChat(msg.conversationId); // the sender sees "Opened"
    return { ok: true };
  });
