import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { ensureWelcome, getSystemUser, isOnline, touchPresence, userCard, visibleTo } from '@/lib/chat';

// GET: the caller's conversations (newest activity first) with unread counts and presence.
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  await Promise.all([ensureWelcome(user), touchPresence(user.id)]);
  const system = await getSystemUser();

  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId: user.id } } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      isGroup: true,
      name: true,
      avatarUrl: true,
      updatedAt: true,
      participants: { select: { userId: true, role: true, typingUntil: true, pinnedAt: true, mutedUntil: true, archivedAt: true, markedUnread: true, user: userCard } },
      messages: {
        where: visibleTo(user.id),
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, body: true, type: true, senderId: true, createdAt: true, deletedAt: true, attachmentName: true },
      },
    },
  });

  const unreadRows = await prisma.$queryRaw<{ conversationId: string; count: bigint }[]>`
    SELECT m."conversationId", COUNT(*) AS count
    FROM "messages" m
    JOIN "conversation_participants" p ON p."conversationId" = m."conversationId" AND p."userId" = ${user.id}
    WHERE m."senderId" <> ${user.id} AND m."deletedAt" IS NULL AND m."createdAt" > COALESCE(p."lastReadAt", p."joinedAt" - interval '1 second')
    GROUP BY m."conversationId"`;
  const unread = new Map(unreadRows.map((r) => [r.conversationId, Number(r.count)]));
  const now = Date.now();

  const list = conversations
    .map((c) => {
      const others = c.participants.filter((p) => p.userId !== user.id);
      const mine = c.participants.find((p) => p.userId === user.id);
      const last = c.messages[0] ?? null;
      const other = others[0]?.user;
      return {
        id: c.id,
        isGroup: c.isGroup,
        isOfficial: !c.isGroup && others.some((p) => p.userId === system.id),
        title: c.isGroup ? c.name || 'Group chat' : other?.name || 'Unknown user',
        avatarUrl: c.isGroup ? c.avatarUrl : other?.avatar ?? null,
        otherUserId: c.isGroup ? null : other?.id ?? null,
        online: !c.isGroup && isOnline(other?.lastSeenAt),
        lastSeenAt: c.isGroup ? null : other?.lastSeenAt ?? null,
        memberCount: c.participants.length,
        typing: others.filter((p) => p.typingUntil && p.typingUntil.getTime() > now).map((p) => p.user.name.split(' ')[0]),
        lastMessage: last
          ? { ...last, body: last.deletedAt ? '' : last.body.slice(0, 140), mine: last.senderId === user.id }
          : null,
        unread: Math.max(unread.get(c.id) ?? 0, mine?.markedUnread ? 1 : 0),
        markedUnread: !!mine?.markedUnread,
        pinned: !!mine?.pinnedAt,
        pinnedAt: mine?.pinnedAt ?? null,
        muted: !!mine?.mutedUntil && mine.mutedUntil.getTime() > now,
        archived: !!mine?.archivedAt,
        activityAt: last?.createdAt ?? c.updatedAt,
      };
    })
    // Pinned chats first (most recently pinned on top), then by latest activity.
    .sort((a, b) => (a.pinnedAt || b.pinnedAt)
      ? new Date(b.pinnedAt ?? 0).getTime() - new Date(a.pinnedAt ?? 0).getTime()
      : new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime());

  return NextResponse.json({ conversations: list, me: user.id }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST: start a 1:1 chat ({ userId }) or create a group ({ name, memberIds }).
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const system = await getSystemUser();

  if (typeof body.userId === 'string') {
    if (body.userId === user.id || body.userId === system.id) return NextResponse.json({ error: 'You can’t start a chat with this account.' }, { status: 400 });
    const target = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } });
    if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const existing = await prisma.conversation.findFirst({
      where: { isGroup: false, AND: [{ participants: { some: { userId: user.id } } }, { participants: { some: { userId: target.id } } }] },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ id: existing.id });
    const created = await prisma.conversation.create({
      data: { createdById: user.id, participants: { create: [{ userId: user.id }, { userId: target.id }] } },
      select: { id: true },
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  }

  const name = String(body.name ?? '').trim().slice(0, 80);
  const memberIds: string[] = Array.isArray(body.memberIds)
    ? [...new Set<string>(body.memberIds.filter((x: unknown) => typeof x === 'string'))].filter((id) => id !== user.id && id !== system.id).slice(0, 255)
    : [];
  if (!name) return NextResponse.json({ error: 'Give the group a name.' }, { status: 400 });
  if (memberIds.length === 0) return NextResponse.json({ error: 'Add at least one member.' }, { status: 400 });
  const found = await prisma.user.findMany({ where: { id: { in: memberIds } }, select: { id: true } });

  const group = await prisma.conversation.create({
    data: {
      isGroup: true,
      name,
      createdById: user.id,
      participants: { create: [{ userId: user.id, role: 'ADMIN' }, ...found.map((u) => ({ userId: u.id }))] },
      messages: { create: { senderId: user.id, type: 'SYSTEM', body: `${user.name} created the group "${name}"` } },
    },
    select: { id: true },
  });
  return NextResponse.json({ id: group.id }, { status: 201 });
}
