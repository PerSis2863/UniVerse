import prisma from '@/lib/db';
import { route } from '@/server/assignments';
import { ForbiddenException } from '@/server/http';

// GET (admin or teacher): active NGO projects to attach shifts to.
export const GET = (req: Request) => route(req, async (user) => {
  if (user.role !== 'ADMIN' && user.role !== 'TEACHER') throw new ForbiddenException('Only admins and teachers can run shifts.');
  return prisma.nGOProject.findMany({ where: { isActive: true }, select: { id: true, name: true, ngo: { select: { name: true } } }, orderBy: { name: 'asc' }, take: 300 });
});
