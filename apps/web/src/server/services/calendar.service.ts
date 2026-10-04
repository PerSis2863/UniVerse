import { NotFoundException } from '../http';
import { pick } from '../pick';

const FIELDS = ['title', 'description', 'startAt', 'endAt', 'color', 'type', 'courseId'] as const;
import prisma from '@/lib/db';

export class CalendarService {
  /** My own events plus my classes' events (exams, scheduled class calls), from a month back. */
  getMyEvents(userId: string) {
    return prisma.calendarEvent.findMany({
      where: { endAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, OR: [{ userId }, { course: { enrollments: { some: { studentId: userId } } } }] },
      include: { course: { select: { id: true, name: true, color: true } } },
      orderBy: { startAt: 'asc' },
      take: 400,
    });
  }
  create(userId: string, data: any) { return prisma.calendarEvent.create({ data: { ...(pick(data, FIELDS) as any), userId } }); }
  async update(id: string, userId: string, data: any) {
    const res = await prisma.calendarEvent.updateMany({ where: { id, userId }, data: pick(data, FIELDS) });
    if (!res.count) throw new NotFoundException();
    return prisma.calendarEvent.findUnique({ where: { id } });
  }
  async remove(id: string, userId: string) {
    const res = await prisma.calendarEvent.deleteMany({ where: { id, userId } });
    if (!res.count) throw new NotFoundException();
    return { ok: true };
  }
}
