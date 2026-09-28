import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { later, notify } from '@/server/email';
import { decorate, getSystemUser, isOnline, isOwnBlobUrl, MAX_BODY, membership, messageSelect, serializeMessage, touchPresence, userCard, visibleTo } from '@/lib/chat';
import { publishChat } from '@/server/realtime';

type Ctx = { params: Promise<{ id: string }> };
const PAGE = 50;
const TYPES = new Set(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'CALL', 'POLL', 'LOCATION', 'CONTACT']);
const ATTACHMENT_TYPES = new Set(['IMAGE', 'FILE', 'AUDIO', 'VIDEO']);
const sender = { select: { id: true, name: true, avatar: true } } as const;

// GET: a page of messages (newest last) plus who's typing, online and how far each member has read.
// Also marks the conversation read for the caller.
export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const me = await membership(id, user.id);
  if (!me) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const sp = new URL(req.url).searchParams;
  const before = sp.get('before');
  const beforeDate = before ? new Date(before) : null;

  // Search inside this chat.
  const q = sp.get('q')?.trim();
  if (q) {
    const results = await prisma.message.findMany({
      where: { conversationId: id, deletedAt: null, type: { in: ['TEXT', 'POLL', 'FILE'] }, AND: [visibleTo(user.id), { OR: [{ body: { contains: q.slice(0, 100) } }, { attachmentName: { contains: q.slice(0, 100) } }] }] },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, body: true, type: true, attachmentName: true, createdAt: true, sender: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Disappearing messages: remove anything that has expired.
  await prisma.message.deleteMany({ where: { conversationId: id, expiresAt: { lt: new Date() } } });

  const [rows, convo, system, prefs] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId: id, ...visibleTo(user.id), ...(beforeDate && !isNaN(+beforeDate) ? { createdAt: { lt: beforeDate } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: PAGE + 1,
      select: { ...messageSelect, sender },
    }),
    prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true, isGroup: true, name: true, avatarUrl: true, createdById: true, disappearingSec: true,
        participants: { select: { userId: true, role: true, lastReadAt: true, typingUntil: true, user: userCard } },
      },
    }),
    getSystemUser(),
    prisma.conversationParticipant.findUnique({ where: { id: me.id }, select: { pinnedAt: true, mutedUntil: true, archivedAt: true } }),
  ]);
  if (!convo) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const now = new Date();
  // Mark read (only when looking at the latest page) and record presence.
  if (!beforeDate) {
    await Promise.all([
      prisma.conversationParticipant.update({ where: { id: me.id }, data: { lastReadAt: now, markedUnread: false } }),
      touchPresence(user.id),
    ]);
  }

  const hasMore = rows.length > PAGE;
  const messages = await decorate(rows.slice(0, PAGE).reverse().map(serializeMessage), user.id);
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
        disappearingSec: convo.disappearingSec,
        pinned: !!prefs?.pinnedAt,
        muted: !!prefs?.mutedUntil && prefs.mutedUntil > now,
        archived: !!prefs?.archivedAt,
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
  const convo = await prisma.conversation.findUnique({ where: { id }, select: { disappearingSec: true } });
  const data: Record<string, unknown> = { conversationId: id, senderId: user.id };

  if (typeof b.forwardOf === 'string') {
    // Forward: copy a message the sender can see into this chat.
    const src = await prisma.message.findUnique({ where: { id: b.forwardOf }, select: { conversationId: true, type: true, body: true, attachmentUrl: true, attachmentName: true, attachmentSize: true, attachmentMime: true, metadata: true, deletedAt: true } });
    if (!src || src.deletedAt || !(await membership(src.conversationId, user.id))) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
    if (!['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'LOCATION', 'CONTACT'].includes(src.type)) return NextResponse.json({ error: 'This message can’t be forwarded.' }, { status: 400 });
    Object.assign(data, { type: src.type, body: src.body, attachmentUrl: src.attachmentUrl, attachmentName: src.attachmentName, attachmentSize: src.attachmentSize, attachmentMime: src.attachmentMime, metadata: src.metadata ?? undefined, forwarded: true });
  } else {
    const type = TYPES.has(b.type) ? (b.type as string) : 'TEXT';
    const text = String(b.body ?? '').trim().slice(0, MAX_BODY);
    data.type = type;
    data.body = text;

    if (type === 'CALL') {
      const kind = b.kind === 'video' ? 'video' : 'audio';
      const room = `UniVerse-${randomBytes(9).toString('base64url')}`;
      data.body = kind === 'video' ? 'Video call' : 'Voice call';
      data.metadata = { kind, room, url: `https://meet.jit.si/${room}${kind === 'audio' ? '#config.startWithVideoMuted=true' : ''}` };
    } else if (type === 'POLL') {
      const question = String(b.poll?.question ?? '').trim().slice(0, 300);
      const options: string[] = Array.isArray(b.poll?.options) ? [...new Set<string>(b.poll.options.map((o: unknown) => String(o ?? '').trim().slice(0, 100)).filter(Boolean))] : [];
      if (!question || options.length < 2 || options.length > 12) return NextResponse.json({ error: 'A poll needs a question and 2–12 different options.' }, { status: 400 });
      data.body = question;
      data.metadata = { question, options, multiple: !!b.poll?.multiple };
    } else if (type === 'LOCATION') {
      const lat = Number(b.location?.lat), lng = Number(b.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return NextResponse.json({ error: 'Invalid location.' }, { status: 400 });
      const label = typeof b.location?.label === 'string' ? b.location.label.trim().slice(0, 120) : '';
      data.body = label || 'Location';
      data.metadata = { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, label: label || null };
    } else if (type === 'CONTACT') {
      const contact = typeof b.contactId === 'string' ? await prisma.user.findUnique({ where: { id: b.contactId }, select: { id: true, name: true, role: true, avatar: true } }) : null;
      if (!contact) return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });
      data.body = contact.name;
      data.metadata = { userId: contact.id, name: contact.name, role: contact.role, avatar: contact.avatar };
    } else if (ATTACHMENT_TYPES.has(type)) {
      if (!isOwnBlobUrl(b.attachmentUrl)) return NextResponse.json({ error: 'Invalid attachment.' }, { status: 400 });
      data.attachmentUrl = b.attachmentUrl;
      data.attachmentName = String(b.attachmentName ?? 'file').slice(0, 200);
      data.attachmentSize = Number.isFinite(b.attachmentSize) ? Math.max(0, Math.floor(b.attachmentSize)) : null;
      data.attachmentMime = typeof b.attachmentMime === 'string' ? b.attachmentMime.slice(0, 120) : null;
      if (type === 'AUDIO' && Number.isFinite(b.durationSec)) data.metadata = { durationSec: Math.round(b.durationSec) };
    } else if (!text) {
      return NextResponse.json({ error: 'Message is empty.' }, { status: 400 });
    }
  }
  if (convo?.disappearingSec) data.expiresAt = new Date(Date.now() + convo.disappearingSec * 1000);

  if (typeof b.replyToId === 'string') {
    const parent = await prisma.message.findFirst({ where: { id: b.replyToId, conversationId: id }, select: { id: true } });
    if (parent) data.replyToId = parent.id;
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({ data: data as any, select: { ...messageSelect, sender } }),
    prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } }),
    prisma.conversationParticipant.update({ where: { id: me.id }, data: { lastReadAt: new Date(), typingUntil: null } }),
  ]);
  const [out] = await decorate([serializeMessage(message)], user.id);
  publishChat(id);
  later(() => notifyAway(id, user, system.id, String(data.type ?? 'TEXT'), String(data.body ?? '')));
  return NextResponse.json(out, { status: 201 });
}

const AWAY_MS = 5 * 60_000;
const EMAIL_GAP_MS = 60 * 60_000;
const PREVIEW: Record<string, string> = { IMAGE: '📷 Photo', FILE: '📎 File', AUDIO: '🎤 Voice message', VIDEO: '🎬 Video', CALL: '📞 Call', POLL: '📊 Poll', LOCATION: '📍 Location', CONTACT: '👤 Contact' };

// Members who haven't been active for a few minutes get a notification (and an email if they
// have them on), at most once an hour per chat, so a busy chat doesn't flood their inbox.
async function notifyAway(conversationId: string, from: { id: string; name: string }, systemUserId: string, type: string, body: string) {
  const now = new Date();
  const [convo, members] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: conversationId }, select: { isGroup: true, name: true } }),
    prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { notIn: [from.id, systemUserId] },
        OR: [{ mutedUntil: null }, { mutedUntil: { lt: now } }],
        user: { status: 'ACTIVE', OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - AWAY_MS) } }] },
      },
      select: { userId: true, user: { select: { role: true } } },
    }),
  ]);
  if (!convo || members.length === 0) return;
  const recent = await prisma.notification.findMany({
    where: { userId: { in: members.map((m) => m.userId) }, type: 'chat', link: { endsWith: `?c=${conversationId}` }, createdAt: { gt: new Date(now.getTime() - EMAIL_GAP_MS) } },
    select: { userId: true },
  });
  const skip = new Set(recent.map((r) => r.userId));
  const text = (type === 'TEXT' ? body : PREVIEW[type] ?? body).slice(0, 200);
  const title = convo.isGroup ? `New messages in ${convo.name ?? 'a group chat'}` : `New message from ${from.name}`;
  await Promise.all(
    members
      .filter((m) => !skip.has(m.userId))
      .map((m) =>
        notify(m.userId, {
          type: 'chat',
          title,
          body: convo.isGroup ? `${from.name}: ${text}` : text,
          link: `/${m.user.role === 'ADMIN' ? 'admin' : m.user.role === 'TEACHER' ? 'teacher' : 'student'}/inbox?c=${conversationId}`,
        }),
      ),
  );
}
