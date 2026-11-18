import { describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { guardianWeek } from './guardian-week';
import type { SessionUser } from '@/lib/server-auth';

// M300: a parent sees only a child linked to them, and only the last 26 weeks.
vi.mock('@/lib/db', () => ({ default: { guardianLink: { findFirst: vi.fn() } } }));
const mum = { id: 'mum', role: 'GUARDIAN' } as SessionUser;

describe('a parent’s week', () => {
  it('refuses a child who isn’t linked', async () => {
    vi.mocked(prisma.guardianLink.findFirst).mockResolvedValue(null);
    await expect(guardianWeek(mum, 'kid', undefined)).rejects.toThrow(/isn’t linked/);
    expect(vi.mocked(prisma.guardianLink.findFirst).mock.calls[0][0]).toEqual({ where: { guardianId: 'mum', studentId: 'kid' }, select: { id: true } });
  });

  it('refuses weeks to come and long ago', async () => {
    vi.mocked(prisma.guardianLink.findFirst).mockResolvedValue({ id: 'l1' } as never);
    await expect(guardianWeek(mum, 'kid', '2099-01-05')).rejects.toThrow(/last 26 weeks/);
    await expect(guardianWeek(mum, 'kid', '2020-01-06')).rejects.toThrow(/last 26 weeks/);
  });
});
