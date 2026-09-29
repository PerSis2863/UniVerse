import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { membership } from '@/lib/chat';
import { publishChat } from '@/server/realtime';

type Ctx = { params: Promise<{ id: string }> };
const MAX_PINNED = 3;

// POST { pinned } — pin a message to the top of the chat (anyone in a 1:1 chat, admins in a
// group). Up to three stay pinned; pinning a fourth unpins the oldest.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const msg = await prisma.message.findUnique({ where: { id }, select: { conversationId: true, deletedAt: true, type: true } });
  const me = msg ? await membership(msg.conversationId, user.id) : null;
  if (!msg || !me || msg.deletedAt || msg.type === 'SYSTEM') return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  const convo = await prisma.conversation.findUnique({ where: { id: msg.conversationId }, select: { isGroup: true } });
  if (convo?.isGroup && me.role !== 'ADMIN') return NextResponse.json({ error: 'Only group admins can pin messages.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const pinned = body.pinned !== false;
  if (pinned) {
    const current = await prisma.message.findMany({ where: { conversationId: msg.conversationId, pinnedAt: { not: null }, id: { not: id } }, orderBy: { pinnedAt: 'asc' }, select: { id: true } });
    const unpin = current.slice(0, Math.max(0, current.length - (MAX_PINNED - 1))).map((m) => m.id);
    if (unpin.length) await prisma.message.updateMany({ where: { id: { in: unpin } }, data: { pinnedAt: null, pinnedById: null } });
  }
  await prisma.message.update({ where: { id }, data: pinned ? { pinnedAt: new Date(), pinnedById: user.id } : { pinnedAt: null, pinnedById: null } });
  publishChat(msg.conversationId);
  return NextResponse.json({ pinned });
}
