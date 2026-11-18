import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { notify } from './email';
import { addTravelDoc, docReminders, removeTravelDoc, travelDocs, updateTravelDoc } from './travel-docs';
import type { SessionUser } from '@/lib/server-auth';

// M245: documents are only ever their owner's; each reminder goes once, in the app only.
vi.mock('@/lib/db', () => ({
  default: {
    travelTripMember: { findUnique: vi.fn() },
    travelDoc: { findMany: vi.fn(), count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 'd1' }), updateMany: vi.fn().mockResolvedValue({ count: 1 }), deleteMany: vi.fn().mockResolvedValue({ count: 0 }), update: vi.fn() },
  },
}));
vi.mock('./email', () => ({ notify: vi.fn() }));

const ana = { id: 'ana' } as SessionUser;
beforeEach(() => vi.clearAllMocks());

describe('travel documents', () => {
  it('reads and changes only my own rows', async () => {
    vi.mocked(prisma.travelDoc.findMany).mockResolvedValue([]);
    await travelDocs(ana, { trip: 't1' });
    expect(vi.mocked(prisma.travelDoc.findMany).mock.calls[0][0]!.where).toEqual({ userId: 'ana', OR: [{ tripId: 't1' }, { tripId: null }] });
    await updateTravelDoc(ana, 'd9', { expires: '2028-01-01' });
    expect(prisma.travelDoc.updateMany).toHaveBeenCalledWith({ where: { id: 'd9', userId: 'ana' }, data: { expires: '2028-01-01', reminded: '' } });
    await expect(removeTravelDoc(ana, 'someone-elses')).rejects.toThrow(/isn’t there/);
  });
  it('keeps a document for a trip only when I’m planning it, and checks the date', async () => {
    vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue(null);
    await expect(addTravelDoc(ana, { kind: 'visa', tripId: 'not-mine' })).rejects.toThrow(/isn’t one of yours/);
    await expect(addTravelDoc(ana, { kind: 'visa', expires: '31/12/2027' })).rejects.toThrow(/expiry date/);
    await addTravelDoc(ana, { kind: 'nonsense', label: ' Visa  for Japan ', expires: '2027-12-31' });
    expect(vi.mocked(prisma.travelDoc.create).mock.calls[0][0].data).toMatchObject({ userId: 'ana', tripId: null, kind: 'other', label: 'Visa for Japan', expires: '2027-12-31' });
  });
  it('sends a due reminder once, in the app, and stops when the run is out of room', async () => {
    const row = { id: 'd1', userId: 'ana', kind: 'passport', label: '', expires: '2027-01-10', reminded: '', tripId: null, trip: null };
    vi.mocked(prisma.travelDoc.findMany).mockResolvedValue([row, { ...row, id: 'd2', reminded: 'exp30' }] as never);
    const r = await docReminders(() => 40, new Date('2027-01-01T08:00:00Z'));
    expect(r).toEqual({ done: true, info: 1 });
    expect(vi.mocked(notify).mock.calls[0][1]).toMatchObject({ title: 'Passport expires in 9 days', email: false });
    expect(prisma.travelDoc.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { reminded: 'exp30' } });
    expect(await docReminders(() => 3, new Date('2027-01-01T08:00:00Z'))).toEqual({ done: false, info: 0 });
  });
});
