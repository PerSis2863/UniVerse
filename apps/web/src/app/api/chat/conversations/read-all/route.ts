import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// POST: every one of my chats read up to now (M121, "Mark all as read" above the chat list). One
// update for all of them; the people who wrote see their messages as read the next time they look.
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { count } = await prisma.conversationParticipant.updateMany({ where: { userId: user.id }, data: { lastReadAt: new Date(), markedUnread: false } });
  return NextResponse.json({ ok: true, chats: count });
}
