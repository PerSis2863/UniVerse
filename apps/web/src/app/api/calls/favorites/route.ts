import prisma from '@/lib/db';
import { isOnline } from '@/lib/chat';
import { route } from '@/server/assignments';
import { BadRequestException } from '@/server/http';

// Favourite people (Calls): one-tap voice and video calls, and they still ring you in Focus.
// GET: my favourites. POST { userId }: add. DELETE ?userId=: remove.

export const GET = (req: Request) =>
  route(req, async (user) => {
    const favs = await prisma.favoritePerson.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, take: 12, select: { favoriteId: true } });
    if (!favs.length) return [];
    const people = await prisma.user.findMany({ where: { id: { in: favs.map((f) => f.favoriteId) } }, select: { id: true, name: true, avatar: true, lastSeenAt: true, presence: true } });
    return favs.map((f) => people.find((p) => p.id === f.favoriteId)).filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, online: isOnline(p.lastSeenAt, p.presence) }));
  });

export const POST = (req: Request) =>
  route(req, async (user) => {
    const b = await req.json().catch(() => ({}));
    const id = typeof b.userId === 'string' ? b.userId : '';
    if (!id || id === user.id || !(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) throw new BadRequestException('Choose someone to add.');
    if ((await prisma.favoritePerson.count({ where: { userId: user.id } })) >= 12) throw new BadRequestException('You can have up to 12 favourites.');
    await prisma.favoritePerson.upsert({ where: { userId_favoriteId: { userId: user.id, favoriteId: id } }, create: { userId: user.id, favoriteId: id }, update: {} });
    return { ok: true };
  });

export const DELETE = (req: Request) =>
  route(req, async (user) => {
    const id = new URL(req.url).searchParams.get('userId') ?? '';
    await prisma.favoritePerson.deleteMany({ where: { userId: user.id, favoriteId: id } });
    return { ok: true };
  });
