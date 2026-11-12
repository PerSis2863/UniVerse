import prisma from '@/lib/db';
import { route } from '@/server/assignments';
import { checkinCode } from '@/server/campus-life';
import { ForbiddenException, NotFoundException } from '@/server/http';
import { madeInSchool } from '@/server/school-scope';

// GET (admin): the check-in code for the next 30 seconds. Signed, never stored. Only for an event
// their own school's people added (M129: another school's event looks not found).
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Only admins can show the check-in code.');
    const { id } = await params;
    const item = await prisma.campusItem.findUnique({ where: { id }, select: { createdById: true } });
    if (!item || !(await madeInSchool(user, item.createdById))) throw new NotFoundException('Event not found');
    return checkinCode(id);
  });
