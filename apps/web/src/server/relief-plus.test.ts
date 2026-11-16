import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { reliefHours, saveReliefPlan } from './relief-plus';
import type { SessionUser } from '@/lib/server-auth';

// M217: a plan is the person's own and kept clean; volunteer hours add up from shifts that are over.
vi.mock('@/lib/db', () => ({
  default: {
    reliefPlan: { upsert: vi.fn(), findUnique: vi.fn() },
    reliefShiftSignup: { findMany: vi.fn() },
    reliefShift: { findMany: vi.fn() },
    reliefOrg: { findMany: vi.fn() },
  },
}));
vi.mock('./travel', () => ({ cached: vi.fn() }));
const me = { id: 'me' } as SessionUser;
beforeEach(() => vi.clearAllMocks());

describe('my plan', () => {
  it('is saved under my account only, cleaned, the kit to known items', async () => {
    vi.mocked(prisma.reliefPlan.findUnique).mockResolvedValue(null);
    await saveReliefPlan(me, { plan: { people: 2, meetNear: '  The park gate ', contacts: [{ name: 'Rosa', phone: '+351 <x>21' }] }, kit: ['water', 'bogus'], userId: 'someone-else' });
    const call = vi.mocked(prisma.reliefPlan.upsert).mock.calls[0][0];
    expect(call.where).toEqual({ userId: 'me' });
    expect(JSON.parse(call.create.plan as string)).toMatchObject({ people: 2, meetNear: 'The park gate', contacts: [{ name: 'Rosa', phone: '+351 21' }] });
    expect(JSON.parse(call.create.kit as string)).toEqual(['water']);
  });
});

describe('volunteer hours', () => {
  it('adds the hours of shifts that are over, with each organisation’s name', async () => {
    vi.mocked(prisma.reliefShiftSignup.findMany).mockResolvedValue([{ shiftId: 's1' }, { shiftId: 's2' }] as never);
    vi.mocked(prisma.reliefShift.findMany).mockResolvedValue([
      { id: 's1', orgId: 'o1', title: 'Sorting', startsAt: new Date('2026-11-10T09:00:00Z'), endsAt: new Date('2026-11-10T12:30:00Z') },
      { id: 's2', orgId: 'o2', title: 'Night', startsAt: new Date('2026-11-01T18:00:00Z'), endsAt: new Date('2026-11-01T22:00:00Z') },
    ] as never);
    vi.mocked(prisma.reliefOrg.findMany).mockResolvedValue([{ id: 'o1', name: 'Food Bank' }] as never);
    const h = await reliefHours(me);
    expect(h.total).toBe(7.5);
    expect(h.shifts.map((s) => [s.org, s.hours])).toEqual([['Food Bank', 3.5], ['An organisation', 4]]);
    expect(vi.mocked(prisma.reliefShift.findMany).mock.calls[0][0]!.where).toMatchObject({ endsAt: { lt: expect.any(Date) } });
  });
});
