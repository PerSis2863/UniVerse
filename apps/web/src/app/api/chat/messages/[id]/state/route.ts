import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { membership } from '@/lib/chat';

type Ctx = { params: Promise<{ id: string }> };

// POST { starred?, hidden? } — star a message, or delete it for yourself only.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const msg = await prisma.message.findUnique({ where: { id }, select: { conversationId: true } });
  if (!msg || !(await membership(msg.conversationId, user.id))) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const data: { starred?: boolean; hidden?: boolean } = {};
  if (typeof b.starred === 'boolean') data.starred = b.starred;
  if (typeof b.hidden === 'boolean') { data.hidden = b.hidden; if (b.hidden) data.starred = false; }
  await prisma.messageUserState.upsert({
    where: { messageId_userId: { messageId: id, userId: user.id } },
    create: { messageId: id, userId: user.id, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true });
}
