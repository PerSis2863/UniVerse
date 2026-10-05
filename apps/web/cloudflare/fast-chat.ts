// Light-path versions of the busiest chat and notification reads (see fast-api.ts). Each one must
// answer exactly like the Next.js route it stands in for; null hands the call to that route.
import { bool, dbDate, isoDate, json, parseJson, type Caller } from './fast-db';
import { applyViewOnce } from '../src/lib/view-once';
import { presenceOf } from '../src/lib/presence';

// Same as removedBy in src/lib/chat.ts (not imported: that file loads Prisma).
const removedBy = (metadata: unknown) => ((metadata as { moderated?: string } | null)?.moderated === 'removed' ? { moderated: 'removed' as const } : null);

type Row = Record<string, string | number | null>;

const SYSTEM_EMAIL = 'hello@universeimpact.system'; // src/lib/chat.ts
const ONLINE_WINDOW_MS = 60_000;
const PAGE = 50;

let systemUserId: string | null = null;
// Users known to have their welcome chat (ensureWelcome in src/lib/chat.ts creates it).
const welcomed = new Set<string>();
// When each user's lastSeenAt was last written by this instance (at most one write every 30 s).
const touched = new Map<string, number>();

const at = (v: unknown) => (typeof v === 'string' && v ? Date.parse(isoDate(v)!) : NaN);
const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ');

// Messages this user may see: not expired (disappearing) and not deleted "for me" (visibleTo).
const VISIBLE = `(m.expiresAt IS NULL OR m.expiresAt > ?) AND NOT EXISTS (SELECT 1 FROM message_user_states s WHERE s.messageId = m.id AND s.userId = ? AND s.hidden = 1)`;

/** touchPresence (src/lib/chat.ts): the write that records the user as active, at most every 30 s. */
export function presence(userId: string, db: D1Database, nowMs: number): D1PreparedStatement | null {
  if (nowMs - (touched.get(userId) ?? 0) < 30_000) return null;
  touched.set(userId, nowMs);
  if (touched.size > 5000) touched.clear();
  return db.prepare('UPDATE users SET lastSeenAt = ? WHERE id = ? AND (lastSeenAt IS NULL OR lastSeenAt < ?)').bind(dbDate(nowMs), userId, dbDate(nowMs - 30_000));
}

async function systemUser(db: D1Database) {
  if (!systemUserId) systemUserId = (await db.prepare('SELECT id FROM users WHERE email = ?').bind(SYSTEM_EMAIL).first<{ id: string }>())?.id ?? null;
  return systemUserId;
}

/** GET /api/notifications (src/app/api/notifications/route.ts): the newest 30. */
export async function notifications(me: Caller, db: D1Database) {
  const { results } = await db
    .prepare('SELECT id, title, body, type, read, link, createdAt FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 30')
    .bind(me.id)
    .all<Row>();
  return json(
    results.map((n) => ({ id: n.id, title: n.title, body: n.body, type: n.type, read: bool(n.read), link: n.link, createdAt: isoDate(n.createdAt as string) })),
    200,
    { 'Cache-Control': 'no-store' },
  );
}

/**
 * GET /api/chat/conversations/:id/messages (…/messages/route.ts): a page of messages (newest last),
 * who's typing and online, and how far each member has read; marks the chat read. Searches and
 * chats with auto-translate on are left to the Next.js route.
 */
export async function thread(me: Caller, conversationId: string, url: URL, db: D1Database, ctx: ExecutionContext): Promise<Response | null> {
  // Searches, threads and community channels (roles, slow mode) are left to the Next.js route.
  if (url.searchParams.get('q')?.trim() || url.searchParams.get('thread')) return null;
  const mine = await db
    .prepare('SELECT p.id, p.role, p.lastReadAt, p.markedUnread, p.pinnedAt, p.mutedUntil, p.archivedAt, p.translateTo, c.communityId FROM conversation_participants p JOIN conversations c ON c.id = p.conversationId WHERE p.conversationId = ? AND p.userId = ?')
    .bind(conversationId, me.id)
    .first<Row>();
  if (!mine) return json({ error: 'Conversation not found.' }, 404);
  if (mine.translateTo || mine.communityId) return null;
  if (!(await systemUser(db))) return null; // created by the Next.js route on first use

  const nowMs = Date.now();
  const now = dbDate(nowMs);
  const beforeMs = Date.parse(url.searchParams.get('before') ?? '');
  const before = Number.isNaN(beforeMs) ? null : dbDate(beforeMs);

  const [rowsRes, convoRes, membersRes, pinnedRes] = await db.batch<Row>([
    db
      .prepare(
        `SELECT m.id, m.pinnedAt, m.conversationId, m.senderId, m.body, m.type, m.attachmentUrl, m.attachmentName, m.attachmentSize, m.attachmentMime,
           m.metadata, m.createdAt, m.editedAt, m.deletedAt, m.expiresAt, m.forwarded,
           s.name AS senderName, s.avatar AS senderAvatar,
           r.id AS replyId, r.body AS replyBody, r.type AS replyType, r.deletedAt AS replyDeletedAt, rs.id AS replySenderId, rs.name AS replySenderName
         FROM messages m JOIN users s ON s.id = m.senderId
           LEFT JOIN messages r ON r.id = m.replyToId LEFT JOIN users rs ON rs.id = r.senderId
         WHERE m.conversationId = ? AND m.threadId IS NULL AND ${VISIBLE} ${before ? 'AND m.createdAt < ?' : ''}
         ORDER BY m.createdAt DESC LIMIT ${PAGE + 1}`,
      )
      .bind(conversationId, now, me.id, ...(before ? [before] : [])),
    db.prepare('SELECT id, isGroup, name, avatarUrl, disappearingSec FROM conversations WHERE id = ?').bind(conversationId),
    db
      .prepare(
        `SELECT p.userId, p.role AS groupRole, p.lastReadAt, p.typingUntil, u.name, u.avatar, u.role, u.lastSeenAt, u.presence, u.statusText, u.statusEmoji, u.statusUntil
         FROM conversation_participants p JOIN users u ON u.id = p.userId WHERE p.conversationId = ? LIMIT 300`,
      )
      .bind(conversationId),
    db
      .prepare(
        `SELECT m.id, m.body, m.type, m.attachmentName, m.createdAt, m.pinnedAt, s.id AS senderId, s.name AS senderName
         FROM messages m JOIN users s ON s.id = m.senderId
         WHERE m.conversationId = ? AND m.pinnedAt IS NOT NULL AND m.deletedAt IS NULL AND ${VISIBLE}
         ORDER BY m.pinnedAt DESC LIMIT 3`,
      )
      .bind(conversationId, now, me.id),
  ]);
  const convo = convoRes.results[0];
  if (!convo) return json({ error: 'Conversation not found.' }, 404);
  const rows = rowsRes.results;

  // Mark read (latest page only, and only if something new arrived) and record presence, after
  // the answer: the answer shows the state from before, as the Next.js route's does.
  if (!before) {
    const writes: D1PreparedStatement[] = [];
    const newest = at(rows[0]?.createdAt);
    if (bool(mine.markedUnread) || !mine.lastReadAt || newest > at(mine.lastReadAt)) {
      writes.push(db.prepare('UPDATE conversation_participants SET lastReadAt = ?, markedUnread = 0 WHERE id = ?').bind(now, mine.id));
    }
    const seen = presence(me.id, db, nowMs);
    if (seen) writes.push(seen);
    if (writes.length) ctx.waitUntil(db.batch(writes).catch((e) => console.error('fast path chat read marks failed:', e)));
  }

  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE).reverse();
  const ids = page.map((m) => m.id as string);
  const pollIds = page.filter((m) => m.type === 'POLL' && !m.deletedAt).map((m) => m.id as string);
  const [reactionsRes, starsRes, votesRes, threadsRes] = ids.length
    ? await db.batch<Row>([
        db.prepare(`SELECT messageId, emoji, userId FROM message_reactions WHERE messageId IN (${placeholders(ids.length)})`).bind(...ids),
        db.prepare(`SELECT messageId FROM message_user_states WHERE userId = ? AND starred = 1 AND messageId IN (${placeholders(ids.length)})`).bind(me.id, ...ids),
        db.prepare(`SELECT messageId, userId, option FROM poll_votes WHERE messageId IN (${pollIds.length ? placeholders(pollIds.length) : "''"})`).bind(...pollIds),
        db.prepare(`SELECT threadId, COUNT(*) AS n, MAX(createdAt) AS lastAt FROM messages WHERE deletedAt IS NULL AND threadId IN (${placeholders(ids.length)}) GROUP BY threadId`).bind(...ids),
      ])
    : [{ results: [] }, { results: [] }, { results: [] }, { results: [] }];
  const threadOf = new Map<string, { count: number; lastAt: string | null }>();
  for (const t of threadsRes.results) threadOf.set(t.threadId as string, { count: Number(t.n), lastAt: isoDate(t.lastAt as string) });

  const reactionsOf = new Map<string, Record<string, string[]>>();
  for (const r of reactionsRes.results) {
    const byEmoji = reactionsOf.get(r.messageId as string) ?? {};
    (byEmoji[r.emoji as string] ??= []).push(r.userId as string);
    reactionsOf.set(r.messageId as string, byEmoji);
  }
  const starred = new Set(starsRes.results.map((s) => s.messageId as string));
  const votes = votesRes.results;

  // serializeMessage + decorate (src/lib/chat.ts).
  const messages = page.map((m) => {
    const base = {
      id: m.id,
      pinnedAt: isoDate(m.pinnedAt as string | null),
      conversationId: m.conversationId,
      senderId: m.senderId,
      body: m.body,
      type: m.type,
      attachmentUrl: m.attachmentUrl,
      attachmentName: m.attachmentName,
      attachmentSize: m.attachmentSize,
      attachmentMime: m.attachmentMime,
      metadata: parseJson(m.metadata),
      createdAt: isoDate(m.createdAt as string),
      editedAt: isoDate(m.editedAt as string | null),
      deletedAt: isoDate(m.deletedAt as string | null),
      expiresAt: isoDate(m.expiresAt as string | null),
      forwarded: bool(m.forwarded),
      replyTo: m.replyId
        ? { id: m.replyId, body: m.replyDeletedAt ? '' : String(m.replyBody ?? '').slice(0, 200), type: m.replyType, deletedAt: isoDate(m.replyDeletedAt as string | null), sender: { id: m.replySenderId, name: m.replySenderName } }
        : null,
      reactions: reactionsOf.get(m.id as string) ?? {},
      sender: { id: m.senderId, name: m.senderName, avatar: m.senderAvatar },
    };
    const out = m.deletedAt
      ? { ...base, type: 'DELETED', body: '', pinnedAt: null, attachmentUrl: null, attachmentName: null, attachmentSize: null, attachmentMime: null, metadata: removedBy(base.metadata), replyTo: null, reactions: {} }
      : base;
    let poll = null;
    if (out.type === 'POLL') {
      const options: unknown[] = (out.metadata as { options?: unknown[] } | null)?.options ?? [];
      const these = votes.filter((v) => v.messageId === m.id);
      poll = {
        counts: options.map((_, i) => these.filter((v) => Number(v.option) === i).length),
        mine: these.filter((v) => v.userId === me.id).map((v) => Number(v.option)),
        voters: new Set(these.map((v) => v.userId)).size,
      };
    }
    const thread = threadOf.get(m.id as string);
    return { ...applyViewOnce(out, me.id), starred: starred.has(m.id as string), poll, ...(thread ? { thread } : {}) };
  });

  const members = membersRes.results;
  const others = members.filter((p) => p.userId !== me.id);
  const isGroup = bool(convo.isGroup);
  return json(
    {
      conversation: {
        id: convo.id,
        isGroup,
        isOfficial: !isGroup && others.some((p) => p.userId === systemUserId),
        title: isGroup ? convo.name || 'Group chat' : others[0]?.name || 'Unknown user',
        avatarUrl: isGroup ? convo.avatarUrl : others[0]?.avatar ?? null,
        myRole: mine.role,
        disappearingSec: convo.disappearingSec,
        pinned: !!mine.pinnedAt,
        muted: !!mine.mutedUntil && at(mine.mutedUntil) > nowMs,
        archived: !!mine.archivedAt,
        translateTo: null,
        channel: null,
        members: members.map((p) => ({
          id: p.userId,
          name: p.name,
          avatar: p.avatar,
          role: p.role,
          groupRole: p.groupRole,
          online: p.presence !== 'invisible' && !!p.lastSeenAt && nowMs - at(p.lastSeenAt) < ONLINE_WINDOW_MS,
          lastSeenAt: p.presence === 'invisible' ? null : isoDate(p.lastSeenAt as string | null),
          status: presenceOf({ presence: p.presence as string, statusText: p.statusText as string | null, statusEmoji: p.statusEmoji as string | null, statusUntil: isoDate(p.statusUntil as string | null) }, nowMs),
          lastReadAt: isoDate(p.lastReadAt as string | null),
        })),
      },
      typing: others.filter((p) => p.typingUntil && at(p.typingUntil) > nowMs).map((p) => String(p.name).split(' ')[0]),
      pinned: pinnedRes.results.map((p) => ({
        id: p.id,
        body: p.body,
        type: p.type,
        attachmentName: p.attachmentName,
        createdAt: isoDate(p.createdAt as string),
        pinnedAt: isoDate(p.pinnedAt as string),
        sender: { id: p.senderId, name: p.senderName },
      })),
      translations: {},
      messages,
      hasMore,
      me: me.id,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
}

/**
 * GET /api/chat/conversations (src/app/api/chat/conversations/route.ts): the caller's chats, newest
 * activity first, with unread counts and presence. Someone without their welcome chat yet goes to
 * the Next.js route, which creates it.
 */
export async function conversations(me: Caller, db: D1Database, ctx: ExecutionContext): Promise<Response | null> {
  const system = await systemUser(db);
  if (!system) return null;
  const nowMs = Date.now();
  const now = dbDate(nowMs);
  // Community channels are listed under Communities, not Chats.
  const mineIds = `SELECT c.id FROM conversations c WHERE c.communityId IS NULL AND EXISTS (SELECT 1 FROM conversation_participants x WHERE x.conversationId = c.id AND x.userId = ?1) ORDER BY c.updatedAt DESC LIMIT 100`;
  const [welcomeRes, convosRes, membersRes, lastRes, unreadRes] = await db.batch<Row>([
    db
      .prepare(
        `SELECT c.id FROM conversations c WHERE c.isGroup = 0
           AND EXISTS (SELECT 1 FROM conversation_participants a WHERE a.conversationId = c.id AND a.userId = ?1)
           AND EXISTS (SELECT 1 FROM conversation_participants b WHERE b.conversationId = c.id AND b.userId = ?2) LIMIT 1`,
      )
      .bind(me.id, system),
    db.prepare(`SELECT id, isGroup, name, avatarUrl, updatedAt FROM conversations WHERE id IN (${mineIds}) ORDER BY updatedAt DESC`).bind(me.id),
    db
      .prepare(
        `SELECT p.conversationId, p.userId, p.typingUntil, p.pinnedAt, p.mutedUntil, p.archivedAt, p.markedUnread, u.name, u.avatar, u.lastSeenAt, u.presence, u.statusText, u.statusEmoji, u.statusUntil
         FROM conversation_participants p JOIN users u ON u.id = p.userId WHERE p.conversationId IN (${mineIds})`,
      )
      .bind(me.id),
    db
      .prepare(
        `SELECT * FROM (
           SELECT m.conversationId, m.id, m.body, m.type, m.senderId, m.createdAt, m.deletedAt, m.attachmentName,
             ROW_NUMBER() OVER (PARTITION BY m.conversationId ORDER BY m.createdAt DESC) AS n
           FROM messages m
           WHERE m.conversationId IN (${mineIds}) AND (m.expiresAt IS NULL OR m.expiresAt > ?2)
             AND NOT EXISTS (SELECT 1 FROM message_user_states s WHERE s.messageId = m.id AND s.userId = ?1 AND s.hidden = 1)
         ) WHERE n = 1`,
      )
      .bind(me.id, now),
    // Unread = others' messages newer than the caller's last read (or join, minus a second so the
    // "added you" message counts), as the Next.js route counts them.
    db
      .prepare(
        `SELECT m.conversationId, COUNT(*) AS count FROM messages m
         JOIN conversation_participants p ON p.conversationId = m.conversationId AND p.userId = ?1
         WHERE m.senderId <> ?1 AND m.deletedAt IS NULL
           AND julianday(m.createdAt) > COALESCE(julianday(p.lastReadAt), julianday(p.joinedAt) - 1.0 / 86400)
         GROUP BY m.conversationId`,
      )
      .bind(me.id),
  ]);
  if (!welcomed.has(me.id)) {
    if (!welcomeRes.results.length && system !== me.id) return null;
    welcomed.add(me.id);
  }
  const seen = presence(me.id, db, nowMs);
  if (seen) ctx.waitUntil(seen.run().catch((e) => console.error('fast path presence failed:', e)));

  const members = new Map<string, Row[]>();
  for (const p of membersRes.results) members.set(p.conversationId as string, [...(members.get(p.conversationId as string) ?? []), p]);
  const last = new Map(lastRes.results.map((m) => [m.conversationId as string, m]));
  const unread = new Map(unreadRes.results.map((r) => [r.conversationId as string, Number(r.count)]));

  const list = convosRes.results
    .map((c) => {
      const all = members.get(c.id as string) ?? [];
      const others = all.filter((p) => p.userId !== me.id);
      const mine = all.find((p) => p.userId === me.id);
      const m = last.get(c.id as string);
      const other = others[0];
      const isGroup = bool(c.isGroup);
      const markedUnread = bool(mine?.markedUnread);
      const pinnedAt = isoDate((mine?.pinnedAt as string | null) ?? null);
      return {
        id: c.id,
        isGroup,
        isOfficial: !isGroup && others.some((p) => p.userId === system),
        title: isGroup ? c.name || 'Group chat' : other?.name || 'Unknown user',
        avatarUrl: isGroup ? c.avatarUrl : other?.avatar ?? null,
        otherUserId: isGroup ? null : other?.userId ?? null,
        online: !isGroup && other?.presence !== 'invisible' && !!other?.lastSeenAt && nowMs - at(other.lastSeenAt) < ONLINE_WINDOW_MS,
        status: isGroup || !other ? null : presenceOf({ presence: other.presence as string, statusText: other.statusText as string | null, statusEmoji: other.statusEmoji as string | null, statusUntil: isoDate(other.statusUntil as string | null) }, nowMs),
        lastSeenAt: isGroup || other?.presence === 'invisible' ? null : isoDate((other?.lastSeenAt as string | null) ?? null),
        memberCount: all.length,
        typing: others.filter((p) => p.typingUntil && at(p.typingUntil) > nowMs).map((p) => String(p.name).split(' ')[0]),
        lastMessage: m
          ? {
              id: m.id,
              body: m.deletedAt ? '' : String(m.body).slice(0, 140),
              type: m.type,
              senderId: m.senderId,
              createdAt: isoDate(m.createdAt as string),
              deletedAt: isoDate(m.deletedAt as string | null),
              attachmentName: m.attachmentName,
              mine: m.senderId === me.id,
            }
          : null,
        unread: Math.max(unread.get(c.id as string) ?? 0, markedUnread ? 1 : 0),
        markedUnread,
        pinned: !!pinnedAt,
        pinnedAt,
        muted: !!mine?.mutedUntil && at(mine.mutedUntil) > nowMs,
        archived: !!mine?.archivedAt,
        activityAt: isoDate((m?.createdAt as string) ?? (c.updatedAt as string)),
      };
    })
    // Pinned chats first (most recently pinned on top), then by latest activity.
    .sort((a, b) => (a.pinnedAt || b.pinnedAt)
      ? new Date(b.pinnedAt ?? 0).getTime() - new Date(a.pinnedAt ?? 0).getTime()
      : new Date(b.activityAt!).getTime() - new Date(a.activityAt!).getTime());

  return json({ conversations: list, me: me.id }, 200, { 'Cache-Control': 'no-store' });
}
