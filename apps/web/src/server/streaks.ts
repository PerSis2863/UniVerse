import prisma from '@/lib/db';
import { dayBefore, dayIn, lastWeek } from '@/lib/study-days';
import { later } from './email';
import { requestCf } from './request-cf';

// Study streaks: a day counts when a student does real learning (submits a quiz, reviews
// flashcards, asks the course tutor). Kept apart from impact points on purpose: those turn into
// verified volunteering hours on credentials, and studying mustn't inflate them.
//
// Days are the student's own calendar days (Cloudflare's guess of their time zone, from the
// request), so a late-night session doesn't count for tomorrow. Until October 2026 the Next.js
// routes never saw that guess (src/server/request-cf.ts), so days before then were UTC days.

/**
 * Counts a learning action for today. The first one of the day extends (or restarts) the streak.
 * Runs after the response (never slows down or fails the action itself).
 */
export function recordStudy(userId: string, req: Request) {
  const today = dayIn(requestCf(req)?.timezone);
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
  const today = dayIn(requestCf(req)?.timezone);
  const days = lastWeek(today);
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
