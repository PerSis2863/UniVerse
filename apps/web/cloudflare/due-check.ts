import { dbDate } from './fast-db';

// The 15-minute cron's cheap check (cloudflare/worker.ts `scheduled`): the Next.js app only starts
// when something is due.

/** The part of D1 used here (a plain shape, so the unit test can pass a stand-in). */
interface Db<S> { prepare(sql: string): { bind(...values: unknown[]): S }; batch(statements: S[]): Promise<{ results?: unknown[] }[]> }

/**
 * One small query per kind of reminder, sent together in one batch. (They used to be one query
 * joined with UNION ALL, but D1 allows at most 5 parts in a compound SELECT, so on the live site that
 * query always failed with "too many terms in compound SELECT", while local SQLite allows 500.)
 */
export function dueChecks(now: number): [string, unknown[]][] {
  const soon = [dbDate(now - 5 * 60_000), dbDate(now + 16 * 60_000)];
  return [
    // A scheduled call starting soon, or a booked parent meeting.
    ['SELECT 1 FROM scheduled_calls WHERE "remindedAt" IS NULL AND "startAt" > ? AND "startAt" <= ? LIMIT 1', soon],
    ['SELECT 1 FROM parent_meetings WHERE "guardianId" IS NOT NULL AND "remindedAt" IS NULL AND "startAt" > ? AND "startAt" <= ? LIMIT 1', soon],
    // A "/remind" reminder that's due, and a study plan's 7-day follow-up.
    ['SELECT 1 FROM chat_reminders WHERE "sentAt" IS NULL AND "doneAt" IS NULL AND "dueAt" <= ? LIMIT 1', [dbDate(now + 5 * 60_000)]],
    ['SELECT 1 FROM support_plans WHERE "status" = \'ACTIVE\' AND "followUpNotifiedAt" IS NULL AND "followUpAt" <= ? LIMIT 1', [dbDate(now + 5 * 60_000)]],
    // A chat message scheduled for now, and someone's morning brief (Stage 4 · 4.9).
    ['SELECT 1 FROM scheduled_messages WHERE "sendAt" <= ? LIMIT 1', [dbDate(now + 2 * 60_000)]],
    ['SELECT 1 FROM daily_briefs WHERE "push" = 1 AND "nextAt" <= ? LIMIT 1', [dbDate(now + 2 * 60_000)]],
    // Someone's daily notification summary (Stage 5 · Q9).
    ['SELECT 1 FROM users WHERE "digestAt" <= ? LIMIT 1', [dbDate(now + 2 * 60_000)]],
    // Someone's evening flashcard reminder (Stage 5 · Q13).
    ['SELECT 1 FROM users WHERE "cardsRemindAt" <= ? LIMIT 1', [dbDate(now + 2 * 60_000)]],
    // A card due within a day on a board with a due-soon automation (Stage 5 · B9.10).
    ['SELECT 1 FROM task_automations a JOIN tasks t ON t."boardId" = a."boardId" WHERE a."trigger" = \'due-soon\' AND a."enabled" = 1 AND t."doneAt" IS NULL AND t."dueRemindedAt" IS NULL AND t."dueAt" > ? AND t."dueAt" <= ? LIMIT 1', [dbDate(now), dbDate(now + 86_400_000)]],
    // A parent's weekly summary (Stage 5 · D16).
    ['SELECT 1 FROM parent_copilot WHERE "weekly" = 1 AND "nextAt" <= ? LIMIT 1', [dbDate(now + 2 * 60_000)]],
    // A course announcement scheduled for now (Stage 5 · B2).
    ['SELECT 1 FROM announcements WHERE "sentAt" IS NULL AND "publishAt" IS NOT NULL AND "publishAt" <= ? LIMIT 1', [dbDate(now + 2 * 60_000)]],
    // An application's next step within the hour (Stage 5 · Q15).
    ['SELECT 1 FROM job_applications WHERE "remindedAt" IS NULL AND "nextAt" > ? AND "nextAt" <= ? LIMIT 1', [dbDate(now - 86_400_000), dbDate(now + 60 * 60_000)]],
  ];
}

async function anythingDue<S>(db: Db<S>, now: number): Promise<boolean> {
  const results = await db.batch(dueChecks(now).map(([sql, values]) => db.prepare(sql).bind(...values)));
  return results.some((r) => (r.results?.length ?? 0) > 0);
}

/** Is a scheduled call or a booked parent meeting starting within about 15 minutes, a chat reminder due, a study plan's
 *  7-day follow-up due, a chat message scheduled for now, someone's morning brief, a card due soon, or a parent's
 *  weekly summary or a scheduled course announcement, not yet sent? */
export async function callsDue<S>(env: { DB?: Db<S> }, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<boolean> {
  if (!env.DB) return false;
  // D1 now and then fails a query for a moment (lost connection, busy or restarting database). The
  // next check, 15 minutes later, no longer covers a call starting before then, so a failed check
  // is tried twice more and, if it still fails, the reminders job runs anyway (it checks for itself).
  for (let attempt = 1; ; attempt++) {
    try {
      return await anythingDue(env.DB, Date.now());
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      if (attempt < 3) {
        console.warn(`scheduled-call check, attempt ${attempt}: ${why}`);
        await wait(attempt * 1000);
        continue;
      }
      console.error(`scheduled-call check failed 3 times, running the reminders anyway: ${why}`);
      return true;
    }
  }
}
