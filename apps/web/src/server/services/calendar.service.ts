import { NotFoundException } from '../http';
import { pick } from '../pick';

const FIELDS = ['title', 'description', 'startAt', 'endAt', 'color', 'type', 'courseId'] as const;
import prisma from '@/lib/db';

export class CalendarService {
  getMyEvents(userId: string) { return prisma.calendarEvent.findMany({ where: { userId }, include: { course: { select: { id: true, name: true, color: true } } }, orderBy: { startAt: 'asc' } }); }
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
