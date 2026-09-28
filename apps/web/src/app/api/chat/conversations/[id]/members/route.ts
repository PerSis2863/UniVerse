import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { getSystemUser, membership } from '@/lib/chat';
import { publishChat } from '@/server/realtime';

type Ctx = { params: Promise<{ id: string }> };

// POST: group admins add members ({ userIds }). PATCH: group admins rename ({ name }).
// DELETE: leave the group.

async function groupAdmin(req: Request, id: string) {
  const user = await getSessionUser(req);
  if (!user) return { error: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) };
  const me = await membership(id, user.id);
  const convo = await prisma.conversation.findUnique({ where: { id }, select: { isGroup: true } });
  if (!me || !convo?.isGroup) return { error: NextResponse.json({ error: 'Group not found.' }, { status: 404 }) };
  if (me.role !== 'ADMIN') return { error: NextResponse.json({ error: 'Only group admins can do this.' }, { status: 403 }) };
  return { user };
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await groupAdmin(req, id);
  if ('error' in r) return r.error;
  const body = await req.json().catch(() => ({}));
  const system = await getSystemUser();
  const ids: string[] = Array.isArray(body.userIds) ? body.userIds.filter((x: unknown) => typeof x === 'string' && x !== system.id).slice(0, 100) : [];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  if (users.length === 0) return NextResponse.json({ error: 'No valid users to add.' }, { status: 400 });
  // SQLite has no skipDuplicates: only insert people who aren't members yet.
  const existing = new Set(
    (await prisma.conversationParticipant.findMany({ where: { conversationId: id, userId: { in: users.map((u) => u.id) } }, select: { userId: true } })).map((p) => p.userId),
  );
  const toAdd = users.filter((u) => !existing.has(u.id));
  if (toAdd.length === 0) return NextResponse.json({ ok: true });
  await prisma.conversationParticipant.createMany({ data: toAdd.map((u) => ({ conversationId: id, userId: u.id })) });
  await prisma.message.create({
    data: { conversationId: id, senderId: r.user.id, type: 'SYSTEM', body: `${r.user.name} added ${toAdd.map((u) => u.name).join(', ')}` },
  });
  await prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
  publishChat(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await groupAdmin(req, id);
  if ('error' in r) return r.error;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  await prisma.conversation.update({ where: { id }, data: { name } });
  await prisma.message.create({ data: { conversationId: id, senderId: r.user.id, type: 'SYSTEM', body: `${r.user.name} renamed the group to "${name}"` } });
  publishChat(id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const me = await membership(id, user.id);
  const convo = await prisma.conversation.findUnique({ where: { id }, select: { isGroup: true } });
  if (!me || !convo?.isGroup) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });

  await prisma.conversationParticipant.delete({ where: { id: me.id } });
  const remaining = await prisma.conversationParticipant.findMany({ where: { conversationId: id }, orderBy: { joinedAt: 'asc' }, select: { id: true, role: true } });
  if (remaining.length === 0) {
    await prisma.conversation.delete({ where: { id } });
  } else {
    // Keep at least one admin in the group.
    if (!remaining.some((p) => p.role === 'ADMIN')) await prisma.conversationParticipant.update({ where: { id: remaining[0].id }, data: { role: 'ADMIN' } });
    await prisma.message.create({ data: { conversationId: id, senderId: user.id, type: 'SYSTEM', body: `${user.name} left the group` } });
    publishChat(id, [user.id]);
  }
  return NextResponse.json({ ok: true });
}
