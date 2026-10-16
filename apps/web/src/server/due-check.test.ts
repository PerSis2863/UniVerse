import { afterEach, describe, expect, it, vi } from 'vitest';
import { callsDue, dueChecks } from '../../cloudflare/due-check';

// The 15-minute cron's check (cloudflare/due-check.ts): small queries D1 accepts, and a moment's D1
// failure must not skip reminders.
type Stmt = { sql: string; values: unknown[] };
const db = (answers: (boolean | Error)[]) => {
  let n = 0;
  const batch = vi.fn(async (stmts: Stmt[]) => {
    const a = answers[Math.min(n++, answers.length - 1)];
    if (a instanceof Error) throw a;
    return stmts.map((_, i) => ({ results: a && i === stmts.length - 1 ? [{ 1: 1 }] : [] }));
  });
  return { db: { prepare: (sql: string) => ({ bind: (...values: unknown[]): Stmt => ({ sql, values }) }), batch }, batch };
};
const noWait = async () => {};

describe('scheduled-call check', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks D1 only what it accepts: no compound SELECT, one value per placeholder', () => {
    const checks = dueChecks(Date.parse('2026-10-14T08:00:00Z'));
    expect(checks).toHaveLength(10);
    for (const [sql, values] of checks) {
      expect(sql).not.toMatch(/UNION/i);
      expect(sql).toMatch(/LIMIT 1$/);
      expect(sql.split('?').length - 1).toBe(values.length);
    }
  });

  it('answers from one batch when D1 is fine', async () => {
    const yes = db([true]), no = db([false]);
    expect(await callsDue({ DB: yes.db }, noWait)).toBe(true);
    expect(await callsDue({ DB: no.db }, noWait)).toBe(false);
    expect(yes.batch).toHaveBeenCalledTimes(1);
    expect(yes.batch.mock.calls[0][0]).toHaveLength(10);
    expect(await callsDue({}, noWait)).toBe(false);
  });

  it('tries again after a passing D1 failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = db([new Error('D1_ERROR: Network connection lost.'), false]);
    expect(await callsDue({ DB: d.db }, noWait)).toBe(false);
    expect(d.batch).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain('Network connection lost');
  });

  it('runs the reminders anyway after three failures, logging the reason on one line', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = db([new Error('D1_ERROR: D1 DB is overloaded.')]);
    expect(await callsDue({ DB: d.db }, noWait)).toBe(true);
    expect(d.batch).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledWith('scheduled-call check failed 3 times, running the reminders anyway: D1_ERROR: D1 DB is overloaded.');
  });
});
