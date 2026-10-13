import { afterEach, describe, expect, it, vi } from 'vitest';
import { callsDue } from '../../cloudflare/due-check';

// The 15-minute cron's check (cloudflare/due-check.ts): a moment's D1 failure must not skip reminders.
const db = (answers: (unknown | Error)[]) => {
  let n = 0;
  const first = vi.fn(async () => { const a = answers[Math.min(n++, answers.length - 1)]; if (a instanceof Error) throw a; return a; });
  return { db: { prepare: () => ({ bind: () => ({ first }) }) }, first };
};
const noWait = async () => {};

describe('scheduled-call check', () => {
  afterEach(() => vi.restoreAllMocks());

  it('answers from one query when D1 is fine', async () => {
    const yes = db([{ 1: 1 }]), no = db([null]);
    expect(await callsDue({ DB: yes.db }, noWait)).toBe(true);
    expect(await callsDue({ DB: no.db }, noWait)).toBe(false);
    expect(yes.first).toHaveBeenCalledTimes(1);
    expect(await callsDue({}, noWait)).toBe(false);
  });

  it('tries again after a passing D1 failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = db([new Error('D1_ERROR: Network connection lost.'), null]);
    expect(await callsDue({ DB: d.db }, noWait)).toBe(false);
    expect(d.first).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain('Network connection lost');
  });

  it('runs the reminders anyway after three failures, logging the reason on one line', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = db([new Error('D1_ERROR: D1 DB is overloaded.')]);
    expect(await callsDue({ DB: d.db }, noWait)).toBe(true);
    expect(d.first).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledWith('scheduled-call check failed 3 times, running the reminders anyway: D1_ERROR: D1 DB is overloaded.');
  });
});
