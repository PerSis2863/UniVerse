import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { membership } from '@/lib/chat';

type Ctx = { params: Promise<{ id: string }> };

// GET: an edited message's versions, newest first (Stage 4 · 1.3), for anyone in the chat. Not for
// messages deleted, or changed or removed by UniVerse (the owner console keeps its own record).
export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const msg = await prisma.message.findUnique({ where: { id }, select: { conversationId: true, body: true, createdAt: true, editedAt: true, deletedAt: true, metadata: true } });
  if (!msg || !(await membership(msg.conversationId, user.id))) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  const moderated = !!(msg.metadata as { moderated?: string } | null)?.moderated;
  if (msg.deletedAt || moderated) return NextResponse.json({ versions: [] });
  const edits = await prisma.messageEdit.findMany({ where: { messageId: id }, orderBy: { writtenAt: 'desc' }, take: 20, select: { body: true, writtenAt: true } });
  return NextResponse.json({
    versions: [{ body: msg.body, at: msg.editedAt ?? msg.createdAt, current: true }, ...edits.map((e) => ({ body: e.body, at: e.writtenAt, current: false }))],
  });
}
