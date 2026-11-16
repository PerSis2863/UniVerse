import prisma from '@/lib/db';

/** A one-to-one chat between two people (made if needed): not a group, a parent–teacher, private or community chat.
 *  `app` (M179): the app it belongs to when a person starts it from one (M207: the Travel board); null is UniVersity. */
export async function directChat(a: string, b: string, app: string | null = null) {
  const found = await prisma.conversation.findFirst({
    where: { isGroup: false, aboutStudentId: null, private: false, communityId: null, app, AND: [{ participants: { some: { userId: a } } }, { participants: { some: { userId: b } } }] },
    select: { id: true },
  });
  if (found) return found.id;
  return (await prisma.conversation.create({ data: { createdById: a, app, participants: { create: [{ userId: a }, { userId: b }] } }, select: { id: true } })).id;
}
