import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { membership } from '@/lib/chat';
import { publishChat } from '@/server/realtime';

type Ctx = { params: Promise<{ id: string }> };
const ALLOWED = new Set([0, 86_400, 604_800, 7_776_000]); // off, 24h, 7d, 90d
const LABEL: Record<number, string> = { 86_400: '24 hours', 604_800: '7 days', 7_776_000: '90 days' };

// PATCH { disappearingSec } — anyone in a 1:1 chat, admins in a group.
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const me = await membership(id, user.id);
  const convo = await prisma.conversation.findUnique({ where: { id }, select: { isGroup: true } });
  if (!me || !convo) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  if (convo.isGroup && me.role !== 'ADMIN') return NextResponse.json({ error: 'Only group admins can change this.' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const sec = Number(b.disappearingSec);
  if (!ALLOWED.has(sec)) return NextResponse.json({ error: 'Choose 24 hours, 7 days, 90 days or off.' }, { status: 400 });
  await prisma.conversation.update({ where: { id }, data: { disappearingSec: sec || null } });
  await prisma.message.create({
    data: { conversationId: id, senderId: user.id, type: 'SYSTEM', body: sec ? `${user.name} turned on disappearing messages. New messages will disappear after ${LABEL[sec]}.` : `${user.name} turned off disappearing messages.` },
  });
  publishChat(id);
  return NextResponse.json({ ok: true });
}
