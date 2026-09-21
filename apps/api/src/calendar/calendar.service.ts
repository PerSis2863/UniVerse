import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}
  getMyEvents(userId: string) { return this.prisma.calendarEvent.findMany({ where: { userId }, include: { course: { select: { id: true, name: true, color: true } } }, orderBy: { startAt: 'asc' } }); }
  create(userId: string, data: any) { return this.prisma.calendarEvent.create({ data: { userId, ...data } }); }
  update(id: string, data: any) { return this.prisma.calendarEvent.update({ where: { id }, data }); }
  remove(id: string) { return this.prisma.calendarEvent.delete({ where: { id } }); }
}
