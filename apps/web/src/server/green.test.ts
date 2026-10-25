import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { notify } from './email';
import { addGreenProof, confirmGreenAction } from './green';

vi.mock('@/lib/db', () => ({ default: { greenAction: { findUnique: vi.fn(), updateMany: vi.fn() }, greenMember: { findMany: vi.fn(), count: vi.fn() } } }));
vi.mock('@/lib/storage', () => ({ isAppFileUrl: (u: unknown) => typeof u === 'string' && u.startsWith('/api/files/') }));
vi.mock('./email', () => ({ notify: vi.fn() }));
vi.mock('./services/push.service', () => ({ pushService: { sendToUser: vi.fn().mockResolvedValue(undefined) } }));

const me = { id: 'mate', name: 'Maya', role: 'STUDENT' } as never;
const action = { id: 'a1', userId: 'owner', kind: 'CYCLE', amount: 10, co2Kg: 2, photoUrl: '/api/files/k/p.jpg', verifiedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.greenAction.findUnique).mockResolvedValue(action as never);
  vi.mocked(prisma.greenMember.findMany).mockResolvedValue([{ teamId: 't1' }] as never);
  vi.mocked(prisma.greenMember.count).mockResolvedValue(1);
  vi.mocked(prisma.greenAction.updateMany).mockResolvedValue({ count: 1 });
});

describe('green proof', () => {
  it('lets a teammate confirm, once, and tells the person', async () => {
    expect(await confirmGreenAction(me, 'a1')).toEqual({ ok: true });
    expect(vi.mocked(prisma.greenAction.updateMany).mock.calls[0][0].where).toEqual({ id: 'a1', verifiedAt: null });
    expect(vi.mocked(notify).mock.calls[0][0]).toBe('owner');
    expect(vi.mocked(notify).mock.calls[0][1].email).toBe(false);
  });

  it('never lets people confirm their own action', async () => {
    await expect(confirmGreenAction({ ...(me as object), id: 'owner' } as never, 'a1')).rejects.toThrow(/teammate/);
    expect(prisma.greenAction.updateMany).not.toHaveBeenCalled();
  });

  it('refuses someone outside their teams, and an action without a photo', async () => {
    vi.mocked(prisma.greenMember.count).mockResolvedValue(0);
    await expect(confirmGreenAction(me, 'a1')).rejects.toThrow(/one of their teams/);
    vi.mocked(prisma.greenAction.findUnique).mockResolvedValue({ ...action, photoUrl: null } as never);
    await expect(confirmGreenAction(me, 'a1')).rejects.toThrow(/no photo/);
    expect(prisma.greenAction.updateMany).not.toHaveBeenCalled();
  });

  it('takes only our own uploads as a photo, on my unconfirmed action', async () => {
    await expect(addGreenProof(me, 'a1', { photoUrl: 'https://evil.example/x.jpg' })).rejects.toThrow(/photo/);
    await addGreenProof(me, 'a1', { photoUrl: '/api/files/k/p.jpg' });
    expect(vi.mocked(prisma.greenAction.updateMany).mock.calls[0][0].where).toEqual({ id: 'a1', userId: 'mate', verifiedAt: null });
  });
});
