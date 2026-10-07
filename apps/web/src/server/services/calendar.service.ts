import { NotFoundException } from '../http';
import type { Prisma } from '@prisma/client';
import { pick } from '../pick';
import type { Body } from '../body';

type NewEvent = Prisma.CalendarEventUncheckedCreateInput;
const FIELDS = ['title', 'description', 'startAt', 'endAt', 'color', 'type', 'courseId'] as const satisfies readonly (keyof NewEvent)[];
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
  create(userId: string, data: Body) { return prisma.calendarEvent.create({ data: { ...pick<NewEvent>(data, FIELDS), userId } as NewEvent }); }
  async update(id: string, userId: string, data: Body) {
    const res = await prisma.calendarEvent.updateMany({ where: { id, userId }, data: pick<Prisma.CalendarEventUncheckedUpdateManyInput>(data, FIELDS) });
    if (!res.count) throw new NotFoundException();
    return prisma.calendarEvent.findUnique({ where: { id } });
  }
  async remove(id: string, userId: string) {
    const res = await prisma.calendarEvent.deleteMany({ where: { id, userId } });
    if (!res.count) throw new NotFoundException();
    return { ok: true };
  }
}
