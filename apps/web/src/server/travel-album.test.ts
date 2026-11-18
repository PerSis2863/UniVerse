import { describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { addAlbumPhotos } from './travel-trip-journal';
import type { SessionUser } from '@/lib/server-auth';

// M321: album photos are the trip members' own uploads (app files only), on a day of the trip.
vi.mock('@/lib/db', () => ({ default: { travelTripStop: { findMany: vi.fn().mockResolvedValue([{ days: 3 }]) }, travelTripJournal: { count: vi.fn().mockResolvedValue(0), createMany: vi.fn() } } }));
vi.mock('./travel-trips', () => ({ tripFor: vi.fn().mockResolvedValue({}), memberIds: vi.fn().mockResolvedValue([]) }));
vi.mock('./realtime', () => ({ publish: vi.fn() }));
const ana = { id: 'ana' } as SessionUser;

describe('a trip album', () => {
  it('keeps only app files, on a day of the trip', async () => {
    await expect(addAlbumPhotos(ana, 't1', { day: 5, photoUrls: ['/api/files/abcdefghijklmnop1234'] })).rejects.toThrow(/day/);
    await expect(addAlbumPhotos(ana, 't1', { day: 1, photoUrls: ['https://evil.example/x.jpg'] })).rejects.toThrow(/at least one/);
    expect(await addAlbumPhotos(ana, 't1', { day: 1, photoUrls: ['/api/files/abcdefghijklmnop1234', 'javascript:x', '/api/files/qrstuvwxyzabcdef5678'] })).toEqual({ added: 2 });
    expect(vi.mocked(prisma.travelTripJournal.createMany).mock.calls[0][0].data).toHaveLength(2);
  });
});
