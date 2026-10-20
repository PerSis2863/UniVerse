import prisma from '@/lib/db';

/** A one-to-one chat between two people (made if needed): not a group, a parent–teacher, private or community chat. */
export async function directChat(a: string, b: string) {
  const found = await prisma.conversation.findFirst({
    where: { isGroup: false, aboutStudentId: null, private: false, communityId: null, AND: [{ participants: { some: { userId: a } } }, { participants: { some: { userId: b } } }] },
    select: { id: true },
  });
  if (found) return found.id;
  return (await prisma.conversation.create({ data: { createdById: a, participants: { create: [{ userId: a }, { userId: b }] } }, select: { id: true } })).id;
}
