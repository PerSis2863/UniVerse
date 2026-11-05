import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { mayChangeRole, nextQuantity, shiftState, supplyLow } from '@/lib/relief';
import { notifyMany } from './email';
import { reliefOrg, setReliefOrgMember, signUpReliefShift, updateReliefSupply } from './relief-orgs';
import type { SessionUser } from '@/lib/server-auth';

vi.mock('@/lib/db', () => ({
  default: {
    reliefOrgMember: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn(), update: vi.fn(), delete: vi.fn() },
    reliefOrg: { findUnique: vi.fn().mockResolvedValue({ name: 'Riverside Food Bank' }) },
    reliefShift: { findUnique: vi.fn() },
    reliefShiftSignup: { findUnique: vi.fn(), create: vi.fn() },
    reliefSupply: { findFirst: vi.fn(), update: vi.fn() },
    reliefSupplyMove: { create: vi.fn() },
    $executeRawUnsafe: vi.fn(),
  },
}));
vi.mock('./email', () => ({ notifyMany: vi.fn().mockResolvedValue(1) }));
vi.mock('./services/push.service', () => ({ pushService: { sendToMany: vi.fn().mockResolvedValue(1) } }));
vi.mock('./realtime', () => ({ publish: vi.fn() }));

const me = { id: 'me', name: 'Sam' } as SessionUser;
const role = (r: string | null) => vi.mocked(prisma.reliefOrgMember.findUnique).mockResolvedValueOnce((r ? { role: r } : null) as never);
const shift = { id: 's1', orgId: 'o1', title: 'Sorting donations', slots: 4, filled: 3, membersOnly: false, createdById: 'boss', startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000) };

beforeEach(() => vi.clearAllMocks());

describe('the rules', () => {
  it('lets owners do anything but leave no owner, and coordinators move only volunteers', () => {
    expect(mayChangeRole('OWNER', 'COORDINATOR', 'OWNER', 1)).toBe(true);
    expect(mayChangeRole('OWNER', 'OWNER', 'VOLUNTEER', 1)).toBe(false);
    expect(mayChangeRole('OWNER', 'OWNER', 'VOLUNTEER', 2)).toBe(true);
    expect(mayChangeRole('COORDINATOR', 'VOLUNTEER', 'COORDINATOR', 1)).toBe(true);
    expect(mayChangeRole('COORDINATOR', 'VOLUNTEER', 'OWNER', 1)).toBe(false);
    expect(mayChangeRole('COORDINATOR', 'COORDINATOR', null, 1)).toBe(false);
    expect(mayChangeRole('VOLUNTEER', 'VOLUNTEER', null, 1)).toBe(false);
  });

  it('keeps stock between zero and a million, and knows what runs low', () => {
    expect(nextQuantity(5, -9)).toBe(0);
    expect(nextQuantity(999_990, 50)).toBe(1_000_000);
    expect(supplyLow({ quantity: 10, lowAt: 10 })).toBe(true);
    expect(supplyLow({ quantity: 1, lowAt: 0 })).toBe(false);
    expect(supplyLow({ quantity: 0, lowAt: 0 })).toBe(true);
  });

  it('counts the places left on a shift', () => {
    const s = { slots: 4, filled: 4, startsAt: '2026-11-05T09:00:00Z', endsAt: '2026-11-05T12:00:00Z' };
    expect(shiftState(s, Date.parse('2026-11-05T10:00:00Z'))).toEqual({ left: 0, full: true, started: true, over: false });
    expect(shiftState({ ...s, filled: 1 }, Date.parse('2026-11-04T10:00:00Z')).left).toBe(3);
  });
});

describe('organisations on the server', () => {
  it('tells someone outside that the organisation does not exist', async () => {
    role(null);
    await expect(reliefOrg(me, 'o1')).rejects.toThrow(/gone, or you aren’t in it/);
  });

  it('takes a shift place only while one is left (the guarded update), then tells the coordinator', async () => {
    vi.mocked(prisma.reliefShift.findUnique).mockResolvedValue(shift as never);
    vi.mocked(prisma.reliefShiftSignup.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$executeRawUnsafe).mockResolvedValueOnce(0 as never);
    await expect(signUpReliefShift(me, 's1')).rejects.toThrow(/full/);
    expect(prisma.reliefShiftSignup.create).not.toHaveBeenCalled();

    vi.mocked(prisma.$executeRawUnsafe).mockResolvedValueOnce(1 as never);
    await expect(signUpReliefShift(me, 's1')).resolves.toEqual({ ok: true });
    expect(String(vi.mocked(prisma.$executeRawUnsafe).mock.calls[1][0])).toContain('"filled" < "slots"');
    expect(prisma.reliefShiftSignup.create).toHaveBeenCalledWith({ data: { shiftId: 's1', userId: 'me' } });
    expect(vi.mocked(notifyMany).mock.calls[0][0]).toEqual(['boss']);
    expect(vi.mocked(notifyMany).mock.calls[0][1]).toMatchObject({ email: false, title: 'Sam signed up: Sorting donations' });
  });

  it('keeps members-only shifts for members', async () => {
    vi.mocked(prisma.reliefShift.findUnique).mockResolvedValue({ ...shift, membersOnly: true } as never);
    role(null);
    await expect(signUpReliefShift(me, 's1')).rejects.toThrow(/members/);
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('lets a volunteer change a count (logged) but not the item itself', async () => {
    vi.mocked(prisma.reliefSupply.findFirst).mockResolvedValue({ id: 'w', orgId: 'o1', quantity: 10 } as never);
    role('VOLUNTEER');
    await expect(updateReliefSupply(me, 'o1', 'w', { change: -4, note: 'Handed out' })).resolves.toEqual({ ok: true, quantity: 6 });
    expect(String(vi.mocked(prisma.$executeRawUnsafe).mock.calls[0][0])).toContain('MAX(0, "quantity" + ?)');
    expect(prisma.reliefSupplyMove.create).toHaveBeenCalledWith({ data: { orgId: 'o1', supplyId: 'w', userId: 'me', change: -4, note: 'Handed out' } });

    role('VOLUNTEER');
    await expect(updateReliefSupply(me, 'o1', 'w', { name: 'Renamed' })).rejects.toThrow(/Only coordinators/);
    expect(prisma.reliefSupply.update).not.toHaveBeenCalled();
  });

  it('never leaves an organisation without an owner, and coordinators cannot make owners', async () => {
    role('OWNER'); role('OWNER');
    vi.mocked(prisma.reliefOrgMember.count).mockResolvedValueOnce(1);
    await expect(setReliefOrgMember(me, 'o1', 'other', { role: 'VOLUNTEER' })).rejects.toThrow(/at least one owner/);

    role('COORDINATOR'); role('VOLUNTEER');
    vi.mocked(prisma.reliefOrgMember.count).mockResolvedValueOnce(1);
    await expect(setReliefOrgMember(me, 'o1', 'other', { role: 'OWNER' })).rejects.toThrow(/Ask an owner/);
    expect(prisma.reliefOrgMember.update).not.toHaveBeenCalled();
  });
});
