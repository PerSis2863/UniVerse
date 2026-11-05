import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { askSupplier, publicDpp, saveDpp, supplierAnswer, supplierView, useSupplyAnswer } from './trace-dpp';
import type { SessionUser } from '@/lib/server-auth';

vi.mock('@/lib/db', () => ({
  default: {
    traceProduct: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    traceBrand: { findUnique: vi.fn().mockResolvedValue({ name: 'Aurora', slug: 'aurora', logoUrl: null }) },
    traceBrandMember: { findMany: vi.fn().mockResolvedValue([{ userId: 'owner' }]) },
    traceSupplyRequest: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 'r1' }), findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('./trace', () => ({ brandOf: vi.fn().mockResolvedValue({ id: 'b1' }), short: (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null) }));
vi.mock('./email', () => ({ notifyMany: vi.fn().mockResolvedValue(1) }));

const me = { id: 'me', name: 'Ana' } as SessionUser;
const product = { id: 'p1', brandId: 'b1', name: 'Olive oil', category: 'food', description: null, imageUrl: null, sample: false, gtin: '09520123456788', dpp: JSON.stringify({ madeIn: 'Spain' }), dppUpdatedAt: null };

beforeEach(() => vi.clearAllMocks());

describe('the product passport on the server', () => {
  it('refuses a GTIN with a wrong check digit, and another brand’s product', async () => {
    vi.mocked(prisma.traceProduct.findUnique).mockResolvedValue(product as never);
    await expect(saveDpp(me, 'p1', { gtin: '9520123456789', dpp: {} })).rejects.toThrow(/check digit/);
    vi.mocked(prisma.traceProduct.findUnique).mockResolvedValue({ ...product, brandId: 'other' } as never);
    await expect(saveDpp(me, 'p1', { gtin: '', dpp: {} })).rejects.toThrow(/not found/);
    expect(prisma.traceProduct.update).not.toHaveBeenCalled();
  });

  it('saves a cleaned passport and shows it to anyone by GTIN, but never a sample product', async () => {
    vi.mocked(prisma.traceProduct.findUnique).mockResolvedValue(product as never);
    const out = await saveDpp(me, 'p1', { gtin: '9520123456788', dpp: { madeIn: 'Spain', carbonKg: 'lots' } });
    expect(out.gtin).toBe('09520123456788');
    expect(out.dpp.carbonKg).toBeNull();
    const pub = await publicDpp('9520123456788');
    expect(pub.dpp?.madeIn).toBe('Spain');
    expect(JSON.stringify(pub)).not.toContain('brandId');
    vi.mocked(prisma.traceProduct.findUnique).mockResolvedValue({ ...product, sample: true } as never);
    await expect(publicDpp('9520123456788')).rejects.toThrow(/No product passport/);
  });

  it('gives a supplier a link whose secret is stored only as a hash, and takes their answer', async () => {
    vi.mocked(prisma.traceProduct.findUnique).mockResolvedValue(product as never);
    const { link } = await askSupplier(me, 'p1', { supplier: 'Vidrios del Sur', asks: 'Glass bottle' });
    const token = new URL(link, 'https://x').searchParams.get('k')!;
    expect(token).toMatch(/^[0-9A-Z]{32}$/);
    const stored = vi.mocked(prisma.traceSupplyRequest.create).mock.calls[0][0].data as { tokenHash: string };
    expect(stored.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(vi.mocked(prisma.traceSupplyRequest.create).mock.calls[0][0])).not.toContain(token);

    const req = { id: 'r1', brandId: 'b1', productId: 'p1', supplier: 'Vidrios del Sur', asks: 'Glass bottle', status: 'OPEN', answer: null, expiresAt: new Date(Date.now() + 86_400_000) };
    vi.mocked(prisma.traceSupplyRequest.findUnique).mockResolvedValue(req as never);
    expect((await supplierView(token)).asks).toBe('Glass bottle');
    await supplierAnswer({ k: token, answer: { material: { name: 'Glass bottle', recycled: 62, origin: 'Seville' } } });
    expect(vi.mocked(prisma.traceSupplyRequest.update).mock.calls[0][0].data).toMatchObject({ status: 'ANSWERED' });

    vi.mocked(prisma.traceSupplyRequest.findUnique).mockResolvedValue({ ...req, expiresAt: new Date(Date.now() - 1000) } as never);
    await expect(supplierView(token)).rejects.toThrow(/ended/);
    await expect(supplierView('short')).rejects.toThrow(/ended/);
  });

  it('adds an answer to the passport only once it is answered', async () => {
    vi.mocked(prisma.traceSupplyRequest.findUnique).mockResolvedValue({ id: 'r1', brandId: 'b1', productId: 'p1', status: 'OPEN', answer: null } as never);
    await expect(useSupplyAnswer(me, 'r1')).rejects.toThrow(/no answer/);
    vi.mocked(prisma.traceSupplyRequest.findUnique).mockResolvedValue({ id: 'r1', brandId: 'b1', productId: 'p1', status: 'ANSWERED', answer: JSON.stringify({ material: { name: 'Glass bottle', origin: 'Seville' } }) } as never);
    vi.mocked(prisma.traceProduct.findUnique).mockResolvedValue(product as never);
    const out = await useSupplyAnswer(me, 'r1');
    expect(out.dpp.materials[0]).toMatchObject({ name: 'Glass bottle', origin: 'Seville' });
    expect(out.dpp.madeIn).toBe('Spain');
  });
});
