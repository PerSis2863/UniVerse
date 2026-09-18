import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async getStudentAttendance(studentId: string) {
    const attendanceRecords = await this.prisma.attendance.findMany({
      where: { studentId },
      include: {
        course: true,
      },
      orderBy: { date: 'desc' },
    });

    const summary = await this.prisma.attendance.groupBy({
      by: ['courseId', 'status'],
      where: { studentId },
      _count: { status: true },
    });

    return { records: attendanceRecords, summary };
  }

  async getCourseAttendance(courseId: string, date: string) {
    const targetDate = new Date(date);
    
    // Get all students enrolled in the course
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      include: { student: true }
    });

    // Get attendance for the specific date
    const attendance = await this.prisma.attendance.findMany({
      where: {
        courseId,
        date: targetDate
      }
    });

    return { enrollments, attendance };
  }

  async markAttendance(courseId: string, date: string, studentId: string, status: any) {
    const targetDate = new Date(date);
    
    return this.prisma.attendance.upsert({
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
