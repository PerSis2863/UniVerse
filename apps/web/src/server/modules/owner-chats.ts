import type { Prisma } from '@prisma/client';
import type { Router } from '../router';
import prisma from '@/lib/db';
import { BadRequestException, NotFoundException } from '../http';
import { notify } from '../email';
import { publish, publishChat } from '../realtime';
import { MAX_BODY, getSystemUser } from '@/lib/chat';
import { isOwnerEmail } from '../auth';

// Owner console → Chats and Announce: watch every chat live, step in as UniVerse, and reach
// everyone at once. People always see that it was UniVerse: an edited message reads "edited by
// UniVerse", a removed one "Removed by UniVerse", and team posts are labelled. Nothing here lets
// the owner write as someone else. Every action is kept in owner_changes (edits and removals can
// be undone from Changes).

type Meta = Record<string, unknown>;
const asMeta = (v: unknown): Meta => (v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Meta) } : {});
const ROLES = ['STUDENT', 'TEACHER', 'ADMIN', 'INDUSTRY_MENTOR'] as const;
const short = (s: string, n = 50) => (s.length > n ? `${s.slice(0, n)}…` : s);
const plain = (o: unknown) => JSON.parse(JSON.stringify(o ?? null));

const chatCard = {
  id: true, name: true, isGroup: true, updatedAt: true,
  participants: { take: 12, select: { user: { select: { id: true, name: true, role: true, lastSeenAt: true } } } },
  messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, type: true, createdAt: true, deletedAt: true, sender: { select: { name: true } } } },
  _count: { select: { messages: true, participants: true } },
} as const;

export default function ownerChatsModule(router: Router) {
  const r = router.controller('owner', { owner: true });

  /** Every chat, newest activity first. `q` finds people, group names and message text. */
  r.get('chats', async ({ query }) => {
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
    const person = { OR: [{ name: { contains: q } }, { email: { contains: q } }] };
    const [chats, hits, activeNow] = await Promise.all([
      prisma.conversation.findMany({
        where: q ? { OR: [{ name: { contains: q } }, { participants: { some: { user: { is: person } } } }] } : {},
        orderBy: { updatedAt: 'desc' }, take: 80, select: chatCard,
      }),
      q
        ? prisma.message.findMany({
            where: { body: { contains: q }, type: { not: 'SYSTEM' } },
            orderBy: { createdAt: 'desc' }, take: 50,
            select: { id: true, body: true, type: true, createdAt: true, deletedAt: true, conversationId: true, sender: { select: { id: true, name: true } }, conversation: { select: { name: true, isGroup: true } } },
          })
        : [],
      prisma.message.count({ where: { createdAt: { gt: new Date(Date.now() - 5 * 60_000) } } }),
    ]);
    return { chats, hits, activeNow };
  });

  /** A chat as it is right now, with everything (deleted, disappearing) and who is in it. */
  r.get<{ id: string }>('chats/:id', async ({ params, query }) => {
    const convo = await prisma.conversation.findUnique({
      where: { id: params.id },
      select: {
        id: true, name: true, isGroup: true, createdAt: true, disappearingSec: true,
        participants: { select: { role: true, typingUntil: true, user: { select: { id: true, name: true, role: true, email: true, lastSeenAt: true } } } },
      },
    });
    if (!convo) throw new NotFoundException('Chat not found');
    const before = query.before ? new Date(String(query.before)) : undefined;
    const messages = await prisma.message.findMany({
      where: { conversationId: params.id, ...(before && { createdAt: { lt: before } }) },
      orderBy: { createdAt: 'desc' }, take: 150,
      select: {
        id: true, body: true, type: true, createdAt: true, editedAt: true, deletedAt: true, expiresAt: true, metadata: true, forwarded: true,
        attachmentUrl: true, attachmentName: true, attachmentMime: true, sender: { select: { id: true, name: true } },
        reactions: { select: { emoji: true } },
      },
    });
    const now = Date.now();
    return {
      conversation: {
        ...convo,
        typing: convo.participants.filter((p) => p.typingUntil && p.typingUntil.getTime() > now).map((p) => p.user.name),
        participants: convo.participants.map(({ typingUntil: _t, ...p }) => p), // eslint-disable-line @typescript-eslint/no-unused-vars
      },
      messages: messages.reverse(),
      hasMore: messages.length === 150,
    };
  });

  /** Changes the text of any message. Everyone in the chat sees "edited by UniVerse". */
  r.patch<{ id: string }>('messages/:id', async ({ params, body, user }) => {
    const msg = await prisma.message.findUnique({ where: { id: params.id }, select: { id: true, conversationId: true, type: true, body: true, editedAt: true, deletedAt: true, metadata: true } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.deletedAt) throw new BadRequestException('This message was removed. Restore it first.');
    if (msg.type !== 'TEXT') throw new BadRequestException('Only text messages can be edited. You can remove this one.');
    const text = String(body?.body ?? '').trim().slice(0, MAX_BODY);
    if (!text) throw new BadRequestException('The message can’t be empty. Remove it instead.');
    if (text === msg.body) return { ok: true };
    const metadata = { ...asMeta(msg.metadata), moderated: 'edited' };
    const editedAt = new Date();
    await prisma.$transaction([
      prisma.message.update({ where: { id: msg.id }, data: { body: text, editedAt, metadata } }),
      prisma.messageTranslation.deleteMany({ where: { messageId: msg.id } }),
    ]);
    const change = await prisma.ownerChange.create({
      data: {
        ownerId: user.id, action: 'UPDATE', model: 'Message', recordId: msg.id, summary: `Edited a message: “${short(msg.body)}” → “${short(text)}”`,
        before: plain({ body: msg.body, editedAt: msg.editedAt, metadata: msg.metadata }), after: plain({ body: text, editedAt, metadata }),
      },
    });
    publishChat(msg.conversationId);
    return { ok: true, changeId: change.id };
  });

  /** Removes a message for everyone. They see "Removed by UniVerse"; it can be restored. */
  r.post<{ id: string }>('messages/:id/remove', async ({ params, user }) => {
    const msg = await prisma.message.findUnique({ where: { id: params.id }, select: { id: true, conversationId: true, body: true, type: true, deletedAt: true, metadata: true } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.deletedAt) throw new BadRequestException('This message is already removed.');
    const metadata = { ...asMeta(msg.metadata), moderated: 'removed' };
    const deletedAt = new Date();
    await prisma.message.update({ where: { id: msg.id }, data: { deletedAt, metadata } });
    const change = await prisma.ownerChange.create({
      data: {
        ownerId: user.id, action: 'UPDATE', model: 'Message', recordId: msg.id, summary: `Removed a message: “${short(msg.body || msg.type)}”`,
        before: plain({ deletedAt: null, metadata: msg.metadata }), after: plain({ deletedAt, metadata }),
      },
    });
    publishChat(msg.conversationId);
    return { ok: true, changeId: change.id };
  });

  /** Brings back a message UniVerse removed. */
  r.post<{ id: string }>('messages/:id/restore', async ({ params, user }) => {
    const msg = await prisma.message.findUnique({ where: { id: params.id }, select: { id: true, conversationId: true, body: true, type: true, deletedAt: true, metadata: true } });
    if (!msg) throw new NotFoundException('Message not found');
    const meta = asMeta(msg.metadata);
    if (!msg.deletedAt || meta.moderated !== 'removed') throw new BadRequestException('Only messages UniVerse removed can be restored. People’s own deletions stay deleted.');
    delete meta.moderated;
    if (Object.keys(meta).length) await prisma.message.update({ where: { id: msg.id }, data: { deletedAt: null, metadata: meta as Prisma.InputJsonObject } });
    else await prisma.$executeRawUnsafe('UPDATE messages SET deletedAt = NULL, metadata = NULL WHERE id = ?', msg.id); // Prisma won't write a plain null to JSON
    await prisma.ownerChange.create({ data: { ownerId: user.id, action: 'RESTORE', model: 'Message', recordId: msg.id, summary: `Restored a message: “${short(msg.body || msg.type)}”` } });
    publishChat(msg.conversationId);
    return { ok: true };
  });

  /** A post from the UniVerse Team in any chat, shown as a labelled notice in the middle. */
  r.post<{ id: string }>('chats/:id/post', async ({ params, body, user }) => {
    const text = String(body?.body ?? '').trim().slice(0, 1000);
    if (!text) throw new BadRequestException('Write something first.');
    const convo = await prisma.conversation.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!convo) throw new NotFoundException('Chat not found');
    const system = await getSystemUser();
    const [msg] = await prisma.$transaction([
      prisma.message.create({ data: { conversationId: convo.id, senderId: system.id, type: 'SYSTEM', body: `UniVerse Team: ${text}`, metadata: { team: true } }, select: { id: true } }),
      prisma.conversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } }),
    ]);
    await prisma.ownerChange.create({ data: { ownerId: user.id, action: 'POST', model: 'Message', recordId: msg.id, summary: `Posted as UniVerse Team: “${short(text)}”` } });
    publishChat(convo.id);
    return { ok: true, id: msg.id };
  });

  /** Takes someone out of a group chat. The group sees that UniVerse removed them. */
  r.delete<{ id: string; userId: string }>('chats/:id/members/:userId', async ({ params, user }) => {
    const part = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: params.id, userId: params.userId } },
      select: { id: true, role: true, joinedAt: true, conversation: { select: { isGroup: true, name: true } }, user: { select: { name: true } } },
    });
    if (!part) throw new NotFoundException('They’re not in this chat.');
    if (!part.conversation.isGroup) throw new BadRequestException('People can only be taken out of group chats.');
    const system = await getSystemUser();
    await prisma.$transaction([
      prisma.conversationParticipant.delete({ where: { id: part.id } }),
      prisma.message.create({ data: { conversationId: params.id, senderId: system.id, type: 'SYSTEM', body: `UniVerse removed ${part.user.name} from the group`, metadata: { team: true } } }),
      prisma.conversation.update({ where: { id: params.id }, data: { updatedAt: new Date() } }),
    ]);
    await prisma.ownerChange.create({
      data: { ownerId: user.id, action: 'REMOVE', model: 'ConversationParticipant', recordId: part.id, summary: `Took ${part.user.name} out of “${part.conversation.name ?? 'a group'}”` },
    });
    publishChat(params.id, [params.userId]);
    return { ok: true };
  });

  /** A message from the official UniVerse Impact account, in that person's chat with it. */
  r.post<{ id: string }>('people/:id/message', async ({ params, body, user }) => {
    const text = String(body?.body ?? '').trim().slice(0, MAX_BODY);
    if (!text) throw new BadRequestException('Write something first.');
    const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
    if (!target) throw new NotFoundException('Person not found');
    const system = await getSystemUser();
    if (system.id === target.id) throw new BadRequestException('That is the UniVerse Impact account itself.');
    let convo = await prisma.conversation.findFirst({
      where: { isGroup: false, AND: [{ participants: { some: { userId: target.id } } }, { participants: { some: { userId: system.id } } }] },
      select: { id: true },
    });
    convo ??= await prisma.conversation.create({ data: { participants: { create: [{ userId: target.id }, { userId: system.id, lastReadAt: new Date() }] } }, select: { id: true } });
    const [msg] = await prisma.$transaction([
      prisma.message.create({ data: { conversationId: convo.id, senderId: system.id, type: 'TEXT', body: text }, select: { id: true } }),
      prisma.conversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } }),
      prisma.conversationParticipant.updateMany({ where: { conversationId: convo.id, userId: system.id }, data: { lastReadAt: new Date() } }),
    ]);
    await prisma.ownerChange.create({ data: { ownerId: user.id, action: 'POST', model: 'Message', recordId: msg.id, summary: `Messaged ${target.name} from UniVerse Impact: “${short(text)}”` } });
    publishChat(convo.id);
    return { ok: true, conversationId: convo.id };
  });

  /** An in-app notification to one person (and an email copy if they get emails). */
  r.post<{ id: string }>('people/:id/notify', async ({ params, body, user }) => {
    const { title, text, link } = notice(body);
    const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
    if (!target) throw new NotFoundException('Person not found');
    await notify(target.id, { title, body: text, link: link ?? undefined, type: 'announcement', email: body?.email === true });
    await prisma.ownerChange.create({ data: { ownerId: user.id, action: 'NOTIFY', model: 'Notification', recordId: target.id, summary: `Notified ${target.name}: “${short(title)}”` } });
    return { ok: true };
  });

  // ── Announcements: a notification for everyone, or everyone with one role ──

  r.get('announcements', async () => {
    const [counts, recent] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], where: { status: { not: 'SUSPENDED' } }, _count: { _all: true } }),
      prisma.ownerChange.findMany({ where: { action: 'ANNOUNCE' }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return { counts: Object.fromEntries(counts.map((c) => [c.role, c._count._all])), recent };
  });

  r.post('announcements', async ({ body, user }) => {
    const { title, text, link } = notice(body);
    const role = ROLES.find((x) => x === body?.role);
    const system = await getSystemUser();
    // One statement however many people there are (D1 allows 100 values per query).
    const sent = await prisma.$executeRawUnsafe(
      `INSERT INTO notifications (id, userId, title, body, type, read, link, createdAt)
       SELECT lower(hex(randomblob(12))), id, ?, ?, 'announcement', 0, ?, ? FROM users
       WHERE status != 'SUSPENDED' AND id != ?${role ? ' AND role = ?' : ''}`,
      title, text, link, new Date().toISOString().replace('Z', '+00:00'), system.id, ...(role ? [role] : []),
    );
    // Ring the bell straight away for people using UniVerse right now (the rest see it next time).
    const online = await prisma.user.findMany({ where: { lastSeenAt: { gt: new Date(Date.now() - 5 * 60_000) }, ...(role && { role }) }, select: { id: true }, take: 40 });
    publish(online.map((u) => u.id), { type: 'notification' });
    const who = role ? { STUDENT: 'students', TEACHER: 'teachers', ADMIN: 'admins', INDUSTRY_MENTOR: 'mentors' }[role] : 'everyone';
    await prisma.ownerChange.create({
      data: { ownerId: user.id, action: 'ANNOUNCE', model: 'Notification', recordId: role ?? 'ALL', summary: `Announcement to ${who} (${sent}): “${short(title)}”`, after: plain({ title, body: text, link, role: role ?? null, sent }) },
    });
    return { ok: true, sent };
  });

  /** Everything about one person in one file: their account, every linked record and their messages. */
  r.get<{ id: string }>('people/:id/export', async ({ params }) => {
    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) throw new NotFoundException('Person not found');
    const [messages, chats, signIns, actions, notifications] = await Promise.all([
      prisma.message.findMany({ where: { senderId: user.id }, orderBy: { createdAt: 'desc' }, take: 5000, select: { id: true, conversationId: true, type: true, body: true, attachmentUrl: true, createdAt: true, editedAt: true, deletedAt: true } }),
      prisma.conversationParticipant.findMany({ where: { userId: user.id }, select: { joinedAt: true, role: true, conversation: { select: { id: true, name: true, isGroup: true, participants: { select: { user: { select: { id: true, name: true } } } } } } } }),
      prisma.loginEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 2000 }),
      prisma.auditLog.findMany({ where: { actorId: user.id }, orderBy: { createdAt: 'desc' }, take: 2000 }),
      prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 2000 }),
    ]);
    return { exportedAt: new Date(), user: { ...user, owner: isOwnerEmail(user.email) }, chats, messages, signIns, actions, notifications };
  });
}

function notice(body: { title?: unknown; body?: unknown; link?: unknown } | undefined) {
  const title = String(body?.title ?? '').trim().slice(0, 200);
  const text = String(body?.body ?? '').trim().slice(0, 1000);
  if (!title || !text) throw new BadRequestException('Add a title and a message.');
  const raw = String(body?.link ?? '').trim();
  // Links stay inside UniVerse (a path such as /events) or go to a normal web address.
  if (raw && !/^\/(?!\/)/.test(raw) && !/^https:\/\//.test(raw)) throw new BadRequestException('The link must start with / or https://');
  return { title, text, link: raw.slice(0, 300) || null };
}
