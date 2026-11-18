import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { fileClaim, moveClaim } from './trace-claims';
import type { SessionUser } from '@/lib/server-auth';

// M309: only a unit's owner with a running warranty claims; the brand moves a claim forward only, a refusal says why.
vi.mock('@/lib/db', () => ({
  default: {
    traceOwner: { findUnique: vi.fn() },
    traceWarranty: { findFirst: vi.fn() },
    traceClaim: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'c1' }), findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    traceBrandMember: { findMany: vi.fn().mockResolvedValue([]) },
    traceProduct: { findUnique: vi.fn().mockResolvedValue({ name: 'Trail runner' }) },
    traceRepair: { create: vi.fn() },
  },
}));
vi.mock('./email', () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock('./realtime', () => ({ publish: vi.fn() }));
vi.mock('./trace', () => ({ brandOf: vi.fn().mockResolvedValue({ id: 'b1', name: 'Acme' }) }));
const ana = { id: 'ana' } as SessionUser;
beforeEach(() => vi.clearAllMocks());

describe('warranty claims', () => {
  it('needs the owner and a running warranty', async () => {
    vi.mocked(prisma.traceOwner.findUnique).mockResolvedValue({ id: 'o1', userId: 'ben', codeId: 'k1', brandId: 'b1', productId: 'p1' } as never);
    await expect(fileClaim(ana, 'o1', { issue: 'It broke after a week of use.' })).rejects.toThrow(/Not in your vault/);
    vi.mocked(prisma.traceOwner.findUnique).mockResolvedValue({ id: 'o1', userId: 'ana', codeId: 'k1', brandId: 'b1', productId: 'p1' } as never);
    vi.mocked(prisma.traceWarranty.findFirst).mockResolvedValue({ endsAt: new Date(Date.now() - 1000) } as never);
    await expect(fileClaim(ana, 'o1', { issue: 'It broke after a week of use.' })).rejects.toThrow(/ended/);
    vi.mocked(prisma.traceWarranty.findFirst).mockResolvedValue({ endsAt: new Date(Date.now() + 86_400_000) } as never);
    await fileClaim(ana, 'o1', { issue: 'It broke after a week of use.', photoUrl: 'javascript:alert(1)' });
    expect(vi.mocked(prisma.traceClaim.create).mock.calls[0][0].data).toMatchObject({ userId: 'ana', photoUrl: null });
  });

  it('moves forward only, refusals with a reason, repairs into the history', async () => {
    vi.mocked(prisma.traceClaim.findUnique).mockResolvedValue({ id: 'c1', brandId: 'b1', status: 'OPEN', timeline: '[]', userId: 'ana', codeId: 'k1', productId: 'p1' } as never);
    await expect(moveClaim(ana, 'c1', { status: 'REPAIRED' })).rejects.toThrow(/doesn’t follow/);
    await expect(moveClaim(ana, 'c1', { status: 'REFUSED' })).rejects.toThrow(/Say why/);
    vi.mocked(prisma.traceClaim.findUnique).mockResolvedValue({ id: 'c1', brandId: 'b1', status: 'APPROVED', timeline: '[]', userId: 'ana', codeId: 'k1', productId: 'p1' } as never);
    await moveClaim(ana, 'c1', { status: 'REPAIRED', note: 'New zip' });
    expect(vi.mocked(prisma.traceRepair.create).mock.calls[0][0].data).toMatchObject({ codeId: 'k1', by: 'Acme', what: 'Warranty repair: New zip' });
  });
});
