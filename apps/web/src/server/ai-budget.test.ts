import { beforeEach, describe, expect, it, vi } from 'vitest';

// Paid Cloudflare AI has its own daily limits (M442): per person and for the site; past either, Gemini answers.
const rows: { userId: string; calls: number }[] = [];
vi.mock('@/lib/db', () => ({
  default: {
    serverControl: { findUnique: vi.fn().mockResolvedValue({ aiLimits: JSON.stringify({ cloud: 2, cloudSite: 3 }) }) },
    $queryRawUnsafe: vi.fn(async (_sql: string, _day: string, ...ids: string[]) => rows.filter((r) => ids.includes(r.userId))),
    $executeRawUnsafe: vi.fn(async (_sql: string, ...args: string[]) => {
      for (let i = 1; i < args.length; i += 2) { const r = rows.find((x) => x.userId === args[i]); if (r) r.calls++; else rows.push({ userId: args[i], calls: 1 }); }
    }),
  },
}));
vi.unmock('@/server/ai-budget'); // the shared test setup stands in for it elsewhere
vi.mock('./moderation', () => ({ featureOff: vi.fn().mockResolvedValue(false) }));

describe('paid AI limits (M442)', () => {
  beforeEach(async () => { rows.length = 0; (await import('@/server/ai-budget')).forgetAiLimits(); });
  it('reads the limits with defaults', async () => {
    const { parseLimits, DEFAULT_AI_LIMITS } = await import('@/server/ai-budget');
    expect(parseLimits(null)).toEqual(DEFAULT_AI_LIMITS);
    expect(parseLimits(JSON.stringify({ cloud: 5 })).cloud).toBe(5);
  });
  it('stops a person at their limit and the site at its own, never the owner personally', async () => {
    const { spendCloudAi } = await import('@/server/ai-budget');
    const ana = { id: 'a', role: 'STUDENT' };
    expect([await spendCloudAi(ana), await spendCloudAi(ana), await spendCloudAi(ana)]).toEqual([true, true, false]);
    expect(await spendCloudAi({ id: 'o', role: 'ADMIN', owner: true })).toBe(true); // the site's 3rd
    expect(await spendCloudAi({ id: 'b', role: 'STUDENT' })).toBe(false);          // the site is full
  });
});
