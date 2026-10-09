import { BadRequestException, ForbiddenException, NotFoundException } from '../http';
import prisma from '@/lib/db';

export class GradesService {
  async getStudentGrades(studentId: string) {
    const grades = await prisma.grade.findMany({
      where: { studentId },
      include: {
        course: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const courseIds = [...new Set(grades.map((g) => g.courseId))].slice(0, 90);
    const [summary, categories, assessments] = await Promise.all([
      prisma.grade.groupBy({
        by: ['courseId'],
        where: { studentId },
        _sum: { score: true, maxScore: true },
      }),
      // Gradebook categories (Stage 5 · B3.4), so the page shows the same weighted finals as the teacher's.
      courseIds.length ? prisma.gradeCategory.findMany({ where: { courseId: { in: courseIds } }, select: { id: true, courseId: true, name: true, weight: true, dropLowest: true } }) : [],
      courseIds.length ? prisma.gradeAssessment.findMany({ where: { courseId: { in: courseIds } }, select: { courseId: true, name: true, categoryId: true } }) : [],
    ]);

    return { grades, summary, categories, assessments };
  }

  /** Teachers may only see or grade their own courses; admins may see all. */
  private async assertCanGrade(courseId: string, user: { id: string; role: string }) {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true } });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role !== 'ADMIN' && course.teacherId !== user.id) throw new ForbiddenException('You can only manage grades for your own courses');
  }

  async getCourseGrades(courseId: string, user: { id: string; role: string }) {
    await this.assertCanGrade(courseId, user);
    const student = { select: { id: true, name: true, email: true, avatar: true } };
    const [enrollments, grades] = await Promise.all([
      prisma.enrollment.findMany({ where: { courseId }, include: { student } }),
      prisma.grade.findMany({ where: { courseId }, include: { student }, orderBy: { gradedAt: 'desc' } }),
    ]);
    return { enrollments, grades };
  }

  async postGrade(courseId: string, user: { id: string; role: string }, body: { studentId?: unknown; assignmentName?: unknown; score?: unknown; maxScore?: unknown; feedback?: unknown }) {
    await this.assertCanGrade(courseId, user);
    const studentId = typeof body.studentId === 'string' ? body.studentId : '';
    const assignmentName = typeof body.assignmentName === 'string' ? body.assignmentName.trim().slice(0, 200) : '';
    const score = Number(body.score);
    const maxScore = body.maxScore == null ? 100 : Number(body.maxScore);
    if (!assignmentName) throw new BadRequestException('Assignment name is required');
    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 10000) throw new BadRequestException('Max score must be a positive number');
    if (!Number.isFinite(score) || score < 0 || score > maxScore) throw new BadRequestException(`Score must be between 0 and ${maxScore}`);
    const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId } } });
    if (!enrolled) throw new BadRequestException('That student is not enrolled in this course');
    return prisma.grade.create({
      data: {
        studentId, courseId, assignmentName, score, maxScore, status: 'GRADED',
        feedback: typeof body.feedback === 'string' && body.feedback.trim() ? body.feedback.trim().slice(0, 2000) : null,
      },
    });
  }

  async removeGrade(gradeId: string, user: { id: string; role: string }) {
    const grade = await prisma.grade.findUnique({ where: { id: gradeId }, select: { courseId: true } });
    if (!grade) throw new NotFoundException('Grade not found');
    await this.assertCanGrade(grade.courseId, user);
    await prisma.grade.delete({ where: { id: gradeId } });
    return { ok: true };
  }
}
