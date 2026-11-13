import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { arrangeGet, arrangeOff, arrangePut } from './arrange';
import type { SessionUser } from '@/lib/server-auth';

vi.mock('@/lib/db', () => ({ default: { userArrangement: { findUnique: vi.fn(), upsert: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) } } }));
vi.mock('./realtime', () => ({ publish: vi.fn() }));

const me = { id: 'me' } as SessionUser;
beforeEach(() => vi.clearAllMocks());

describe('arrangements in the account', () => {
  it('is off until a copy is sent', async () => {
    vi.mocked(prisma.userArrangement.findUnique).mockResolvedValue(null);
    expect(await arrangeGet(me)).toEqual({ sync: false, doc: null });
  });
  it('joins a device into the account’s copy, for that person alone, dropping anything odd', async () => {
    vi.mocked(prisma.userArrangement.findUnique).mockResolvedValue({ userId: 'me', data: JSON.stringify({ store: { '/a': [{ order: ['x', 'y'] }] }, at: { '/a': 50 } }) } as never);
    const r = await arrangePut(me, { doc: { store: { '/a': [{ order: ['y', 'x'] }], '/b': [{ order: ['p', { evil: 1 }, 'q'], sizes: { p: { pct: 9000 } } }], 'javascript:': [{ order: ['z'] }] }, at: { '/a': 10, '/b': 60 } } });
    expect(r.doc.store).toEqual({ '/a': [{ order: ['x', 'y'] }], '/b': [{ order: ['p', 'q'], sizes: { p: { pct: 100 } } }] });
    const call = vi.mocked(prisma.userArrangement.upsert).mock.calls[0][0];
    expect(call.where).toEqual({ userId: 'me' });
    expect(JSON.parse(call.update.data as string)).toEqual(r.doc);
  });
  it('refuses a copy that is too big, and writes nothing when nothing changed', async () => {
    vi.mocked(prisma.userArrangement.findUnique).mockResolvedValue(null);
    const big = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`/p${i}`, Array.from({ length: 30 }, (_, j) => ({ order: Array.from({ length: 60 }, (_, k) => `card number ${i}-${j}-${k} with a long name to fill the space`) }))]));
    await expect(arrangePut(me, { doc: { store: big, at: {} } })).rejects.toThrow('more arranged pages');
    expect(prisma.userArrangement.upsert).not.toHaveBeenCalled();
    const same = { store: { '/a': [{ order: ['x'] }] }, at: { '/a': 5 } };
    vi.mocked(prisma.userArrangement.findUnique).mockResolvedValue({ userId: 'me', data: JSON.stringify(same) } as never);
    await arrangePut(me, { doc: same });
    expect(prisma.userArrangement.upsert).not.toHaveBeenCalled();
  });
  it('turns off by removing only that person’s copy', async () => {
    expect(await arrangeOff(me)).toEqual({ sync: false, doc: null });
    expect(prisma.userArrangement.deleteMany).toHaveBeenCalledWith({ where: { userId: 'me' } });
  });
});
