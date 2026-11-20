import prisma from '@/lib/db';
import { minutesOf, within, wallClock } from '@/lib/local-time';

// Quiet hours (Stage 4 · 4.10; settings and the school's rule in src/server/safety.ts): nobody gets a
// push notification during theirs (messages and calls still arrive in the app). Kept apart from
// safety.ts so the push service can use it without importing the rest.

/** Of these people, the ones in their quiet hours right now (one query). */
export async function quietNow(userIds: string[], now = new Date()): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await prisma.quietHours.findMany({ where: { userId: { in: userIds.slice(0, 90) }, on: true }, select: { userId: true, start: true, end: true, timeZone: true } });
  return new Set(rows.filter((r) => { const w = wallClock(now, r.timeZone); return within(r.start, r.end, w.hour * 60 + w.min); }).map((r) => r.userId));
}

/** M340: when one person's quiet hours end (to suggest sending then, Messages), or null if they aren't in them now. */
export async function quietEnds(userId: string, now = new Date()): Promise<string | null> {
  const r = await prisma.quietHours.findUnique({ where: { userId }, select: { on: true, start: true, end: true, timeZone: true } });
  return r?.on ? quietEndAt(r, now) : null;
}

/** The moment `end` next comes round in `timeZone`, if `now` is inside start–end there (to the minute). */
export function quietEndAt(r: { start: string; end: string; timeZone: string }, now = new Date()): string | null {
  const w = wallClock(now, r.timeZone), at = w.hour * 60 + w.min;
  if (!within(r.start, r.end, at)) return null;
  const wait = (minutesOf(r.end) - at + 1440) % 1440 || 1440;
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000 + wait * 60_000).toISOString();
}
