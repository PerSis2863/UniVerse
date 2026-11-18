import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { notifyMany } from './email';
import { copySeen } from './trace-watch';

// M308: a brand hears once its area crosses the line, and once a day per area.
vi.mock('@/lib/db', () => ({
  default: {
    traceBrand: { findUnique: vi.fn(), update: vi.fn() },
    traceScan: { count: vi.fn() },
    traceFakeReport: { count: vi.fn() },
    traceBrandMember: { findMany: vi.fn().mockResolvedValue([{ userId: 'owner' }]) },
  },
}));
vi.mock('./email', () => ({ notifyMany: vi.fn() }));
vi.mock('./trace', () => ({ brandOf: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

describe('area alerts', () => {
  it('tells the team when a watched country reaches the threshold', async () => {
    vi.mocked(prisma.traceBrand.findUnique).mockResolvedValue({ watch: '{"countries":["IN"],"threshold":3}', watchSent: null } as never);
    vi.mocked(prisma.traceScan.count).mockResolvedValue(2);
    vi.mocked(prisma.traceFakeReport.count).mockResolvedValue(1);
    expect(await copySeen('b1', { country: 'IN', lat: 19, lng: 72 }, 'Trail runner')).toBe(3);
    expect(vi.mocked(notifyMany).mock.calls[0][1].title).toBe('3 likely copies in IN today');
    expect(JSON.parse(vi.mocked(prisma.traceBrand.update).mock.calls[0][0].data.watchSent as string)).toHaveProperty('c:IN');
  });

  it('stays quiet below the threshold, and the same day again', async () => {
    vi.mocked(prisma.traceBrand.findUnique).mockResolvedValue({ watch: '{"countries":["IN"],"threshold":5}', watchSent: null } as never);
    vi.mocked(prisma.traceScan.count).mockResolvedValue(2);
    vi.mocked(prisma.traceFakeReport.count).mockResolvedValue(1);
    expect(await copySeen('b1', { country: 'IN', lat: null, lng: null }, null)).toBe(0);
    vi.mocked(prisma.traceBrand.findUnique).mockResolvedValue({ watch: '{"countries":["IN"],"threshold":1}', watchSent: JSON.stringify({ 'c:IN': new Date().toISOString() }) } as never);
    expect(await copySeen('b1', { country: 'IN', lat: null, lng: null }, null)).toBe(0);
    expect(notifyMany).not.toHaveBeenCalled();
  });
});
