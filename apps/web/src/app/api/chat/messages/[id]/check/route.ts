import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { membership } from '@/lib/chat';
import { publishChat } from '@/server/realtime';
import { toggleItem, type Checklist } from '@/lib/chat-checklist';

type Ctx = { params: Promise<{ id: string }> };

// M340: POST { item } ticks (or unticks) one item of a chat's checklist, for anyone in the chat.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const msg = await prisma.message.findUnique({ where: { id }, select: { conversationId: true, type: true, metadata: true, deletedAt: true } });
  if (!msg || msg.type !== 'CHECKLIST' || msg.deletedAt || !(await membership(msg.conversationId, user.id))) return NextResponse.json({ error: 'Checklist not found.' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const next = toggleItem(msg.metadata as unknown as Checklist, Number(b?.item), user);
  if (!next) return NextResponse.json({ error: 'That item isn’t on the list.' }, { status: 400 });
  await prisma.message.update({ where: { id }, data: { metadata: next as object } });
  publishChat(msg.conversationId);
  return NextResponse.json(next);
}
