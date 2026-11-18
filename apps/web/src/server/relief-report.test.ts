import { describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { incidentReport } from './relief-report';
import type { SessionUser } from '@/lib/server-auth';

// M314: an emergency's report is for its organisation's members, and counts only posts inside its area.
vi.mock('@/lib/db', () => ({
  default: {
    reliefIncident: { findUnique: vi.fn() },
    reliefSafe: { findMany: vi.fn().mockResolvedValue([]) },
    reliefPost: { findMany: vi.fn() },
    reliefSupplyMove: { findMany: vi.fn().mockResolvedValue([]) },
    reliefShift: { findMany: vi.fn().mockResolvedValue([]) },
    reliefOrg: { findUnique: vi.fn().mockResolvedValue({ name: 'Riverside Aid' }) },
    reliefSupply: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
const role = vi.fn();
vi.mock('./relief-orgs', () => ({ orgRole: (...a: unknown[]) => role(...a) }));
const ana = { id: 'ana' } as SessionUser;
const start = new Date(Date.now() - 10 * 3600_000), end = new Date(Date.now() - 3600_000);

describe('an emergency report', () => {
  it('is for members only', async () => {
    vi.mocked(prisma.reliefIncident.findUnique).mockResolvedValue({ id: 'i1', orgId: 'o1', lat: 0, lng: 0, radiusKm: 5, createdAt: start, endsAt: end, title: 'Flood', place: null } as never);
    role.mockResolvedValue(null);
    await expect(incidentReport(ana, 'i1')).rejects.toThrow(/members/);
  });
  it('counts the needs inside the area, delivered and people helped', async () => {
    role.mockResolvedValue('VOLUNTEER');
    vi.mocked(prisma.reliefPost.findMany).mockResolvedValue([
      { id: 'a', type: 'NEED', kind: 'WATER', title: 'Water', people: 4, status: 'DONE', lat: 0.01, lng: 0, createdAt: start, takenAt: start, doneAt: end },
      { id: 'b', type: 'NEED', kind: 'FOOD', title: 'Food', people: 2, status: 'OPEN', lat: 0.02, lng: 0, createdAt: start, takenAt: null, doneAt: null },
      { id: 'c', type: 'NEED', kind: 'FOOD', title: 'Far', people: 9, status: 'DONE', lat: 0.044, lng: 0.044, createdAt: start, takenAt: null, doneAt: end },
    ] as never);
    const r = await incidentReport(ana, 'i1');
    expect(r.numbers).toMatchObject({ needs: 2, delivered: 1, helped: 4 });
    expect(r.timeline[0].kind).toBe('start');
    expect(r.timeline.at(-1)?.kind).toBe('end');
  });
});
