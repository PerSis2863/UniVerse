import prisma from '@/lib/db';

// M78: the admin sign-in code's tries, in the database so every server sees the same count. Each try
// is counted before the code is checked (an atomic increment), so many tries sent at once can't all
// slip in under the limit. The count starts again 15 minutes after the last try.
export const TRIES = 5;
const WINDOW_MS = 15 * 60_000;

/** Counts one try; false when this account has used up its tries (wait 15 minutes). */
export async function takeTry(userId: string, now = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  await prisma.user.updateMany({ where: { id: userId, OR: [{ twoStepTriedAt: null }, { twoStepTriedAt: { lt: cutoff } }] }, data: { twoStepTries: 0 } });
  const u = await prisma.user.update({ where: { id: userId }, data: { twoStepTries: { increment: 1 }, twoStepTriedAt: now }, select: { twoStepTries: true } });
  return u.twoStepTries <= TRIES;
}

/** The right code: the count starts again. */
export const clearTries = (userId: string) => prisma.user.updateMany({ where: { id: userId }, data: { twoStepTries: 0 } });
