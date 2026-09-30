import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { MAX_BODY, membership, messageSelect, serializeMessage } from '@/lib/chat';
import { publishChat } from '@/server/realtime';

type Ctx = { params: Promise<{ id: string }> };
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function load(req: Request, id: string) {
  const user = await getSessionUser(req);
  if (!user) return { error: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) };
  const msg = await prisma.message.findUnique({ where: { id }, select: { id: true, senderId: true, conversationId: true, type: true, createdAt: true, deletedAt: true } });
  if (!msg || !(await membership(msg.conversationId, user.id))) return { error: NextResponse.json({ error: 'Message not found.' }, { status: 404 }) };
  return { user, msg };
}

// PATCH: edit your own text message (within 24 hours).
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await load(req, id);
  if ('error' in r) return r.error;
  const { user, msg } = r;
  if (msg.senderId !== user.id || msg.type !== 'TEXT' || msg.deletedAt) return NextResponse.json({ error: 'You can only edit your own text messages.' }, { status: 403 });
  if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS) return NextResponse.json({ error: 'Messages can only be edited for 24 hours.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? '').trim().slice(0, MAX_BODY);
  if (!text) return NextResponse.json({ error: 'Message is empty.' }, { status: 400 });
  const [updated] = await prisma.$transaction([
    prisma.message.update({ where: { id }, data: { body: text, editedAt: new Date() }, select: { ...messageSelect, sender: { select: { id: true, name: true, avatar: true } } } }),
    prisma.messageTranslation.deleteMany({ where: { messageId: id } }), // the old translations no longer match
  ]);
  publishChat(msg.conversationId);
  return NextResponse.json(serializeMessage(updated));
}

// DELETE: delete for everyone (your own messages; group admins can remove any).
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await load(req, id);
  if ('error' in r) return r.error;
  const { user, msg } = r;
  if (msg.senderId !== user.id) {
    const me = await membership(msg.conversationId, user.id);
    const convo = await prisma.conversation.findUnique({ where: { id: msg.conversationId }, select: { isGroup: true } });
    if (!(convo?.isGroup && me?.role === 'ADMIN')) return NextResponse.json({ error: 'You can only delete your own messages.' }, { status: 403 });
  }
  await prisma.message.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.messageReaction.deleteMany({ where: { messageId: id } });
  publishChat(msg.conversationId);
  return NextResponse.json({ ok: true });
}
