import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { claim, codeFor, createBatch, scan } from './trace';

vi.mock('@/lib/db', () => ({
  default: {
    traceBatch: { findUnique: vi.fn(), create: vi.fn() },
    traceProduct: { findUnique: vi.fn() },
    traceCode: { upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    traceScan: { create: vi.fn(), count: vi.fn() },
    traceEvent: { findMany: vi.fn(), create: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}));
vi.mock('./request-cf', () => ({ requestCf: () => ({ city: 'Paris', country: 'FR' }) }));
vi.mock('./impact-scholarships', () => ({ mintImpactCredits: vi.fn(), getImpactCreditBalance: vi.fn().mockResolvedValue(40) }));

const batch = { id: 'b1', productId: 'p1', organizationId: null, codeKey: 'ABC123', secret: 's3cret', quantity: 10, label: 'Batch', origin: 'Jaén', madeAt: null, product: { name: 'Oil', category: null, description: null, story: null, imageUrl: null, warrantyMonths: 0, rewardPoints: 25 } };
const req = new Request('https://x.test', { headers: { 'user-agent': 'iPhone' } });
const fresh = { id: '', scanCount: 0, firstLat: null, firstLng: null, firstCountry: null, firstPlace: null, firstScanAt: null, claimedById: null, status: 'ACTIVE' };
const user = { id: 'u1', name: 'Shop', email: 's@x.test', role: 'STUDENT' } as SessionUser;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.traceBatch.findUnique).mockResolvedValue(batch as never);
  vi.mocked(prisma.traceCode.upsert).mockResolvedValue(fresh as never);
  vi.mocked(prisma.traceCode.update).mockResolvedValue({ ...fresh, scanCount: 1 } as never);
  vi.mocked(prisma.traceEvent.findMany).mockResolvedValue([] as never);
});

describe('trace scans', () => {
  it('accepts a code signed with the batch secret, in any case or grouping', async () => {
    const code = codeFor(batch, 3);
    const res = await scan(`${code.slice(0, 6)}-${code.slice(6, 10)}-${code.slice(10)}`.toLowerCase(), {}, null, req);
    expect(res.result).toBe('FIRST');
    expect(prisma.traceScan.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ verdict: 'FIRST', place: 'Paris, FR', device: 'iPhone' }) }));
    expect('serial' in res && res.serial).toBe(4);
  });

  it('refuses forged signatures and serials past the batch', async () => {
    const code = codeFor(batch, 3);
    const forged = code.slice(0, -1) + (code.endsWith('0') ? '1' : '0');
    expect((await scan(forged, {}, null, req)).result).toBe('UNKNOWN');
    expect((await scan(codeFor(batch, 10), {}, null, req)).result).toBe('UNKNOWN');
    expect((await scan('not-a-code', {}, null, req)).result).toBe('UNKNOWN');
    expect(prisma.traceCode.upsert).not.toHaveBeenCalled();
  });

  it('does not count a repeat visit from the same browser', async () => {
    vi.mocked(prisma.traceCode.upsert).mockResolvedValue({ ...fresh, scanCount: 1, firstCountry: 'FR' } as never);
    const res = await scan(codeFor(batch, 1), { again: true }, null, req);
    expect(res.result).toBe('SEEN');
    expect(prisma.traceScan.create).not.toHaveBeenCalled();
    expect(prisma.traceCode.update).not.toHaveBeenCalled();
  });

  it('serves the sample passport without touching the database', async () => {
    const res = await scan('demo', {}, null, req);
    expect(res.result).toBe('FIRST');
    expect(prisma.traceBatch.findUnique).not.toHaveBeenCalled();
  });
});

describe('trace points', () => {
  it('pays the first claimer once and refuses likely copies', async () => {
    const code = codeFor(batch, 2);
    vi.mocked(prisma.traceCode.findUnique).mockResolvedValue({ ...fresh, id: code, organizationId: null, product: { name: 'Oil', rewardPoints: 25 } } as never);
    vi.mocked(prisma.traceScan.count).mockResolvedValue(0);
    vi.mocked(prisma.traceCode.updateMany).mockResolvedValue({ count: 1 });
    await expect(claim(code, user)).resolves.toEqual({ points: 25, balance: 40 });

    vi.mocked(prisma.traceCode.updateMany).mockResolvedValue({ count: 0 });
    await expect(claim(code, user)).rejects.toThrow(/already earned/);

    vi.mocked(prisma.traceScan.count).mockResolvedValue(1);
    await expect(claim(code, user)).rejects.toThrow(/may be a copy/);
  });
});

describe('trace batches', () => {
  const admin = { ...user, role: 'ADMIN', organizationId: null } as SessionUser;
  it('makes a batch with its own key and secret, and records where it was made', async () => {
    vi.mocked(prisma.traceProduct.findUnique).mockResolvedValue({ id: 'p1', organizationId: null } as never);
    vi.mocked(prisma.traceBatch.create).mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({ id: 'b9', ...data })) as never);
    const res = await createBatch(admin, 'p1', { quantity: 500, origin: 'Jaén', label: 'Press 3' });
    const data = vi.mocked(prisma.traceBatch.create).mock.calls[0][0].data as unknown as Record<string, string>;
    expect(data.codeKey).toMatch(/^[0-9A-Z]{6}$/);
    expect(data.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(res).toMatchObject({ id: 'b9', quantity: 500, label: 'Press 3' });
    expect(res.firstCode).toMatch(new RegExp(`^${data.codeKey}-0000-`));
    expect(prisma.traceEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stage: 'MADE', place: 'Jaén' }) }));
  });

  it('refuses another brand’s product and silly quantities', async () => {
    vi.mocked(prisma.traceProduct.findUnique).mockResolvedValue({ id: 'p1', organizationId: 'other' } as never);
    await expect(createBatch(admin, 'p1', { quantity: 5 })).rejects.toThrow(/not found/);
    vi.mocked(prisma.traceProduct.findUnique).mockResolvedValue({ id: 'p1', organizationId: null } as never);
    await expect(createBatch(admin, 'p1', { quantity: 0 })).rejects.toThrow(/How many/);
    await expect(createBatch(admin, 'p1', { quantity: 2.5 })).rejects.toThrow(/How many/);
  });
});

