import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { checkGreenPledge, createGreenEvent, reportGreenEvent, saveFootprint } from './green-plus';
import type { SessionUser } from '@/lib/server-auth';

// M216: Green's footprint, pledges and events keep to their rules.
vi.mock('@/lib/db', () => ({
  default: {
    greenFootprint: { create: vi.fn().mockResolvedValue({ id: 'f1' }), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    greenPledge: { findFirst: vi.fn(), update: vi.fn() },
    greenEvent: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 'e1' }), findUnique: vi.fn(), update: vi.fn() },
    greenEventReport: { upsert: vi.fn(), count: vi.fn() },
  },
}));
const adultOnly = vi.fn();
vi.mock('./safety', () => ({ adultOnly: (...a: unknown[]) => adultOnly(...a) }));

const me = { id: 'me', name: 'Sam Lee' } as SessionUser;
const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
beforeEach(() => { vi.clearAllMocks(); adultOnly.mockResolvedValue(undefined); });

describe('footprint', () => {
  it('works the total out from the checked answers, never trusting a sum sent', async () => {
    const r = await saveFootprint(me, { answers: { carKmWeek: 0, car: 'none', transitKmWeek: 0, shortFlights: 0, longFlights: 0, diet: 'vegan', heat: 'none', size: 'flat', people: 1, kwhMonth: 0, stuff: 'little', total: 1 } });
    expect(r.footprint.total).toBe(1050 + 600);
    expect(vi.mocked(prisma.greenFootprint.create).mock.calls[0][0].data).toMatchObject({ userId: 'me', kg: 1650 });
  });
});

describe('pledges', () => {
  it('ticks and unticks this week’s days only, on my own pledge', async () => {
    vi.mocked(prisma.greenPledge.findFirst).mockResolvedValue({ id: 'p1', days: JSON.stringify([day(1)]) } as never);
    expect(await checkGreenPledge(me, 'p1', { day: day(0) })).toEqual({ days: [day(1), day(0)] });
    expect(await checkGreenPledge(me, 'p1', { day: day(1) })).toEqual({ days: [] });
    await expect(checkGreenPledge(me, 'p1', { day: day(9) })).rejects.toThrow(/this week/);
    vi.mocked(prisma.greenPledge.findFirst).mockResolvedValue(null);
    await expect(checkGreenPledge(me, 'p1', {})).rejects.toThrow(/isn’t yours/);
  });
});

describe('events', () => {
  const ask = { title: 'Beach clean-up', place: 'Praia do Tamariz', date: day(-7), time: '10:00', kind: 'cleanup', lat: 38.70412, lng: -9.39876 };
  it('an adult organises one: first name only, the meeting point to about 100 m, going themselves', async () => {
    await createGreenEvent(me, ask);
    expect(vi.mocked(prisma.greenEvent.create).mock.calls[0][0].data).toMatchObject({ name: 'Sam', title: 'Beach clean-up', lat: 38.704, lng: -9.399, time: '10:00', going: { create: { userId: 'me' } } });
  });
  it('not under-18s, nor dates past or a year away', async () => {
    adultOnly.mockRejectedValueOnce(new Error('Events are organised by adults'));
    await expect(createGreenEvent(me, ask)).rejects.toThrow(/adults/);
    await expect(createGreenEvent(me, { ...ask, date: day(2) })).rejects.toThrow(/coming year/);
    await expect(createGreenEvent(me, { ...ask, date: day(-400) })).rejects.toThrow(/coming year/);
  });
  it('three reports hide one; the organiser can’t report their own', async () => {
    vi.mocked(prisma.greenEvent.findUnique).mockResolvedValue({ id: 'e1', userId: 'org', hidden: false } as never);
    vi.mocked(prisma.greenEventReport.count).mockResolvedValue(3);
    await reportGreenEvent(me, 'e1', { reason: 'spam' });
    expect(prisma.greenEvent.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { hidden: true } });
    vi.mocked(prisma.greenEvent.findUnique).mockResolvedValue({ id: 'e1', userId: 'me', hidden: false } as never);
    await expect(reportGreenEvent(me, 'e1', {})).rejects.toThrow(/your own/);
  });
});
