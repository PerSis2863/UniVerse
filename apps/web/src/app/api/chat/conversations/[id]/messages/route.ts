import { NextResponse } from 'next/server';
import { clientIdOf } from '@/server/offline';
import { presenceOf } from '@/lib/presence';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { decorate, getSystemUser, isOnline, isOwnBlobUrl, MAX_BODY, membership, messageSelect, serializeMessage, touchPresence, userCard, visibleTo } from '@/lib/chat';
import { afterSend } from '@/server/chat-notify';
import { linkScheduledCall } from '@/server/scheduled-calls';
import { channelSendCheck } from '@/server/communities';
import { storedTranslations } from '@/server/translate';
import { listScheduled } from '@/server/scheduled-messages';
import { recordServerError } from '@/server/errors';
import { chatMuted, featureOff } from '@/server/moderation';

type Ctx = { params: Promise<{ id: string }> };
const PAGE = 50;
const TYPES = new Set(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'CALL', 'POLL', 'LOCATION', 'CONTACT']);
const ATTACHMENT_TYPES = new Set(['IMAGE', 'FILE', 'AUDIO', 'VIDEO']);
const sender = { select: { id: true, name: true, avatar: true } } as const;

// GET: a page of messages (newest last) plus who's typing, online and how far each member has read.
// Also marks the conversation read for the caller. A failure is recorded for the owner console
// (Errors) and answered with a readable message instead of a bare 500.
export async function GET(req: Request, ctx: Ctx) {
  try {
    return await getThread(req, ctx);
  } catch (e) {
    await recordServerError(e, req).catch(() => {});
    return NextResponse.json({ error: 'Couldn’t open this chat right now. Please try again.' }, { status: 500 });
  }
}

async function getThread(req: Request, { params }: Ctx) {
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

  // A thread (Discord-style): the message it started from and its replies, oldest first.
  const threadOf = sp.get('thread');
  if (threadOf) {
    const root = await prisma.message.findFirst({ where: { id: threadOf, conversationId: id, threadId: null, ...visibleTo(user.id) }, select: { ...messageSelect, sender } });
    if (!root) return NextResponse.json({ error: 'This thread no longer exists.' }, { status: 404 });
    const replies = await prisma.message.findMany({ where: { conversationId: id, threadId: root.id, ...visibleTo(user.id) }, orderBy: { createdAt: 'asc' }, take: 200, select: { ...messageSelect, sender } });
    const [r, ...rest] = await decorate([root, ...replies].map(serializeMessage), user.id);
    return NextResponse.json({ root: r, messages: rest, me: user.id }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Housekeeping writes below never stop the chat from opening: a failure is only recorded.
  const quietly = (p: Promise<unknown>) => p.catch((e) => recordServerError(e, req, user.id).catch(() => {}));

  // Expired disappearing messages are hidden here (visibleTo) and deleted by the daily job, not on
  // every load: each load has to fit in the Worker's small CPU budget.

  const [rows, convo, system, prefs, scheduled] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId: id, threadId: null, ...visibleTo(user.id), ...(beforeDate && !isNaN(+beforeDate) ? { createdAt: { lt: beforeDate } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: PAGE + 1,
      select: { ...messageSelect, sender },
    }),
    prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true, isGroup: true, name: true, avatarUrl: true, createdById: true, disappearingSec: true,
        communityId: true, channelKind: true, slowModeSec: true, community: { select: { name: true, color: true } },
        // Big community channels: the first 300 members are enough for mentions and read marks.
        participants: { take: 300, select: { userId: true, role: true, lastReadAt: true, typingUntil: true, user: userCard } },
      },
    }),
    getSystemUser(),
    prisma.conversationParticipant.findUnique({ where: { id: me.id }, select: { pinnedAt: true, mutedUntil: true, archivedAt: true, translateTo: true, draft: true, draftAt: true } }),
    // My messages scheduled to send later here (Stage 4 · 1.4).
    listScheduled(id, user.id),
  ]);
  if (!convo) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const now = new Date();
  // Mark read (only when looking at the latest page, and only if something new arrived since the
  // last time) and record presence.
  const newest = rows[0]?.createdAt;
  const unread = me.markedUnread || !me.lastReadAt || (!!newest && newest > me.lastReadAt);
  if (!beforeDate) {
    await Promise.all([
      unread ? quietly(prisma.conversationParticipant.update({ where: { id: me.id }, data: { lastReadAt: now, markedUnread: false } })) : null,
      quietly(touchPresence(user.id)),
    ]);
  }

  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const [messages, pinnedRows, translations] = await Promise.all([
    decorate([...page].reverse().map(serializeMessage), user.id),
    // Pinned messages (up to 3) for the bar at the top of the chat.
    prisma.message.findMany({
      where: { conversationId: id, pinnedAt: { not: null }, deletedAt: null, AND: [visibleTo(user.id)] },
      orderBy: { pinnedAt: 'desc' },
      take: 3,
      select: { id: true, body: true, type: true, attachmentName: true, createdAt: true, pinnedAt: true, sender: { select: { id: true, name: true } } },
    }),
    // Auto-translate on: include the translations already made, so they show at once.
    prefs?.translateTo ? storedTranslations(page.filter((m) => m.senderId !== user.id).map((m) => m.id), prefs.translateTo) : Promise.resolve({}),
  ]);
  const others = convo.participants.filter((p) => p.userId !== user.id);
  // Threads started from messages on this page: how many replies, and when the last one came.
  const threads = page.length
    ? await prisma.message.groupBy({ by: ['threadId'], where: { threadId: { in: page.map((m) => m.id) }, deletedAt: null }, _count: { _all: true }, _max: { createdAt: true } })
    : [];
  const threadOf2 = new Map(threads.map((t) => [t.threadId!, { count: t._count._all, lastAt: t._max.createdAt }]));
  const withThreads = messages.map((m) => (threadOf2.has(m.id) ? { ...m, thread: threadOf2.get(m.id) } : m));
  const [communityRole, communityEmoji] = convo.communityId
    ? await Promise.all([
        prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: convo.communityId, userId: user.id } }, select: { role: true } }).then((m) => m?.role ?? null),
        prisma.communityEmoji.findMany({ where: { communityId: convo.communityId }, orderBy: { name: 'asc' }, select: { name: true, url: true } }),
      ])
    : [null, []];

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
        translateTo: prefs?.translateTo ?? null,
        // What I was writing here, on any device, and when (the newer of this and the device's own wins).
        draft: prefs?.draft ?? null,
        draftAt: prefs?.draftAt ?? null,
        channel: convo.communityId
          ? { kind: convo.channelKind ?? 'TEXT', communityId: convo.communityId, communityName: convo.community?.name ?? '', color: convo.community?.color ?? null, slowModeSec: convo.slowModeSec, role: communityRole, emoji: communityEmoji }
          : null,
        members: convo.participants.map((p) => ({
          id: p.user.id,
          name: p.user.name,
          avatar: p.user.avatar,
          role: p.user.role,
          groupRole: p.role,
          online: isOnline(p.user.lastSeenAt, p.user.presence),
          lastSeenAt: presenceOf(p.user).hidden ? null : p.user.lastSeenAt,
          status: presenceOf(p.user),
          lastReadAt: p.lastReadAt,
        })),
      },
      typing: others.filter((p) => p.typingUntil && p.typingUntil > now).map((p) => p.user.name.split(' ')[0]),
      pinned: pinnedRows,
      scheduled,
      translations,
      messages: withThreads,
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
  const muted = await chatMuted(user.id);
  if (muted) return NextResponse.json({ error: muted }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const convo = await prisma.conversation.findUnique({ where: { id }, select: { disappearingSec: true, communityId: true } });
  // Community channels: announcements are for moderators, voice rooms have no messages, slow mode.
  if (convo?.communityId) {
    const why = await channelSendCheck(id, user.id);
    if (why) return NextResponse.json({ error: why }, { status: 403 });
  }
  const data: Record<string, unknown> = { conversationId: id, senderId: user.id };
  // Sent from the offline outbox (upgrade 4): a retry of the same message returns the saved one.
  const clientId = clientIdOf(b.clientId);
  if (clientId) {
    const again = await prisma.message.findUnique({ where: { senderId_clientId: { senderId: user.id, clientId } }, select: { ...messageSelect, sender } });
    if (again) return NextResponse.json((await decorate([serializeMessage(again)], user.id))[0]);
    data.clientId = clientId;
  }

  if (typeof b.forwardOf === 'string') {
    // Forward: copy a message the sender can see into this chat.
    const src = await prisma.message.findUnique({ where: { id: b.forwardOf }, select: { conversationId: true, type: true, body: true, attachmentUrl: true, attachmentName: true, attachmentSize: true, attachmentMime: true, metadata: true, deletedAt: true } });
    if (!src || src.deletedAt || !(await membership(src.conversationId, user.id))) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
    if (!['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'LOCATION', 'CONTACT'].includes(src.type)) return NextResponse.json({ error: 'This message can’t be forwarded.' }, { status: 400 });
    if ((src.metadata as { viewOnce?: boolean } | null)?.viewOnce) return NextResponse.json({ error: 'View-once messages can’t be forwarded.' }, { status: 400 });
    Object.assign(data, { type: src.type, body: src.body, attachmentUrl: src.attachmentUrl, attachmentName: src.attachmentName, attachmentSize: src.attachmentSize, attachmentMime: src.attachmentMime, metadata: src.metadata ?? undefined, forwarded: true });
  } else {
    const type = TYPES.has(b.type) ? (b.type as string) : 'TEXT';
    const text = String(b.body ?? '').trim().slice(0, MAX_BODY);
    data.type = type;
    data.body = text;

    if (type === 'CALL') {
      if (await featureOff('calls')) return NextResponse.json({ error: 'Voice and video calls: turned off on UniVerse for now. Please try again later.' }, { status: 503 });
      const kind = b.kind === 'video' ? 'video' : 'audio';
      data.body = kind === 'video' ? 'Video call' : 'Voice call';
      // UniVerse's own call (/call/<this message's id>, src/server/calls.ts). Older calls have a Jitsi url.
      data.metadata = { kind, inApp: true };
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
      const meta: Record<string, unknown> = {};
      if (type === 'AUDIO' && Number.isFinite(b.durationSec)) meta.durationSec = Math.round(b.durationSec);
      // A voice message left after a missed call (shown as Voicemail, transcribed straight away).
      if (type === 'AUDIO' && b.voicemail === true) meta.voicemail = true;
      // An album (Stage 4 · 1.7): several photos sent as one message, shown as a grid (2–10, all uploaded here).
      if (type === 'IMAGE' && Array.isArray(b.album)) {
        const album = (b.album as unknown[]).slice(0, 10).map((x) => x as { url?: unknown; name?: unknown; size?: unknown; mime?: unknown });
        if (album.length < 2 || album.some((x) => !isOwnBlobUrl(x.url) || typeof x.mime !== 'string' || !x.mime.startsWith('image/'))) return NextResponse.json({ error: 'Invalid album.' }, { status: 400 });
        meta.album = album.map((x) => ({ url: String(x.url), name: String(x.name ?? 'photo').slice(0, 200), size: Number.isFinite(x.size) ? Math.max(0, Math.floor(Number(x.size))) : null, mime: String(x.mime).slice(0, 120) }));
      }
      // View once (photos, videos, voice messages): each person can open it once (…/messages/[id]/opened).
      if (b.viewOnce === true && type !== 'FILE') Object.assign(meta, { viewOnce: true, openedBy: [] });
      if (Object.keys(meta).length) data.metadata = meta;
    } else if (!text) {
      return NextResponse.json({ error: 'Message is empty.' }, { status: 400 });
    }
  }
  if (convo?.disappearingSec) data.expiresAt = new Date(Date.now() + convo.disappearingSec * 1000);

  // A reply inside a thread: the thread's first message must be in this chat (and not a reply itself).
  if (typeof b.threadId === 'string') {
    const root = await prisma.message.findFirst({ where: { id: b.threadId, conversationId: id, threadId: null, deletedAt: null }, select: { id: true } });
    if (!root) return NextResponse.json({ error: 'This thread no longer exists.' }, { status: 404 });
    data.threadId = root.id;
  }

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
  // Started from a scheduled call: everyone else's Join now opens this call.
  if (data.type === 'CALL' && typeof b.scheduledId === 'string') await linkScheduledCall(b.scheduledId, id, message.id);
  // Link preview, translations, notifications, @mentions and watch words (src/server/chat-notify.ts).
  afterSend({ id: message.id, conversationId: id, type: String(data.type ?? 'TEXT'), body: String(data.body ?? ''), metadata: message.metadata }, user, { communityId: convo?.communityId ?? null, systemUserId: system.id });
  return NextResponse.json(out, { status: 201 });
}
