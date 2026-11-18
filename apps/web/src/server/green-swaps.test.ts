import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { addSwap, reportSwap } from './green-swaps';
import type { SessionUser } from '@/lib/server-auth';

// M320: posts need a neighbourhood; a report counts once per person, never on your own post.
vi.mock('@/lib/db', () => ({
  default: {
    greenHome: { findUnique: vi.fn() },
    greenSwap: { count: vi.fn().mockResolvedValue(0), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    greenSwapReport: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
const ana = { id: 'ana' } as SessionUser;
beforeEach(() => vi.clearAllMocks());

describe('the swap and repair board', () => {
  it('needs a neighbourhood and keeps the post in it', async () => {
    vi.mocked(prisma.greenHome.findUnique).mockResolvedValue(null);
    await expect(addSwap(ana, { kind: 'GIVE', title: 'A lamp' })).rejects.toThrow(/neighbourhood/);
    vi.mocked(prisma.greenHome.findUnique).mockResolvedValue({ areaLat: 12.9, areaLng: 77.5 } as never);
    await addSwap(ana, { kind: 'GIVE', title: 'A lamp', category: 'nonsense' });
    expect(vi.mocked(prisma.greenSwap.create).mock.calls[0][0].data).toMatchObject({ areaLat: 12.9, areaLng: 77.5, category: 'other', userId: 'ana' });
  });
  it('counts a report once and never on your own post', async () => {
    vi.mocked(prisma.greenSwap.findUnique).mockResolvedValue({ userId: 'ana' } as never);
    await expect(reportSwap(ana, 's1')).rejects.toThrow(/your own/);
    vi.mocked(prisma.greenSwap.findUnique).mockResolvedValue({ userId: 'ben' } as never);
    vi.mocked(prisma.greenSwapReport.create).mockRejectedValueOnce(new Error('unique'));
    await reportSwap(ana, 's1');
    expect(prisma.greenSwap.update).not.toHaveBeenCalled();
  });
});
