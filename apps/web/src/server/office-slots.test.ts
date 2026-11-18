import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { bookSlot, cancelBooking } from './office-slots';
import { notify } from './email';
import type { SessionUser } from '@/lib/server-auth';

// M295: a time is booked by one student only; a cancelled one goes to the first who waits.
vi.mock('@/lib/db', () => ({
  default: {
    course: { findMany: vi.fn().mockResolvedValue([{ code: 'CS1', teacher: { id: 't1', name: 'Tara Teach' } }]) },
    officeSlot: { findUnique: vi.fn(), count: vi.fn().mockResolvedValue(0), updateMany: vi.fn() },
    officeWaitlist: { deleteMany: vi.fn(), delete: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn().mockResolvedValue({ name: 'Tara Teach' }) },
  },
}));
vi.mock('./email', () => ({ notify: vi.fn() }));
vi.mock('./realtime', () => ({ publish: vi.fn() }));

const ana = { id: 'ana', name: 'Ana Ray', role: 'STUDENT' } as SessionUser;
const soon = new Date(Date.now() + 86_400_000);
const slot = (over: object) => ({ id: 's1', teacherId: 't1', startAt: soon, durationMin: 15, studentId: null, waiting: [], ...over });
beforeEach(() => vi.clearAllMocks());

describe('office-hours bookings', () => {
  it('refuses a time someone just took', async () => {
    vi.mocked(prisma.officeSlot.findUnique).mockResolvedValue(slot({}) as never);
    vi.mocked(prisma.officeSlot.updateMany).mockResolvedValue({ count: 0 });
    await expect(bookSlot(ana, 's1', {})).rejects.toThrow(/just booked/);
    expect(vi.mocked(prisma.officeSlot.updateMany).mock.calls[0][0].where).toEqual({ id: 's1', studentId: null });
  });

  it('gives a cancelled time to the first one waiting', async () => {
    vi.mocked(prisma.officeSlot.findUnique).mockResolvedValue(slot({ studentId: 'ana', waiting: [{ studentId: 'ben', topic: 'Q3' }, { studentId: 'cy', topic: null }] }) as never);
    vi.mocked(prisma.officeSlot.updateMany).mockResolvedValue({ count: 1 });
    const r = await cancelBooking(ana, 's1');
    expect(r.movedUp).toBe(true);
    const claims = vi.mocked(prisma.officeSlot.updateMany).mock.calls.map((c) => c[0]);
    expect(claims[1]).toMatchObject({ where: { id: 's1', studentId: null }, data: { studentId: 'ben', topic: 'Q3' } });
    expect(vi.mocked(notify).mock.calls.map((c) => c[0])).toEqual(['ben', 't1']);
  });

  it('lets only the student who booked cancel', async () => {
    vi.mocked(prisma.officeSlot.findUnique).mockResolvedValue(slot({ studentId: 'ben' }) as never);
    await expect(cancelBooking(ana, 's1')).rejects.toThrow(/isn’t booked by you/);
  });
});
