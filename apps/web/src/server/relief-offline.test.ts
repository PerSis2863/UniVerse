import { describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { createReliefPost } from './relief';
import type { SessionUser } from '@/lib/server-auth';

// M316: a request sent again from the phone's outbox makes no second post.
vi.mock('@/lib/db', () => ({ default: { reliefPost: { findUnique: vi.fn(), count: vi.fn().mockResolvedValue(0), create: vi.fn() } } }));
vi.mock('./email', () => ({ notifyMany: vi.fn(), later: vi.fn() }));
vi.mock('./services/push.service', () => ({ pushService: { sendToMany: vi.fn() } }));
const ana = { id: 'ana', name: 'Ana' } as SessionUser;
const body = { type: 'OFFER', kind: 'FOOD', title: 'Hot meals', lat: 10, lng: 20, clientId: 'abcdefgh-1234' };

describe('relief posts from the outbox', () => {
  it('returns the post a client id already made', async () => {
    vi.mocked(prisma.reliefPost.findUnique).mockResolvedValue({ id: 'p1' } as never);
    expect(await createReliefPost(ana, body)).toEqual({ id: 'p1' });
    expect(prisma.reliefPost.create).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.reliefPost.findUnique).mock.calls[0][0]).toEqual({ where: { userId_clientId: { userId: 'ana', clientId: 'abcdefgh-1234' } } });
  });
  it('makes it once with the client id kept', async () => {
    vi.mocked(prisma.reliefPost.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.reliefPost.create).mockResolvedValue({ id: 'p2', type: 'OFFER' } as never);
    await createReliefPost(ana, body);
    expect(vi.mocked(prisma.reliefPost.create).mock.calls[0][0].data).toMatchObject({ clientId: 'abcdefgh-1234', userId: 'ana' });
  });
});
