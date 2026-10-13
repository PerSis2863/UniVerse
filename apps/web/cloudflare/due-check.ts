import { dbDate } from './fast-db';

// The 15-minute cron's cheap check (cloudflare/worker.ts `scheduled`): the Next.js app only starts
// when something is due.

/** The part of D1 used here (a plain shape, so the unit test can pass a stand-in). */
interface Db { prepare(sql: string): { bind(...values: unknown[]): { first(): Promise<unknown> } } }

/** Is a scheduled call or a booked parent meeting starting within about 15 minutes, a chat reminder due, a study plan's
 *  7-day follow-up due, a chat message scheduled for now, someone's morning brief (Stage 4 · 4.9), or a card due
 *  within a day on a board with a due-soon automation (Stage 5 · B9.10), not yet sent? */
export async function callsDue(env: { DB?: Db }, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<boolean> {
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

async function anythingDue(db: Db, now: number): Promise<boolean> {
  // A scheduled call starting soon, or a "/remind" reminder that's due.
  const row = await db.prepare(
    `SELECT 1 FROM scheduled_calls WHERE "remindedAt" IS NULL AND "startAt" > ?1 AND "startAt" <= ?2
     UNION ALL SELECT 1 FROM parent_meetings WHERE "guardianId" IS NOT NULL AND "remindedAt" IS NULL AND "startAt" > ?1 AND "startAt" <= ?2
     UNION ALL SELECT 1 FROM chat_reminders WHERE "sentAt" IS NULL AND "doneAt" IS NULL AND "dueAt" <= ?3
     UNION ALL SELECT 1 FROM support_plans WHERE "status" = 'ACTIVE' AND "followUpNotifiedAt" IS NULL AND "followUpAt" <= ?3
     UNION ALL SELECT 1 FROM scheduled_messages WHERE "sendAt" <= ?4
     UNION ALL SELECT 1 FROM daily_briefs WHERE "push" = 1 AND "nextAt" <= ?4
     UNION ALL SELECT 1 FROM task_automations a JOIN tasks t ON t."boardId" = a."boardId"
       WHERE a."trigger" = 'due-soon' AND a."enabled" = 1 AND t."doneAt" IS NULL AND t."dueRemindedAt" IS NULL AND t."dueAt" > ?5 AND t."dueAt" <= ?6 LIMIT 1`,
  )
    .bind(dbDate(now - 5 * 60_000), dbDate(now + 16 * 60_000), dbDate(now + 5 * 60_000), dbDate(now + 2 * 60_000), dbDate(now), dbDate(now + 86_400_000))
    .first();
  return !!row;
}
