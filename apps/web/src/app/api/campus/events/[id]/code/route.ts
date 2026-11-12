import prisma from '@/lib/db';
import { route } from '@/server/assignments';
import { checkinCode } from '@/server/campus-life';
import { ForbiddenException, NotFoundException } from '@/server/http';
import { campusOf } from '@/server/school-scope';

// GET (admin): the check-in code for the next 30 seconds. Signed, never stored. Only for an event
// of their own school (M130: another school's event looks not found).
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Only admins can show the check-in code.');
    const { id } = await params;
    const item = await prisma.campusItem.findFirst({ where: { AND: [await campusOf(user)], id, kind: 'EVENT' }, select: { id: true } });
    if (!item) throw new NotFoundException('Event not found');
    return checkinCode(id);
  });
