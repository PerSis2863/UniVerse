import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { membership } from '@/lib/chat';

type Ctx = { params: Promise<{ id: string }> };

// POST: "I'm typing" for the next few seconds.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const me = await membership(id, user.id);
  if (!me) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  await prisma.conversationParticipant.update({ where: { id: me.id }, data: { typingUntil: new Date(Date.now() + 6000) } });
  return NextResponse.json({ ok: true });
}
