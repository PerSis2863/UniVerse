import prisma from '@/lib/db';
import { PRESENCES, presenceOf, type Presence } from '@/lib/presence';
import { route } from '@/server/assignments';
import { publish } from '@/server/realtime';
import { planLimits } from '@/lib/plan-limits';

// GET: my availability and custom status. PATCH { presence, statusText, statusEmoji, minutes }:
// set them (minutes: until when; 0 or missing = until I change it). Busy, In class and Sleeping
// are Focus modes (no ringing, pushes wait) except for favourites.

const select = { presence: true, statusText: true, statusEmoji: true, statusUntil: true } as const;

export const GET = (req: Request) =>
  route(req, async (user) => {
    const u = await prisma.user.findUnique({ where: { id: user.id }, select });
    return { ...u, effective: presenceOf(u ?? {}) };
  });

export const PATCH = (req: Request) =>
  route(req, async (user) => {
    const b = await req.json().catch(() => ({}));
    const data: { presence?: string; statusText?: string | null; statusEmoji?: string | null; statusUntil?: Date | null } = {};
    if (b.presence !== undefined) data.presence = PRESENCES.includes(b.presence as Presence) ? b.presence : 'auto';
    if (b.statusText !== undefined) data.statusText = String(b.statusText ?? '').trim().slice(0, 80) || null;
    if (b.statusEmoji !== undefined) data.statusEmoji = String(b.statusEmoji ?? '').trim().slice(0, 8) || null;
    if (b.minutes !== undefined) {
      const m = Math.round(Number(b.minutes) || 0);
      data.statusUntil = m > 0 ? new Date(Date.now() + Math.min(m, 7 * 24 * 60) * 60_000) : null;
    }
    const u = await prisma.user.update({ where: { id: user.id }, data, select });
    // People chatting with me see it change (only those online; capped).
    const contacts = await prisma.$queryRawUnsafe<{ userId: string }[]>(
      `SELECT DISTINCT p2."userId" FROM "conversation_participants" p1 JOIN "conversation_participants" p2 ON p2."conversationId" = p1."conversationId"
       JOIN "users" u ON u."id" = p2."userId" WHERE p1."userId" = ? AND p2."userId" <> ? AND u."lastSeenAt" > ? LIMIT ${planLimits().livePushes}`,
      user.id, user.id, new Date(Date.now() - 15 * 60_000).toISOString().replace('Z', '+00:00'),
    );
    publish(contacts.map((c) => c.userId), { type: 'refresh', keys: ['/api/chat/conversations'] });
    return { ...u, effective: presenceOf(u) };
  });
