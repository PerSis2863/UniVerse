import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { isOnline } from '@/lib/chat';
import { planLimits } from '@/lib/plan-limits';
import { later, notify, notifyMany } from './email';
import { quietFor } from './focus';
import { firstUrl, linkPreview } from './link-preview';
import { alertOwner, watchWordsIn } from './moderation';
import { deliver, publishChat } from './realtime';
import { pushService } from './services/push.service';
import { pretranslate } from './translate';

// What happens around a new chat message once it's saved: live updates to open tabs, and
// notifications (in the app, push, and email for those who have it on) for people who are away,
// mentions, and community channels. Shared by sending (/api/chat/conversations/[id]/messages)
// and scheduled messages (src/server/scheduled-messages.ts).

/**
 * Everything after a message is saved, in the background: a preview card for its first link,
 * translations for members with auto-translate, live updates and notifications, @mentions, and
 * watch words for the owner.
 */
export function afterSend(
  message: { id: string; conversationId: string; type: string; body: string; metadata: unknown },
  from: { id: string; name: string },
  chat: { communityId: string | null; systemUserId: string },
) {
  const { id, conversationId, type, body } = message;
  // A link gets a preview card (title and description, read once by the server).
  const link = type === 'TEXT' ? firstUrl(body) : null;
  if (link) {
    later(async () => {
      const preview = await linkPreview(link);
      if (!preview) return;
      await prisma.message.update({ where: { id }, data: { metadata: { ...((message.metadata as object | null) ?? {}), link: { ...preview } } as unknown as Prisma.InputJsonValue } });
      publishChat(conversationId);
    });
  }
  later(async () => {
    // Members with auto-translate get the message already translated (a few seconds at most).
    if (type === 'TEXT' && body.trim()) await pretranslate(conversationId, id, body, from.id).catch(() => {});
    // Community channels can be large: live updates go to members active lately (capped), and
    // nobody is notified per message (only @mentions, below). Chats and groups notify as usual.
    if (chat.communityId) await publishGroupChannel(conversationId);
    else await notifyAway(conversationId, from, chat.systemUserId, type, body, id);
  });
  if (type === 'TEXT' && body.includes('@')) later(() => notifyMentions(conversationId, from, body));
  // Watch words (owner console → Live chats) alert the owner.
  if ((type === 'TEXT' || type === 'POLL') && body) {
    later(async () => {
      const found = await watchWordsIn(body);
      if (found.length) await alertOwner(found, from, conversationId, body);
    });
  }
}

const AWAY_MS = 5 * 60_000;
const EMAIL_GAP_MS = 60 * 60_000;
const PREVIEW: Record<string, string> = { IMAGE: '📷 Photo', FILE: '📎 File', AUDIO: '🎤 Voice message', VIDEO: '🎬 Video', CALL: '📞 Call', POLL: '📊 Poll', LOCATION: '📍 Location', CONTACT: '👤 Contact' };

// Pushes the message to everyone's open tabs. Members who don't have UniVerse open get a
// notification (and an email if they have them on), at most once an hour per chat, so a busy chat
// doesn't flood their inbox.
export async function notifyAway(conversationId: string, from: { id: string; name: string }, systemUserId: string, type: string, body: string, messageId: string) {
  const everyone = await prisma.conversationParticipant.findMany({ where: { conversationId }, select: { userId: true } });
  const online = await deliver(everyone.map((m) => m.userId), { type: 'chat', conversationId, ...(type === 'CALL' ? { call: true } : {}) });
  const now = new Date();
  const [convo, allMembers] = await Promise.all([
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
  // With live updates, "away" means no open tab; without them, no activity for a few minutes.
  const members = online ? allMembers.filter((m) => !online.has(m.userId)) : allMembers;
  if (!convo) return;
  if (type === 'CALL') {
    // A call rings phones and computers with UniVerse closed (a push notification with Answer and
    // Decline), for everyone who has no tab open, muted or not: a call is worth an interruption.
    const candidates = everyone.map((m) => m.userId).filter((u) => u !== from.id && u !== systemUserId && !online?.has(u));
    // Focus (Busy, In class, Sleeping): no ringing push, unless the caller is a favourite.
    const quiet = await quietFor(candidates, from.id);
    const ring = candidates.filter((u) => !quiet.has(u));
    if (ring.length) {
      await pushService.sendToMany(ring, {
        title: convo.isGroup ? `${from.name} · ${convo.name ?? 'Group call'}` : from.name,
        body: `Incoming ${body === 'Video call' ? 'video' : 'voice'} call`,
        url: `/call/${messageId}`,
        tag: messageId,
        call: true,
      }).catch(() => 0);
    }
  }
  if (members.length === 0) return;
  const recent = await prisma.notification.findMany({
    where: { userId: { in: members.map((m) => m.userId) }, type: 'chat', link: { endsWith: `?c=${conversationId}` }, createdAt: { gt: new Date(now.getTime() - EMAIL_GAP_MS) } },
    select: { userId: true },
  });
  const skip = new Set(recent.map((r) => r.userId));
  const text = (type === 'TEXT' ? body : PREVIEW[type] ?? body).slice(0, 200);
  const title = convo.isGroup ? `New messages in ${convo.name ?? 'a group chat'}` : `New message from ${from.name}`;
  const fresh = members.filter((m) => !skip.has(m.userId));
  const inbox = (role: string) => `/${role === 'ADMIN' ? 'admin' : role === 'TEACHER' ? 'teacher' : 'student'}/inbox?c=${conversationId}`;
  if (type !== 'CALL' && fresh.length) {
    // Same once-an-hour rule as the in-app notification; the tag folds a chat's pushes into one.
    const byRole = new Map<string, string[]>();
    for (const m of fresh) byRole.set(m.user.role, [...(byRole.get(m.user.role) ?? []), m.userId]);
    await Promise.all([...byRole].map(([role, ids]) => pushService.sendToMany(ids, {
      title,
      body: convo.isGroup ? `${from.name}: ${text}` : text,
      url: inbox(role),
      tag: `chat-${conversationId}`,
    }).catch(() => 0)));
  }
  await Promise.all(
    fresh
      .map((m) =>
        notify(m.userId, {
          type: 'chat',
          title,
          body: convo.isGroup ? `${from.name}: ${text}` : text,
          link: inbox(m.user.role),
        }),
      ),
  );
}

/**
 * "@Name" in a message pings that member (in the app and live), even if they muted the chat. In
 * groups, "@here" pings the members online now and "@channel" (or "@everyone") everyone: for the
 * group's admins, anyone in a group of up to 50, and a community's moderators. In-app only.
 */
export async function notifyMentions(conversationId: string, from: { id: string; name: string }, body: string) {
  const text = body.toLowerCase();
  const [convo, members] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: conversationId }, select: { isGroup: true, name: true, communityId: true } }),
    prisma.conversationParticipant.findMany({ where: { conversationId }, take: 2000, select: { userId: true, role: true, user: { select: { name: true, role: true, lastSeenAt: true, presence: true } } } }),
  ]);
  if (!convo?.isGroup) return; // in a 1:1 chat the other person already gets every message
  const others = members.filter((m) => m.userId !== from.id);
  const toEveryone = /(^|[^\w@])@(channel|everyone)\b/.test(text);
  const toHere = /(^|[^\w@])@here\b/.test(text);
  let wide: typeof others = [];
  if (toEveryone || toHere) {
    let allowed = members.length <= 50 || members.some((m) => m.userId === from.id && m.role === 'ADMIN');
    if (!allowed && convo.communityId) {
      const cm = await prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: convo.communityId, userId: from.id } }, select: { role: true } });
      allowed = cm?.role === 'OWNER' || cm?.role === 'MOD';
    }
    if (allowed) wide = toEveryone ? others : others.filter((m) => isOnline(m.user.lastSeenAt, m.user.presence));
  }
  const inbox = (role: string) => `/${role === 'ADMIN' ? 'admin' : role === 'TEACHER' ? 'teacher' : 'student'}/inbox?c=${conversationId}`;
  const where = convo.name ?? 'a group';
  // @here / @channel: one batch per portal (their inbox links differ).
  for (const role of ['ADMIN', 'TEACHER', 'STUDENT']) {
    const ids = wide.filter((m) => (m.user.role === 'ADMIN' || m.user.role === 'TEACHER' ? m.user.role : 'STUDENT') === role).map((m) => m.userId).slice(0, 500);
    if (ids.length) await notifyMany(ids, { type: 'mention', title: `${from.name} mentioned ${toEveryone ? 'everyone' : 'everyone online'} in ${where}`, body: body.slice(0, 200), link: inbox(role), email: false });
  }
  const pinged = new Set(wide.map((m) => m.userId));
  const named = others.filter(({ userId, user }) => {
    if (pinged.has(userId)) return false;
    const full = user.name.toLowerCase();
    const first = full.split(' ')[0];
    return text.includes(`@${full}`) || new RegExp(`@${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`).test(text);
  });
  await Promise.all(
    named.map((m) =>
      notify(m.userId, {
        type: 'mention',
        title: `${from.name} mentioned you in ${where}`,
        body: body.slice(0, 200),
        link: inbox(m.user.role),
        email: false,
      }),
    ),
  );
}

/** A new message in a community channel: refresh the open tabs of members active in the last 15 minutes. */
export async function publishGroupChannel(conversationId: string) {
  const active = await prisma.conversationParticipant.findMany({
    where: { conversationId, user: { lastSeenAt: { gt: new Date(Date.now() - 15 * 60_000) } } },
    select: { userId: true },
    take: planLimits().livePushes,
  });
  await deliver(active.map((a) => a.userId), { type: 'chat', conversationId });
}
