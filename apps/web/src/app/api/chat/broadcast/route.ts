import prisma from '@/lib/db';
import { getSystemUser, MAX_BODY } from '@/lib/chat';
import { planLimits } from '@/lib/plan-limits';
import { route } from '@/server/assignments';
import { BadRequestException, ForbiddenException, HttpException } from '@/server/http';
import { chatMuted, featureOff } from '@/server/moderation';
import { publish } from '@/server/realtime';

// POST { userIds, body }: a broadcast, like WhatsApp's. One message goes to each person as a
// private chat with you (created if needed), so replies come back to you privately. Teachers and
// admins only; capped per send (each new chat is a few database writes on Workers Free).

export const POST = (req: Request) =>
  route(req, async (user) => {
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') throw new ForbiddenException('Broadcasts are for teachers and admins.');
    if (await featureOff('chat')) throw new HttpException('Sending messages is turned off on UniVerse for now.', 503);
    const muted = await chatMuted(user.id);
    if (muted) throw new ForbiddenException(muted);
    const b = await req.json().catch(() => ({}));
    const text = String(b.body ?? '').trim().slice(0, MAX_BODY);
    if (!text) throw new BadRequestException('Write the message to send.');
    const cap = Math.min(planLimits().livePushes, 200);
    const system = await getSystemUser();
    const ids = [...new Set<string>((Array.isArray(b.userIds) ? b.userIds : []).filter((x: unknown) => typeof x === 'string'))].filter((id) => id !== user.id && id !== system.id);
    if (!ids.length) throw new BadRequestException('Choose who to send it to.');
    if (ids.length > cap) throw new BadRequestException(`A broadcast can go to up to ${cap} people at a time.`);
    const people = await prisma.user.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true } });

    // Existing private chats with these people, then new ones for the rest.
    const existing = await prisma.conversation.findMany({
      where: { isGroup: false, AND: [{ participants: { some: { userId: user.id } } }, { participants: { some: { userId: { in: people.map((p) => p.id) } } } }] },
      select: { id: true, participants: { select: { userId: true } } },
    });
    const chatWith = new Map<string, string>();
    for (const c of existing) {
      const other = c.participants.find((p) => p.userId !== user.id)?.userId;
      if (other && c.participants.length === 2) chatWith.set(other, c.id);
    }
    for (const p of people) {
      if (chatWith.has(p.id)) continue;
      const created = await prisma.conversation.create({ data: { createdById: user.id, participants: { create: [{ userId: user.id }, { userId: p.id }] } }, select: { id: true } });
      chatWith.set(p.id, created.id);
    }
    const now = new Date();
    const convoIds = [...chatWith.values()];
    await prisma.message.createMany({ data: convoIds.map((conversationId) => ({ conversationId, senderId: user.id, type: 'TEXT', body: text, metadata: { broadcast: true } })) });
    await prisma.conversation.updateMany({ where: { id: { in: convoIds } }, data: { updatedAt: now } });
    publish([...chatWith.keys()].slice(0, planLimits().livePushes), { type: 'refresh', keys: ['/api/chat/conversations'] });
    return { sent: convoIds.length };
  });
