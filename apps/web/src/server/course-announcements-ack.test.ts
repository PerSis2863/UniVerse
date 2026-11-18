import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { notifyMany } from './email';
import { remindAnnouncement } from './course-announcements';

// M299: a reminder goes only to the students who haven't seen (or confirmed) it, at most every 12 hours.
vi.mock('@/lib/db', () => ({
  default: {
    announcement: { findFirst: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    enrollment: { findMany: vi.fn().mockResolvedValue([{ student: { id: 'a', name: 'Ana' } }, { student: { id: 'b', name: 'Ben' } }, { student: { id: 'c', name: 'Cy' } }]) },
    announcementRead: { findMany: vi.fn().mockResolvedValue([{ userId: 'a', readAt: new Date(), ackAt: null }, { userId: 'b', readAt: new Date(), ackAt: new Date() }]) },
  },
}));
vi.mock('./email', () => ({ notifyMany: vi.fn() }));
const ann = (over: object) => ({ id: 'n1', title: 'Trip form', needsAck: false, remindedAt: null, publishAt: null, course: { code: 'CS1' }, ...over });
beforeEach(() => vi.clearAllMocks());

describe('announcement reminders', () => {
  it('reminds those who haven’t seen it', async () => {
    vi.mocked(prisma.announcement.findFirst).mockResolvedValue(ann({}) as never);
    expect(await remindAnnouncement('k1', 'n1')).toEqual({ reminded: 1 });
    expect(vi.mocked(notifyMany).mock.calls[0][0]).toEqual(['c']);
  });

  it('reminds those who haven’t confirmed one that asks', async () => {
    vi.mocked(prisma.announcement.findFirst).mockResolvedValue(ann({ needsAck: true }) as never);
    await remindAnnouncement('k1', 'n1');
    expect(vi.mocked(notifyMany).mock.calls[0][0]).toEqual(['a', 'c']);
  });

  it('waits 12 hours between reminders', async () => {
    vi.mocked(prisma.announcement.findFirst).mockResolvedValue(ann({ remindedAt: new Date(Date.now() - 3600_000) }) as never);
    await expect(remindAnnouncement('k1', 'n1')).rejects.toThrow(/12 hours/);
  });
});
