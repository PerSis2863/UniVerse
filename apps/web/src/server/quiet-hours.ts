import prisma from '@/lib/db';
import { within, wallClock } from '@/lib/local-time';

// Quiet hours (Stage 4 · 4.10; settings and the school's rule in src/server/safety.ts): nobody gets a
// push notification during theirs (messages and calls still arrive in the app). Kept apart from
// safety.ts so the push service can use it without importing the rest.

/** Of these people, the ones in their quiet hours right now (one query). */
export async function quietNow(userIds: string[], now = new Date()): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await prisma.quietHours.findMany({ where: { userId: { in: userIds.slice(0, 90) }, on: true }, select: { userId: true, start: true, end: true, timeZone: true } });
  return new Set(rows.filter((r) => { const w = wallClock(now, r.timeZone); return within(r.start, r.end, w.hour * 60 + w.min); }).map((r) => r.userId));
}
