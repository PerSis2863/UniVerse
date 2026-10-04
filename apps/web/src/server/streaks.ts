import prisma from '@/lib/db';
import { later } from './email';

// Study streaks: a day counts when a student does real learning (submits a quiz, reviews
// flashcards, asks the course tutor). Kept apart from impact points on purpose: those turn into
// verified volunteering hours on credentials, and studying mustn't inflate them.
//
// Days are the student's own calendar days (Cloudflare's guess of their time zone, from the
// request), so a late-night session doesn't count for tomorrow.

/** YYYY-MM-DD in a time zone (falls back to UTC for unknown zones). */
export function dayIn(timeZone: string | undefined, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** The calendar day before a YYYY-MM-DD day. */
export function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const timeZoneOf = (req: Request) => (req as Request & { cf?: { timezone?: string } }).cf?.timezone;

/**
 * Counts a learning action for today. The first one of the day extends (or restarts) the streak.
 * Runs after the response (never slows down or fails the action itself).
 */
export function recordStudy(userId: string, req: Request) {
  const today = dayIn(timeZoneOf(req));
  later(async () => {
    const rows = await prisma.$queryRawUnsafe<{ actions: number }[]>(
      'INSERT INTO study_days (userId, day, actions) VALUES (?, ?, 1) ON CONFLICT(userId, day) DO UPDATE SET actions = actions + 1 RETURNING actions',
      userId, today,
    );
    if (Number(rows[0]?.actions) !== 1) return; // already counted today
    // Yesterday was a study day → one more; otherwise a new streak of 1.
    await prisma.$executeRawUnsafe(
      `UPDATE users SET
         streakCurrent = CASE WHEN streakLastDay = ? THEN streakCurrent + 1 WHEN streakLastDay = ? THEN streakCurrent ELSE 1 END,
         streakBest = MAX(streakBest, CASE WHEN streakLastDay = ? THEN streakCurrent + 1 WHEN streakLastDay = ? THEN streakCurrent ELSE 1 END),
         streakLastDay = ?
       WHERE id = ?`,
      dayBefore(today), today, dayBefore(today), today, today, userId,
    );
  });
}

export interface StreakSummary {
  current: number;
  best: number;
  /** Whether today already counts (if not, the streak ends at midnight unless they study). */
  today: boolean;
  /** The last 7 days, oldest first: did they study that day? */
  week: { day: string; studied: boolean }[];
}

/** The streak as the student sees it: a streak whose last day is before yesterday is over. */
export async function streakSummary(userId: string, req: Request, user?: { streakCurrent: number; streakBest: number; streakLastDay: string | null } | null): Promise<StreakSummary> {
  const today = dayIn(timeZoneOf(req));
  const days: string[] = [today];
  for (let i = 0; i < 6; i++) days.unshift(dayBefore(days[0]));
  const [me, recent] = await Promise.all([
    user ?? prisma.user.findUnique({ where: { id: userId }, select: { streakCurrent: true, streakBest: true, streakLastDay: true } }),
    prisma.studyDay.findMany({ where: { userId, day: { gte: days[0] } }, select: { day: true } }),
  ]);
  const studied = new Set(recent.map((r) => r.day));
  const alive = me?.streakLastDay === today || me?.streakLastDay === dayBefore(today);
  return {
    current: alive ? me?.streakCurrent ?? 0 : 0,
    best: me?.streakBest ?? 0,
    today: studied.has(today),
    week: days.map((day) => ({ day, studied: studied.has(day) })),
  };
}
