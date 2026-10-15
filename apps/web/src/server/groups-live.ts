import prisma from '@/lib/db';
import { publish } from './realtime';

/**
 * A group's posts changed: members with UniVerse open refresh that group's chat and their
 * activity feed straight away, so group pages don't need to poll while live updates are on.
 * One query; pushes go to recently active members only (relayed hub to hub: src/lib/fanout.ts).
 */
export async function publishGroup(groupId: string) {
  const members = await prisma.groupMembership.findMany({
    where: { groupId, user: { lastSeenAt: { gt: new Date(Date.now() - 15 * 60_000) } } },
    select: { userId: true },
    take: 1000,
  });
  publish(members.map((m) => m.userId), { type: 'refresh', keys: [`/api/groups/${groupId}*`, '/api/groups/activity*'] });
}
