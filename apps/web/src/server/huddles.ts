import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { getSystemUser, membership, messageSelect } from '@/lib/chat';
import type { SessionUser } from '@/lib/server-auth';
import { roomPeers } from './calls';
import { afterSend } from './chat-notify';
import { BadRequestException, HttpException, NotFoundException } from './http';
import { chatMuted, featureOff } from './moderation';

// Huddles (Stage 4 · 1.11): one tap starts a drop-in voice room in any chat (call id r_<chat>, the
// group voice rooms of src/server/calls.ts, now in direct chats too). Nobody's phone rings: the
// first person in posts "started a huddle" in the chat, with a Join button and how many are in it.
// Joining a huddle that's already going posts nothing.

/** POST /api/chat/conversations/:id/huddle → { callId, started } */
export async function startHuddle(conversationId: string, user: SessionUser) {
  const me = await membership(conversationId, user.id);
  if (!me) throw new NotFoundException('Chat not found.');
  const [convo, system] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: conversationId }, select: { communityId: true, disappearingSec: true, participants: { select: { userId: true }, take: 3 } } }),
    getSystemUser(),
  ]);
  // Not in the official UniVerse chat.
  if (!convo || convo.participants.some((p) => p.userId === system.id)) throw new BadRequestException('Huddles aren’t available in this chat.');
  if (convo.communityId) throw new BadRequestException('Community channels have voice channels for this.');
  if (await featureOff('calls')) throw new HttpException('Calls are turned off on UniVerse for now. Please try again later.', 503);
  const callId = `r_${conversationId}`;
  const peers = await roomPeers(callId, user);
  if (peers.count > 0 || (await chatMuted(user.id))) return { callId, started: false };
  // Two people tapping at once: one message.
  const recent = await prisma.message.findFirst({ where: { conversationId, type: 'TEXT', deletedAt: null, createdAt: { gt: new Date(Date.now() - 2 * 60_000) }, body: 'started a huddle' }, select: { id: true } });
  if (recent) return { callId, started: false };
  const metadata = { huddle: { callId } };
  const message = await prisma.message.create({
    data: {
      conversationId, senderId: user.id, type: 'TEXT', body: 'started a huddle', metadata: metadata as unknown as Prisma.InputJsonValue,
      expiresAt: convo.disappearingSec ? new Date(Date.now() + convo.disappearingSec * 1000) : null,
    },
    select: { ...messageSelect, sender: { select: { id: true, name: true, avatar: true } } },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  afterSend({ id: message.id, conversationId, type: 'TEXT', body: message.body ?? '', metadata }, user, { communityId: null, systemUserId: system.id });
  return { callId, started: true };
}
