import prisma from '@/lib/db';
import { BadRequestException } from '../http';

export class AttendanceService {
  async getStudentAttendance(studentId: string) {
    const attendanceRecords = await prisma.attendance.findMany({
      where: { studentId },
      include: {
        course: true,
      },
      orderBy: { date: 'desc' },
    });

    const summary = await prisma.attendance.groupBy({
      by: ['courseId', 'status'],
      where: { studentId },
      _count: { status: true },
    });

    return { records: attendanceRecords, summary };
  }

  async getCourseAttendance(courseId: string, date: string) {
    const targetDate = new Date(date);
    
    // Get all students enrolled in the course
    const enrollments = await prisma.enrollment.findMany({
      where: { courseId },
      include: { student: { select: { id: true, name: true, email: true, avatar: true } } }
    });

    // Get attendance for the specific date, plus each student's record in this course so far
    // (one grouped query: rows per student and status).
    const [attendance, totals] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          courseId,
          date: targetDate
        }
      }),
      prisma.attendance.groupBy({ by: ['studentId', 'status'], where: { courseId }, _count: { _all: true } }),
    ]);

    const summary: Record<string, Partial<Record<string, number>>> = {};
    for (const t of totals) (summary[t.studentId] ??= {})[t.status] = t._count._all;

    return { enrollments, attendance, summary };
  }

  async markAttendance(courseId: string, date: string, studentId: string, status: any) {
    const targetDate = new Date(date);
    const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId } }, select: { id: true } });
    if (!enrolled) throw new BadRequestException('That student is not enrolled in this course');
    
    return prisma.attendance.upsert({
      where: {
        studentId_courseId_date: {
          studentId,
          courseId,
          date: targetDate,
        }
      },
      update: { status },
      create: {
        studentId,
        courseId,
        date: targetDate,
        status,
      }
    });
  }
}
