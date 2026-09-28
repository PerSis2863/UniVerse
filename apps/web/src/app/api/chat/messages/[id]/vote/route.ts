import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { membership } from '@/lib/chat';
import { publishChat } from '@/server/realtime';

type Ctx = { params: Promise<{ id: string }> };

// POST { option } — toggle a vote on a poll (single choice replaces your previous vote).
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const msg = await prisma.message.findUnique({ where: { id }, select: { conversationId: true, type: true, metadata: true, deletedAt: true } });
  if (!msg || msg.type !== 'POLL' || msg.deletedAt || !(await membership(msg.conversationId, user.id))) return NextResponse.json({ error: 'Poll not found.' }, { status: 404 });

  const meta = (msg.metadata ?? {}) as { options?: string[]; multiple?: boolean };
  const b = await req.json().catch(() => ({}));
  const option = Number(b.option);
  if (!Number.isInteger(option) || option < 0 || option >= (meta.options?.length ?? 0)) return NextResponse.json({ error: 'Invalid option.' }, { status: 400 });

  const existing = await prisma.pollVote.findUnique({ where: { messageId_userId_option: { messageId: id, userId: user.id, option } } });
  if (existing) {
    await prisma.pollVote.delete({ where: { id: existing.id } });
  } else {
    if (!meta.multiple) await prisma.pollVote.deleteMany({ where: { messageId: id, userId: user.id } });
    await prisma.pollVote.create({ data: { messageId: id, userId: user.id, option } });
  }
  publishChat(msg.conversationId);
  return NextResponse.json({ ok: true });
}
