import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { isReactionEmoji, membership } from '@/lib/chat';
import { publishChat } from '@/server/realtime';

type Ctx = { params: Promise<{ id: string }> };

// POST: toggle a reaction ({ emoji }) on a message: any one emoji, or one of the community's own
// (:name:, in its channels). At most 20 different reactions on a message.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const emoji = String(body.emoji ?? '').trim();
  const custom = /^:([a-z0-9_]{2,32}):$/.exec(emoji);
  if (!custom && !isReactionEmoji(emoji)) return NextResponse.json({ error: 'Unsupported reaction.' }, { status: 400 });

  const msg = await prisma.message.findUnique({ where: { id }, select: { conversationId: true, deletedAt: true, conversation: { select: { communityId: true } } } });
  if (!msg || msg.deletedAt || !(await membership(msg.conversationId, user.id))) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  if (custom) {
    const communityId = msg.conversation.communityId;
    const known = communityId ? await prisma.communityEmoji.findUnique({ where: { communityId_name: { communityId, name: custom[1] } }, select: { id: true } }) : null;
    if (!known) return NextResponse.json({ error: 'Unsupported reaction.' }, { status: 400 });
  }

  const key = { messageId_userId_emoji: { messageId: id, userId: user.id, emoji } };
  const existing = await prisma.messageReaction.findUnique({ where: key, select: { id: true } });
  if (!existing) {
    const kinds = await prisma.messageReaction.findMany({ where: { messageId: id }, distinct: ['emoji'], select: { emoji: true }, take: 21 });
    if (kinds.length >= 20 && !kinds.some((k) => k.emoji === emoji)) return NextResponse.json({ error: 'This message has as many different reactions as it can take.' }, { status: 400 });
  }
  if (existing) await prisma.messageReaction.delete({ where: key });
  else await prisma.messageReaction.create({ data: { messageId: id, userId: user.id, emoji } });
  publishChat(msg.conversationId);
  return NextResponse.json({ reacted: !existing });
}
