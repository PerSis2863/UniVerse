import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { addTripExpense, addTripPacking, addTripTodos, removeTripExpense, updateTripTodo } from './travel-trip-extras';
import type { SessionUser } from '@/lib/server-auth';

// M215: a trip's shared costs and packing list are for its members only, and stay within D1's limits.
vi.mock('@/lib/db', () => ({
  default: {
    travelTripMember: { findUnique: vi.fn(), findMany: vi.fn() },
    travelTripExpense: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 'x1' }), deleteMany: vi.fn() },
    travelTripPack: { findMany: vi.fn(), createMany: vi.fn() },
    travelTripTodo: { findMany: vi.fn().mockResolvedValue([{ text: 'Get euros' }]), createMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  },
}));
vi.mock('./realtime', () => ({ publish: vi.fn() }));

const me = { id: 'ana' } as SessionUser;
const trip = { id: 't1', currency: 'EUR' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue({ trip } as never);
  vi.mocked(prisma.travelTripMember.findMany).mockResolvedValue([{ userId: 'ana' }, { userId: 'ben' }] as never);
});

describe('shared costs', () => {
  it('records a cost between members, in the trip’s currency unless another is asked', async () => {
    await addTripExpense(me, 't1', { what: 'Dinner', amount: 4250, paidBy: 'ben', split: ['ana', 'ben', 'stranger'], category: 'food' });
    expect(vi.mocked(prisma.travelTripExpense.create).mock.calls[0][0].data).toMatchObject({ tripId: 't1', paidBy: 'ben', amount: 4250, currency: 'EUR', split: '["ana","ben"]', createdBy: 'ana' });
  });
  it('refuses a payer or people outside the trip, odd amounts and a payment back to yourself', async () => {
    await expect(addTripExpense(me, 't1', { what: 'x', amount: 100, paidBy: 'stranger', split: ['ana'] })).rejects.toThrow(/who paid/);
    await expect(addTripExpense(me, 't1', { what: 'x', amount: 100, paidBy: 'ana', split: ['stranger'] })).rejects.toThrow(/who it was for/);
    await expect(addTripExpense(me, 't1', { what: 'x', amount: 12.5, paidBy: 'ana', split: ['ana'] })).rejects.toThrow(/how much/);
    await expect(addTripExpense(me, 't1', { amount: 100, paidBy: 'ana', split: ['ana'], category: 'settle' })).rejects.toThrow(/one person to another/);
    expect(prisma.travelTripExpense.create).not.toHaveBeenCalled();
  });
  it('is only for the trip’s members', async () => {
    vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue(null);
    await expect(removeTripExpense(me, 't1', 'x1')).rejects.toThrow(/isn’t one of yours/);
    expect(prisma.travelTripExpense.deleteMany).not.toHaveBeenCalled();
  });
});

describe('packing list', () => {
  it('adds each thing once, in batches D1 takes', async () => {
    vi.mocked(prisma.travelTripPack.findMany).mockResolvedValue([{ item: 'Sunscreen' }] as never);
    const items = [{ item: 'sunscreen', grp: 'Health' }, ...Array.from({ length: 23 }, (_, i) => ({ item: `Thing ${i}`, grp: 'Nope' })), { item: 'Thing 0' }];
    expect(await addTripPacking(me, 't1', { items })).toEqual({ added: 23 });
    const calls = vi.mocked(prisma.travelTripPack.createMany).mock.calls;
    expect(calls.map((c) => (c[0].data as unknown[]).length)).toEqual([10, 10, 3]);
    expect((calls[0][0].data as { grp: string }[])[0].grp).toBe('Other');
  });
});

describe('before-you-go checklist (M254)', () => {
  it('adds each thing once, for someone on the trip, by a real date', async () => {
    const r = await addTripTodos(me, 't1', { items: [{ text: 'Book the train', assignee: 'ben', due: '2027-03-20' }, { text: 'get EUROS' }, { text: 'Visa', assignee: 'stranger', due: 'soon' }] });
    expect(r.added).toBe(2);
    expect(vi.mocked(prisma.travelTripTodo.createMany).mock.calls[0][0].data).toEqual([
      { tripId: 't1', text: 'Book the train', assignee: 'ben', due: '2027-03-20', createdBy: 'ana' },
      { tripId: 't1', text: 'Visa', assignee: null, due: null, createdBy: 'ana' },
    ]);
  });
  it('ticks with who did it, and refuses someone off the trip', async () => {
    await updateTripTodo(me, 't1', 'x1', { done: true });
    expect(prisma.travelTripTodo.updateMany).toHaveBeenCalledWith({ where: { id: 'x1', tripId: 't1' }, data: { done: true, doneBy: 'ana' } });
    await expect(updateTripTodo(me, 't1', 'x1', { assignee: 'stranger' })).rejects.toThrow(/someone on the trip/);
  });
});
