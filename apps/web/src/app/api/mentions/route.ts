import prisma from '@/lib/db';
import { route } from '@/server/assignments';
import { whiteboardPeople } from '@/server/board-extras';
import { docPeople } from '@/server/docs';
import { BadRequestException } from '@/server/http';
import { boardPeople } from '@/server/tasks';

// GET ?kind=doc|tasks|board&id=: who can be @mentioned there (Stage 4 · 3.9 autocomplete), i.e.
// the people who can see it, by name. Never includes me.
export const GET = (req: Request) =>
  route(req, async (user) => {
    const u = new URL(req.url);
    const kind = u.searchParams.get('kind'), id = u.searchParams.get('id') ?? '';
    const ids = kind === 'doc' ? await docPeople(id, user) : kind === 'tasks' ? await boardPeople(id, user) : kind === 'board' ? await whiteboardPeople(id, user) : null;
    if (!ids) throw new BadRequestException('Unknown kind.');
    const people = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)].filter((x) => x !== user.id).slice(0, 300) }, status: { not: 'SUSPENDED' } }, select: { id: true, name: true, avatar: true }, orderBy: { name: 'asc' } });
    return { people };
  });
