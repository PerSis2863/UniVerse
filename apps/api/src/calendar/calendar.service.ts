import { Injectable, NotFoundException } from '@nestjs/common';
import { pick } from '../common/pick';

const FIELDS = ['title', 'description', 'startAt', 'endAt', 'color', 'type', 'courseId'] as const;
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}
  getMyEvents(userId: string) { return this.prisma.calendarEvent.findMany({ where: { userId }, include: { course: { select: { id: true, name: true, color: true } } }, orderBy: { startAt: 'asc' } }); }
  create(userId: string, data: any) { return this.prisma.calendarEvent.create({ data: { ...(pick(data, FIELDS) as any), userId } }); }
  async update(id: string, userId: string, data: any) {
    const res = await this.prisma.calendarEvent.updateMany({ where: { id, userId }, data: pick(data, FIELDS) });
    if (!res.count) throw new NotFoundException();
    return this.prisma.calendarEvent.findUnique({ where: { id } });
  }
  async remove(id: string, userId: string) {
    const res = await this.prisma.calendarEvent.deleteMany({ where: { id, userId } });
    if (!res.count) throw new NotFoundException();
    return { ok: true };
  }
}
