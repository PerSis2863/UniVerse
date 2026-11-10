import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { notifyMany } from './email';
import { contactsOf, declareIncident, markSafe } from './relief-safety';
import type { SessionUser } from '@/lib/server-auth';

vi.mock('@/lib/db', () => ({
  default: {
    conversationParticipant: { findMany: vi.fn() },
    reliefOrgMember: { findUnique: vi.fn() },
    reliefOrg: { findUnique: vi.fn() },
    reliefIncident: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
    reliefSafe: { upsert: vi.fn() },
    reliefSafeTold: { findMany: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    reliefWatch: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock('./email', () => ({ notifyMany: vi.fn().mockResolvedValue(1), later: vi.fn() }));
vi.mock('./services/push.service', () => ({ pushService: { sendToMany: vi.fn().mockResolvedValue(1) } }));

const me = { id: 'me', name: 'Sam' } as SessionUser;
/** My direct conversations c1 (with Ana) and c2 (with Ben, then Ana again in an old one). */
const talks = () => vi.mocked(prisma.conversationParticipant.findMany)
  .mockResolvedValueOnce([{ conversationId: 'c1' }, { conversationId: 'c2' }, { conversationId: 'c3' }] as never)
  .mockResolvedValueOnce([
    { conversationId: 'c3', user: { id: 'ana', name: 'Ana' } },
    { conversationId: 'c2', user: { id: 'ben', name: 'Ben' } },
    { conversationId: 'c1', user: { id: 'ana', name: 'Ana' } },
  ] as never);

beforeEach(() => vi.clearAllMocks());

describe('the "I’m safe" check-in', () => {
  it('lists each person once, newest conversation first', async () => {
    talks();
    expect((await contactsOf('me')).map((c) => c.id)).toEqual(['ana', 'ben']);
  });

  it('tells only people I talk with, and nobody twice', async () => {
    vi.mocked(prisma.reliefIncident.findUnique).mockResolvedValue({ id: 'i1', title: 'Flood', endsAt: new Date(Date.now() + 3_600_000) } as never);
    talks();
    vi.mocked(prisma.reliefSafeTold.findMany).mockResolvedValue([{ toUserId: 'ben' }] as never);
    const r = await markSafe(me, 'i1', { tell: ['ana', 'ben', 'stranger'] });
    expect(r.told).toBe(2);
    expect(prisma.reliefSafeTold.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyMany).mock.calls[0][0]).toEqual(['ana']);
  });

  it('refuses once the emergency is over', async () => {
    vi.mocked(prisma.reliefIncident.findUnique).mockResolvedValue({ id: 'i1', title: 'Flood', endsAt: new Date(Date.now() - 1000) } as never);
    await expect(markSafe(me, 'i1', {})).rejects.toThrow('over');
    expect(prisma.reliefSafe.upsert).not.toHaveBeenCalled();
  });

  it('lets only coordinators declare one', async () => {
    vi.mocked(prisma.reliefOrgMember.findUnique).mockResolvedValueOnce({ role: 'VOLUNTEER' } as never);
    await expect(declareIncident(me, { orgId: 'o1', title: 'Flood' })).rejects.toThrow('coordinators');
    expect(prisma.reliefIncident.create).not.toHaveBeenCalled();
  });
});
