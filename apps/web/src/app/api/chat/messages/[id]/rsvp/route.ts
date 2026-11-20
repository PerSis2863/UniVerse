import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { membership } from '@/lib/chat';
import { publishChat } from '@/server/realtime';
import { answer, type ChatEvent } from '@/lib/chat-event';

type Ctx = { params: Promise<{ id: string }> };

// M344: POST { answer: 'yes' | 'maybe' | 'no' } answers a chat's event (the same answer again takes it back).
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const msg = await prisma.message.findUnique({ where: { id }, select: { conversationId: true, type: true, metadata: true, deletedAt: true } });
  if (!msg || msg.type !== 'EVENT' || msg.deletedAt || !(await membership(msg.conversationId, user.id))) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const next = answer(msg.metadata as unknown as ChatEvent, user, b?.answer);
  if (!next) return NextResponse.json({ error: 'Answer yes, maybe or no.' }, { status: 400 });
  await prisma.message.update({ where: { id }, data: { metadata: next as object } });
  publishChat(msg.conversationId);
  return NextResponse.json(next);
}
