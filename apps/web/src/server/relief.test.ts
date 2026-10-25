import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { notifyMany } from './email';
import { alertWatchers } from './relief';

vi.mock('@/lib/db', () => ({ default: { reliefWatch: { findMany: vi.fn() } } }));
vi.mock('./email', () => ({ notifyMany: vi.fn().mockResolvedValue(1) }));
vi.mock('./services/push.service', () => ({ pushService: { sendToMany: vi.fn().mockResolvedValue(1) } }));

const post = { id: 'p1', userId: 'asker', kind: 'WATER', title: 'Water for 4', urgency: 'HIGH', people: 4, lat: 48.86, lng: 2.35, place: 'Paris' };
const watch = (userId: string, o: Partial<{ lat: number; lng: number; radiusKm: number; urgentOnly: boolean; kinds: string | null }> = {}) => ({ userId, lat: 48.86, lng: 2.35, radiusKm: 5, urgentOnly: true, kinds: null, createdAt: new Date(), ...o });

beforeEach(() => vi.clearAllMocks());

describe('relief alerts', () => {
  it('tells helpers within their radius who want this kind and urgency', async () => {
    vi.mocked(prisma.reliefWatch.findMany).mockResolvedValue([
      watch('near'),
      watch('far', { lat: 48.98 }), // ~13 km away, radius 5
      watch('food-only', { kinds: 'FOOD' }),
      watch('wide', { lat: 48.98, radiusKm: 25 }),
    ] as never);
    expect(await alertWatchers(post)).toBe(2);
    expect(vi.mocked(notifyMany).mock.calls[0][0]).toEqual(['near', 'wide']);
    expect(vi.mocked(notifyMany).mock.calls[0][1].title).toBe('Urgent: Water needed near you');
  });

  it('keeps low-urgency needs for helpers who asked for every need', async () => {
    vi.mocked(prisma.reliefWatch.findMany).mockResolvedValue([watch('urgent-only'), watch('all', { urgentOnly: false })] as never);
    expect(await alertWatchers({ ...post, urgency: 'LOW' })).toBe(1);
    expect(vi.mocked(notifyMany).mock.calls[0][0]).toEqual(['all']);
  });
});
