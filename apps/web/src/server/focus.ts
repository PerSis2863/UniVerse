import prisma from '@/lib/db';
import { presenceOf } from '@/lib/presence';

// Focus (Busy, In class, Sleeping): calls don't ring and call pushes aren't sent, unless the caller
// is one of that person's favourites (like iPhone Focus with "Allowed people").

/** Of these people, the ones a call from `callerId` should not ring right now. */
export async function quietFor(userIds: string[], callerId: string): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const people = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, presence: true, statusUntil: true } });
  const focused = people.filter((p) => presenceOf(p).focus).map((p) => p.id);
  if (!focused.length) return new Set();
  const allowed = await prisma.favoritePerson.findMany({ where: { userId: { in: focused }, favoriteId: callerId }, select: { userId: true } });
  const ok = new Set(allowed.map((a) => a.userId));
  return new Set(focused.filter((id) => !ok.has(id)));
}
