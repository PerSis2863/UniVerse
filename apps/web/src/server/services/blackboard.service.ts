import { ForbiddenException, NotFoundException } from '../http';
import prisma from '@/lib/db';

export class BlackboardService {
  async getBlackboardData(courseId: string, studentId: string, role?: string) {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true } });
    if (!course) throw new NotFoundException('Course not found');
    if (role !== 'ADMIN' && course.teacherId !== studentId) {
      const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId } } });
      if (!enrolled) throw new ForbiddenException('You are not enrolled in this course');
    }
    const [
      announcements,
      resources,
      research,
      assignments,
      quizSubmissions,
      calendarEvents,
    ] = await Promise.all([
      prisma.announcement.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } } }),
      prisma.material.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' } }),
      prisma.knowledgeHubResource.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' } }),
      prisma.grade.findMany({ where: { courseId, studentId }, orderBy: { createdAt: 'desc' } }),
      prisma.quizSubmission.findMany({ 
        where: { studentId, quiz: { courseId } }, 
        include: { quiz: { select: { title: true, _count: { select: { questions: true } } } } },
        orderBy: { submittedAt: 'desc' } 
      }),
      prisma.calendarEvent.findMany({ where: { courseId }, orderBy: { startAt: 'asc' } }),
    ]);

    return {
      announcements,
      resources,
      research,
      assignments,
      quizResults: quizSubmissions,
      calendarEvents,
      // mock data for things that don't exist yet
      discussion: [],
      activity: [],
      goals: []
    };
  }
}
