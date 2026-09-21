import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TimetableService {
  constructor(private prisma: PrismaService) {}

  async findByCourse(courseId: string) {
    return this.prisma.timetableSlot.findMany({ where: { courseId }, include: { room: true } });
  }

  async findForUser(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({ where: { studentId: userId }, select: { courseId: true } });
    const taughtCourses = await this.prisma.course.findMany({ where: { teacherId: userId }, select: { id: true } });
    const courseIds = [...enrollments.map(e => e.courseId), ...taughtCourses.map(c => c.id)];
    return this.prisma.timetableSlot.findMany({ where: { courseId: { in: courseIds } }, include: { course: { select: { id: true, name: true, code: true, color: true, emoji: true } }, room: true } });
  }

  async create(data: any) {
    return this.prisma.timetableSlot.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.timetableSlot.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.timetableSlot.delete({ where: { id } });
  }
}
