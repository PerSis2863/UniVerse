import { describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { greenArea, setGreenArea } from './green-area';
import type { SessionUser } from '@/lib/server-auth';

// M318: a neighbourhood keeps only its 0.1° square, and shows totals only with three people in it.
vi.mock('@/lib/db', () => ({
  default: {
    greenHome: { findUnique: vi.fn(), count: vi.fn(), upsert: vi.fn() },
    greenAreaChallenge: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ n: 42 }]),
  },
}));
vi.mock('./email', () => ({ notifyMany: vi.fn() }));
const ana = { id: 'ana' } as SessionUser;

describe('neighbourhoods', () => {
  it('keeps the square, never the position', async () => {
    vi.mocked(prisma.greenHome.findUnique).mockResolvedValue(null);
    await setGreenArea(ana, { lat: 12.9716, lng: 77.5946 });
    expect(vi.mocked(prisma.greenHome.upsert).mock.calls[0][0].create).toMatchObject({ areaLat: 12.9, areaLng: 77.5 });
  });
  it('hides totals below three people', async () => {
    vi.mocked(prisma.greenHome.findUnique).mockResolvedValue({ areaLat: 12.9, areaLng: 77.5 } as never);
    vi.mocked(prisma.greenHome.count).mockResolvedValue(2);
    expect(await greenArea(ana)).toMatchObject({ enough: false, month: null });
    vi.mocked(prisma.greenHome.count).mockResolvedValue(5);
    expect(await greenArea(ana)).toMatchObject({ enough: true, month: { kg: 42, lastKg: 42 } });
  });
});
