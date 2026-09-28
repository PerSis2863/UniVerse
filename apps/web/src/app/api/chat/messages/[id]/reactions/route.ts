import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { membership, REACTIONS } from '@/lib/chat';
import { publishChat } from '@/server/realtime';

type Ctx = { params: Promise<{ id: string }> };

// POST: toggle a reaction ({ emoji }) on a message.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const emoji = String(body.emoji ?? '');
  if (!REACTIONS.includes(emoji)) return NextResponse.json({ error: 'Unsupported reaction.' }, { status: 400 });

  const msg = await prisma.message.findUnique({ where: { id }, select: { conversationId: true, deletedAt: true } });
  if (!msg || msg.deletedAt || !(await membership(msg.conversationId, user.id))) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

  const key = { messageId_userId_emoji: { messageId: id, userId: user.id, emoji } };
  const existing = await prisma.messageReaction.findUnique({ where: key, select: { id: true } });
  if (existing) await prisma.messageReaction.delete({ where: key });
  else await prisma.messageReaction.create({ data: { messageId: id, userId: user.id, emoji } });
  publishChat(msg.conversationId);
  return NextResponse.json({ reacted: !existing });
}
