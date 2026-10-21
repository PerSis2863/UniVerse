import prisma from '@/lib/db';
import { presenceOf } from '@/lib/presence';
import { inParts } from './d1-parts';

// Focus (Busy, In class, Sleeping): calls don't ring and call pushes aren't sent, unless the caller
// is one of that person's favourites (like iPhone Focus with "Allowed people").

/** Of these people, the ones a call from `callerId` should not ring right now (a big group's in parts). */
export async function quietFor(userIds: string[], callerId: string): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const people = await inParts([...new Set(userIds)], (part) => prisma.user.findMany({ where: { id: { in: part } }, select: { id: true, presence: true, statusUntil: true } }));
  const focused = people.filter((p) => presenceOf(p).focus).map((p) => p.id);
  if (!focused.length) return new Set();
  const allowed = await inParts(focused, (part) => prisma.favoritePerson.findMany({ where: { userId: { in: part }, favoriteId: callerId }, select: { userId: true } }));
  const ok = new Set(allowed.map((a) => a.userId));
  return new Set(focused.filter((id) => !ok.has(id)));
}
