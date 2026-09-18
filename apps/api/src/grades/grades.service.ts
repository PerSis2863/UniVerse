import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GradesService {
  constructor(private prisma: PrismaService) {}

  async getStudentGrades(studentId: string) {
    const grades = await this.prisma.grade.findMany({
      where: { studentId },
      include: {
        course: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const summary = await this.prisma.grade.groupBy({
      by: ['courseId'],
      where: { studentId },
      _sum: { score: true, maxScore: true },
    });

    return { grades, summary };
  }

  async getCourseGrades(courseId: string) {
    // Get all students enrolled
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      include: { student: true }
    });

    // Get all grades for this course
    const grades = await this.prisma.grade.findMany({
      where: { courseId },
      include: { student: true }
    });

    return { enrollments, grades };
  }

  async postGrade(courseId: string, studentId: string, assignmentName: string, score: number, maxScore: number = 100) {
    return this.prisma.grade.create({
      data: {
        studentId,
        courseId,
        assignmentName,
        score,
        maxScore,
        status: 'GRADED',
      }
    });
  }
}
