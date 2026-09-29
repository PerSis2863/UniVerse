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

    // Get attendance for the specific date
    const attendance = await prisma.attendance.findMany({
      where: {
        courseId,
        date: targetDate
      }
    });

    return { enrollments, attendance };
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
