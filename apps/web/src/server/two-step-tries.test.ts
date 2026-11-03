import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { TRIES, clearTries, takeTry } from './two-step-tries';

vi.mock('@/lib/db', () => ({ default: { user: { update: vi.fn(), updateMany: vi.fn() } } }));
type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as { user: { update: Fn; updateMany: Fn } };

describe('admin sign-in code tries (M78)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('counts each try before the check and stops after five', async () => {
    db.user.update.mockResolvedValueOnce({ twoStepTries: TRIES }).mockResolvedValueOnce({ twoStepTries: TRIES + 1 });
    const now = new Date('2026-11-03T10:00:00Z');
    expect(await takeTry('u1', now)).toBe(true);
    expect(await takeTry('u1', now)).toBe(false);
    expect(db.user.update.mock.calls[0][0]).toMatchObject({ where: { id: 'u1' }, data: { twoStepTries: { increment: 1 }, twoStepTriedAt: now } });
    // Only a count whose last try is over 15 minutes old starts again.
    expect(db.user.updateMany.mock.calls[0][0].where.OR[1].twoStepTriedAt.lt).toEqual(new Date('2026-11-03T09:45:00Z'));
  });

  it('starts again after the right code', async () => {
    await clearTries('u1');
    expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { twoStepTries: 0 } });
  });
});
