import prisma from '@/lib/db';
import { getSystemUser, isOwnBlobUrl } from '@/lib/chat';
import { planLimits } from '@/lib/plan-limits';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, NotFoundException } from './http';
import { notify } from './email';
import { publish } from './realtime';

// Status updates ("stories"), like WhatsApp's: a photo or a coloured text card, gone after 24
// hours. You see the statuses of people you share a chat with; on your own you see who viewed them.
// Stage 5 · B7.9: viewers can react (one emoji, shown to the person who posted it, who's told in
// the app), and a status can be for your close friends only (a list you keep).

const DAY = 86_400_000;
const MAX_ACTIVE = 30;
export const STATUS_BACKGROUNDS = ['#253745', '#253745', '#db2777', '#e11d48', '#ea580c', '#059669', '#0891b2', '#11212d'];
const dbNow = () => new Date().toISOString().replace('Z', '+00:00');
export const STATUS_REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥'];
const MAX_CLOSE = 150;
// A close-friends status is seen only by the people its author listed (and the author).
const AUDIENCE = `(s."audience" = 'ALL' OR s."userId" = ? OR EXISTS (SELECT 1 FROM "close_friends" c WHERE c."userId" = s."userId" AND c."friendId" = ?))`;

// Everyone who shares at least one chat with this user.
const CONTACTS = `SELECT p2."userId" FROM "conversation_participants" p1 JOIN "conversation_participants" p2 ON p2."conversationId" = p1."conversationId" WHERE p1."userId" = ?`;

type Row = { id: string; userId: string; kind: string; body: string; mediaUrl: string | null; background: string | null; createdAt: string; expiresAt: string; audience: string; name: string; avatar: string | null; viewed: number | null; reaction: string | null };

export async function listStatuses(user: SessionUser) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT s."id", s."userId", s."kind", s."body", s."mediaUrl", s."background", s."createdAt", s."expiresAt", s."audience", u."name", u."avatar",
       (SELECT 1 FROM "chat_status_views" v WHERE v."statusId" = s."id" AND v."userId" = ?) AS "viewed",
       (SELECT v."reaction" FROM "chat_status_views" v WHERE v."statusId" = s."id" AND v."userId" = ?) AS "reaction"
     FROM "chat_statuses" s JOIN "users" u ON u."id" = s."userId"
     WHERE s."expiresAt" > ? AND (s."userId" = ? OR s."userId" IN (${CONTACTS})) AND ${AUDIENCE}
     ORDER BY s."createdAt" ASC LIMIT 400`,
    user.id, user.id, dbNow(), user.id, user.id, user.id, user.id,
  );
  const mineIds = rows.filter((r) => r.userId === user.id).map((r) => r.id);
  const views = mineIds.length
    ? await prisma.chatStatusView.findMany({ where: { statusId: { in: mineIds } }, orderBy: { viewedAt: 'desc' }, select: { statusId: true, viewedAt: true, reaction: true, user: { select: { id: true, name: true, avatar: true } } } })
    : [];
  const people = new Map<string, { user: { id: string; name: string; avatar: string | null }; mine: boolean; items: unknown[]; unseen: number; latest: string }>();
  for (const r of rows) {
    const p = people.get(r.userId) ?? { user: { id: r.userId, name: r.name, avatar: r.avatar }, mine: r.userId === user.id, items: [], unseen: 0, latest: r.createdAt };
    const seen = r.userId === user.id || !!r.viewed;
    if (!seen) p.unseen++;
    p.latest = r.createdAt;
    p.items.push({
      id: r.id, kind: r.kind, body: r.body, mediaUrl: r.mediaUrl, background: r.background, createdAt: new Date(r.createdAt).toISOString(), seen, audience: r.audience,
      ...(r.userId === user.id ? { viewers: views.filter((v) => v.statusId === r.id).map((v) => ({ ...v.user, viewedAt: v.viewedAt, reaction: v.reaction })) } : { myReaction: r.reaction }),
    });
    people.set(r.userId, p);
  }
  // Yours first, then people with something new (newest first), then the rest.
  return [...people.values()].sort((a, b) => Number(b.mine) - Number(a.mine) || Number(b.unseen > 0) - Number(a.unseen > 0) || b.latest.localeCompare(a.latest));
}

export async function postStatus(user: SessionUser, body: Record<string, unknown>) {
  const kind = body.kind === 'IMAGE' ? 'IMAGE' : 'TEXT';
  const text = String(body.body ?? '').trim().slice(0, 700);
  const mediaUrl = kind === 'IMAGE' ? String(body.mediaUrl ?? '') : null;
  if (kind === 'IMAGE' && !isOwnBlobUrl(mediaUrl)) throw new BadRequestException('Upload a photo first.');
  if (kind === 'TEXT' && !text) throw new BadRequestException('Write something for your status.');
  const background = STATUS_BACKGROUNDS.includes(String(body.background)) ? String(body.background) : STATUS_BACKGROUNDS[0];
  const active = await prisma.chatStatus.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } });
  if (active >= MAX_ACTIVE) throw new BadRequestException(`You can have up to ${MAX_ACTIVE} status updates at a time.`);
  const audience = body.audience === 'CLOSE' ? 'CLOSE' : 'ALL';
  if (audience === 'CLOSE' && !(await prisma.closeFriend.count({ where: { userId: user.id } }))) throw new BadRequestException('Choose your close friends first.');
  const created = await prisma.chatStatus.create({ data: { userId: user.id, kind, body: text, mediaUrl, background: kind === 'TEXT' ? background : null, audience, expiresAt: new Date(Date.now() + DAY) }, select: { id: true } });
  // Contacts who are online see it appear (capped: each live push is a subrequest).
  const contacts = audience === 'CLOSE'
    ? (await prisma.closeFriend.findMany({ where: { userId: user.id }, select: { friendId: true }, take: planLimits().livePushes })).map((c) => ({ userId: c.friendId }))
    : await prisma.$queryRawUnsafe<{ userId: string }[]>(`SELECT DISTINCT "userId" FROM (${CONTACTS}) WHERE "userId" <> ? LIMIT ${planLimits().livePushes}`, user.id, user.id);
  publish(contacts.map((c) => c.userId), { type: 'refresh', keys: ['/api/chat/status'] });
  return created;
}

async function visible(user: SessionUser, id: string) {
  const rows = await prisma.$queryRawUnsafe<{ userId: string }[]>(
    `SELECT s."userId" FROM "chat_statuses" s WHERE s."id" = ? AND s."expiresAt" > ? AND (s."userId" = ? OR s."userId" IN (${CONTACTS})) AND ${AUDIENCE}`, id, dbNow(), user.id, user.id, user.id, user.id,
  );
  if (!rows.length) throw new NotFoundException('This status has expired.');
  return rows[0].userId;
}

/** POST /api/chat/status/:id {} (seen) or { reaction } (an emoji, or null to take it back). */
export async function viewStatus(user: SessionUser, id: string, body: Record<string, unknown> = {}) {
  const owner = await visible(user, id);
  if (owner === user.id) return { ok: true };
  const reacting = 'reaction' in body;
  const reaction = reacting && typeof body.reaction === 'string' && STATUS_REACTIONS.includes(body.reaction) ? body.reaction : null;
  if (reacting && body.reaction != null && !reaction) throw new BadRequestException('Pick one of the reactions.');
  const before = reacting ? await prisma.chatStatusView.findUnique({ where: { statusId_userId: { statusId: id, userId: user.id } }, select: { reaction: true } }) : null;
  await prisma.chatStatusView.upsert({ where: { statusId_userId: { statusId: id, userId: user.id } }, create: { statusId: id, userId: user.id, reaction }, update: reacting ? { reaction } : {} });
  // The person who posted it is told in the app (never by email), once per new reaction.
  if (reaction && before?.reaction !== reaction) await notify(owner, { title: `${user.name ?? 'Someone'} reacted ${reaction} to your status`, body: 'Open Messages to see who viewed it.', type: 'chat', email: false });
  if (reacting) publish([owner], { type: 'refresh', keys: ['/api/chat/status'] });
  return { ok: true, reaction };
}

/** GET /api/chat/status/close-friends: my close friends and the people I chat with (to choose from). */
export async function closeFriends(user: SessionUser) {
  const system = await getSystemUser();
  const [mine, contacts] = await Promise.all([
    prisma.closeFriend.findMany({ where: { userId: user.id }, select: { friendId: true } }),
    // People only: not the app's own account.
    prisma.$queryRawUnsafe<{ id: string; name: string; avatar: string | null }[]>(
      `SELECT DISTINCT u."id", u."name", u."avatar" FROM "users" u WHERE u."id" IN (${CONTACTS}) AND u."id" <> ? AND u."id" <> ? AND u."status" = 'ACTIVE' ORDER BY u."name" LIMIT 500`, user.id, user.id, system.id,
    ),
  ]);
  return { ids: mine.map((m) => m.friendId), people: contacts };
}

/** PUT /api/chat/status/close-friends { ids }: replaces my close friends (people I chat with only). */
export async function setCloseFriends(user: SessionUser, body: Record<string, unknown>) {
  const system = await getSystemUser();
  const wanted = [...new Set((Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === 'string' && x !== user.id && x !== system.id))].slice(0, MAX_CLOSE);
  const ok = wanted.length
    ? new Set((await prisma.$queryRawUnsafe<{ userId: string }[]>(`SELECT DISTINCT "userId" FROM (${CONTACTS}) WHERE "userId" IN (SELECT value FROM json_each(?))`, user.id, JSON.stringify(wanted))).map((r) => r.userId))
    : new Set<string>();
  const ids = wanted.filter((id) => ok.has(id));
  await prisma.closeFriend.deleteMany({ where: { userId: user.id } });
  if (ids.length) await prisma.closeFriend.createMany({ data: ids.map((friendId) => ({ userId: user.id, friendId })) });
  return { ids };
}

export async function deleteStatus(user: SessionUser, id: string) {
  const res = await prisma.chatStatus.deleteMany({ where: { id, userId: user.id } });
  if (!res.count) throw new NotFoundException('This status has already gone.');
  return { ok: true };
}
