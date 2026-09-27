import prisma from '@/lib/db';

export const MAX_POST_LENGTH = 4000;

export const postSelect = {
  id: true,
  body: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, avatar: true } },
} as const;

/** Membership role in a group, or null if the user isn't a member. */
export async function groupRole(groupId: string, userId: string): Promise<string | null> {
  const m = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { role: true },
  });
  return m?.role ?? null;
}
