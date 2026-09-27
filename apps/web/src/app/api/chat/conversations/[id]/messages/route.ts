import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { getSystemUser, isOnline, isOwnBlobUrl, MAX_BODY, membership, messageSelect, serializeMessage, touchPresence, userCard } from '@/lib/chat';

type Ctx = { params: Promise<{ id: string }> };
const PAGE = 50;
const TYPES = new Set(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'CALL']);

// GET: a page of messages (newest last) plus who's typing, online and how far each member has read.
// Also marks the conversation read for the caller.
export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const me = await membership(id, user.id);
  if (!me) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const before = new URL(req.url).searchParams.get('before');
  const beforeDate = before ? new Date(before) : null;

  const [rows, convo, system] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId: id, ...(beforeDate && !isNaN(+beforeDate) ? { createdAt: { lt: beforeDate } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: PAGE + 1,
      select: { ...messageSelect, sender: { select: { id: true, name: true, avatar: true } } },
    }),
    prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true, isGroup: true, name: true, avatarUrl: true, createdById: true,
        participants: { select: { userId: true, role: true, lastReadAt: true, typingUntil: true, user: userCard } },
      },
    }),
    getSystemUser(),
  ]);
  if (!convo) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const now = new Date();
  // Mark read (only when looking at the latest page) and record presence.
  if (!beforeDate) {
    await Promise.all([
      prisma.conversationParticipant.update({ where: { id: me.id }, data: { lastReadAt: now } }),
      touchPresence(user.id),
    ]);
  }

  const hasMore = rows.length > PAGE;
  const messages = rows.slice(0, PAGE).reverse().map(serializeMessage);
  const others = convo.participants.filter((p) => p.userId !== user.id);

  return NextResponse.json(
    {
      conversation: {
        id: convo.id,
        isGroup: convo.isGroup,
        isOfficial: !convo.isGroup && others.some((p) => p.userId === system.id),
        title: convo.isGroup ? convo.name || 'Group chat' : others[0]?.user.name || 'Unknown user',
        avatarUrl: convo.isGroup ? convo.avatarUrl : others[0]?.user.avatar ?? null,
        myRole: me.role,
        members: convo.participants.map((p) => ({
          id: p.user.id,
          name: p.user.name,
          avatar: p.user.avatar,
          role: p.user.role,
          groupRole: p.role,
          online: isOnline(p.user.lastSeenAt),
          lastSeenAt: p.user.lastSeenAt,
          lastReadAt: p.lastReadAt,
        })),
      },
      typing: others.filter((p) => p.typingUntil && p.typingUntil > now).map((p) => p.user.name.split(' ')[0]),
      messages,
      hasMore,
      me: user.id,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// POST: send a message (text, attachment or call invite), optionally replying to another message.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const me = await membership(id, user.id);
  if (!me) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const system = await getSystemUser();
  const official = await prisma.conversationParticipant.findFirst({ where: { conversationId: id, userId: system.id }, select: { id: true } });
  if (official) return NextResponse.json({ error: 'This is an announcements-only channel.' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const type = TYPES.has(b.type) ? (b.type as string) : 'TEXT';
  const text = String(b.body ?? '').trim().slice(0, MAX_BODY);
  const data: Record<string, unknown> = { conversationId: id, senderId: user.id, type, body: text };

  if (type === 'CALL') {
    const kind = b.kind === 'video' ? 'video' : 'audio';
    const room = `UniVerse-${randomBytes(9).toString('base64url')}`;
    data.body = kind === 'video' ? 'Video call' : 'Voice call';
    data.metadata = { kind, room, url: `https://meet.jit.si/${room}${kind === 'audio' ? '#config.startWithVideoMuted=true' : ''}` };
  } else if (type !== 'TEXT') {
    if (!isOwnBlobUrl(b.attachmentUrl)) return NextResponse.json({ error: 'Invalid attachment.' }, { status: 400 });
    data.attachmentUrl = b.attachmentUrl;
    data.attachmentName = String(b.attachmentName ?? 'file').slice(0, 200);
    data.attachmentSize = Number.isFinite(b.attachmentSize) ? Math.max(0, Math.floor(b.attachmentSize)) : null;
    data.attachmentMime = typeof b.attachmentMime === 'string' ? b.attachmentMime.slice(0, 120) : null;
    if (type === 'AUDIO' && Number.isFinite(b.durationSec)) data.metadata = { durationSec: Math.round(b.durationSec) };
  } else if (!text) {
    return NextResponse.json({ error: 'Message is empty.' }, { status: 400 });
  }

  if (typeof b.replyToId === 'string') {
    const parent = await prisma.message.findFirst({ where: { id: b.replyToId, conversationId: id }, select: { id: true } });
    if (parent) data.replyToId = parent.id;
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({ data: data as any, select: { ...messageSelect, sender: { select: { id: true, name: true, avatar: true } } } }),
    prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } }),
    prisma.conversationParticipant.update({ where: { id: me.id }, data: { lastReadAt: new Date(), typingUntil: null } }),
  ]);
  return NextResponse.json(serializeMessage(message), { status: 201 });
}
