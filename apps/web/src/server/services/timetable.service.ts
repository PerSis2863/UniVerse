
import prisma from '@/lib/db';

export class TimetableService {
  async findByCourse(courseId: string) {
    return prisma.timetableSlot.findMany({ where: { courseId }, include: { room: true } });
  }

  async findForUser(userId: string) {
    const enrollments = await prisma.enrollment.findMany({ where: { studentId: userId }, select: { courseId: true } });
    const taughtCourses = await prisma.course.findMany({ where: { teacherId: userId }, select: { id: true } });
    const courseIds = [...enrollments.map(e => e.courseId), ...taughtCourses.map(c => c.id)];
    return prisma.timetableSlot.findMany({ where: { courseId: { in: courseIds } }, include: { course: { select: { id: true, name: true, code: true, color: true, emoji: true } }, room: true } });
  }

  async create(data: any) {
    return prisma.timetableSlot.create({ data });
  }

  async update(id: string, data: any) {
    return prisma.timetableSlot.update({ where: { id }, data });
  }

  async remove(id: string) {
    return prisma.timetableSlot.delete({ where: { id } });
  }
}
