import prisma from '@/lib/db';
import { isOwnBlobUrl } from '@/lib/chat';
import { planLimits } from '@/lib/plan-limits';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, NotFoundException } from './http';
import { publish } from './realtime';

// Status updates ("stories"), like WhatsApp's: a photo or a coloured text card, gone after 24
// hours. You see the statuses of people you share a chat with; on your own you see who viewed them.

const DAY = 86_400_000;
const MAX_ACTIVE = 30;
export const STATUS_BACKGROUNDS = ['#4f46e5', '#7c3aed', '#db2777', '#e11d48', '#ea580c', '#059669', '#0891b2', '#18181b'];
const dbNow = () => new Date().toISOString().replace('Z', '+00:00');

// Everyone who shares at least one chat with this user.
const CONTACTS = `SELECT p2."userId" FROM "conversation_participants" p1 JOIN "conversation_participants" p2 ON p2."conversationId" = p1."conversationId" WHERE p1."userId" = ?`;

type Row = { id: string; userId: string; kind: string; body: string; mediaUrl: string | null; background: string | null; createdAt: string; expiresAt: string; name: string; avatar: string | null; viewed: number | null };

export async function listStatuses(user: SessionUser) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT s."id", s."userId", s."kind", s."body", s."mediaUrl", s."background", s."createdAt", s."expiresAt", u."name", u."avatar",
       (SELECT 1 FROM "chat_status_views" v WHERE v."statusId" = s."id" AND v."userId" = ?) AS "viewed"
     FROM "chat_statuses" s JOIN "users" u ON u."id" = s."userId"
     WHERE s."expiresAt" > ? AND (s."userId" = ? OR s."userId" IN (${CONTACTS}))
     ORDER BY s."createdAt" ASC LIMIT 400`,
    user.id, dbNow(), user.id, user.id,
  );
  const mineIds = rows.filter((r) => r.userId === user.id).map((r) => r.id);
  const views = mineIds.length
    ? await prisma.chatStatusView.findMany({ where: { statusId: { in: mineIds } }, orderBy: { viewedAt: 'desc' }, select: { statusId: true, viewedAt: true, user: { select: { id: true, name: true, avatar: true } } } })
    : [];
  const people = new Map<string, { user: { id: string; name: string; avatar: string | null }; mine: boolean; items: unknown[]; unseen: number; latest: string }>();
  for (const r of rows) {
    const p = people.get(r.userId) ?? { user: { id: r.userId, name: r.name, avatar: r.avatar }, mine: r.userId === user.id, items: [], unseen: 0, latest: r.createdAt };
    const seen = r.userId === user.id || !!r.viewed;
    if (!seen) p.unseen++;
    p.latest = r.createdAt;
    p.items.push({
      id: r.id, kind: r.kind, body: r.body, mediaUrl: r.mediaUrl, background: r.background, createdAt: new Date(r.createdAt).toISOString(), seen,
      ...(r.userId === user.id ? { viewers: views.filter((v) => v.statusId === r.id).map((v) => ({ ...v.user, viewedAt: v.viewedAt })) } : {}),
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
  const created = await prisma.chatStatus.create({ data: { userId: user.id, kind, body: text, mediaUrl, background: kind === 'TEXT' ? background : null, expiresAt: new Date(Date.now() + DAY) }, select: { id: true } });
  // Contacts who are online see it appear (capped: each live push is a subrequest).
  const contacts = await prisma.$queryRawUnsafe<{ userId: string }[]>(`SELECT DISTINCT "userId" FROM (${CONTACTS}) WHERE "userId" <> ? LIMIT ${planLimits().livePushes}`, user.id, user.id);
  publish(contacts.map((c) => c.userId), { type: 'refresh', keys: ['/api/chat/status'] });
  return created;
}

async function visible(user: SessionUser, id: string) {
  const rows = await prisma.$queryRawUnsafe<{ userId: string }[]>(
    `SELECT s."userId" FROM "chat_statuses" s WHERE s."id" = ? AND s."expiresAt" > ? AND (s."userId" = ? OR s."userId" IN (${CONTACTS}))`, id, dbNow(), user.id, user.id,
  );
  if (!rows.length) throw new NotFoundException('This status has expired.');
  return rows[0].userId;
}

export async function viewStatus(user: SessionUser, id: string) {
  const owner = await visible(user, id);
  if (owner !== user.id) await prisma.chatStatusView.upsert({ where: { statusId_userId: { statusId: id, userId: user.id } }, create: { statusId: id, userId: user.id }, update: {} });
  return { ok: true };
}

export async function deleteStatus(user: SessionUser, id: string) {
  const res = await prisma.chatStatus.deleteMany({ where: { id, userId: user.id } });
  if (!res.count) throw new NotFoundException('This status has already gone.');
  return { ok: true };
}
