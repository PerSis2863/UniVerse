import prisma from '@/lib/db';
import { membership } from '@/lib/chat';
import { route } from '@/server/assignments';
import { BadRequestException } from '@/server/http';

// POST { text, minutes, conversationId }: "/remind": a reminder for me (in the app and by push),
// sent by the 15-minute cron, so it may come up to 15 minutes late.
export const POST = (req: Request) =>
  route(req, async (user) => {
    const b = await req.json().catch(() => ({}));
    const text = String(b.text ?? '').trim().slice(0, 300);
    const minutes = Math.round(Number(b.minutes) || 0);
    if (!text) throw new BadRequestException('What should I remind you about?');
    if (minutes < 1 || minutes > 60 * 24 * 60) throw new BadRequestException('Pick a time from 1 minute to 60 days ahead.');
    const conversationId = typeof b.conversationId === 'string' && (await membership(b.conversationId, user.id)) ? b.conversationId : null;
    const pending = await prisma.chatReminder.count({ where: { userId: user.id, sentAt: null } });
    if (pending >= 50) throw new BadRequestException('You have 50 reminders waiting already.');
    return prisma.chatReminder.create({ data: { userId: user.id, conversationId, text, dueAt: new Date(Date.now() + minutes * 60_000) }, select: { id: true, dueAt: true } });
  });
