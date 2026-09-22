import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BlackboardService {
  constructor(private prisma: PrismaService) {}

  async getBlackboardData(courseId: string, studentId: string) {
    const [
      announcements,
      resources,
      research,
      assignments,
      quizSubmissions,
      calendarEvents,
    ] = await Promise.all([
      this.prisma.announcement.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } } }),
      this.prisma.material.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.knowledgeHubResource.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.grade.findMany({ where: { courseId, studentId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.quizSubmission.findMany({ 
        where: { studentId, quiz: { courseId } }, 
        include: { quiz: { select: { title: true, _count: { select: { questions: true } } } } },
        orderBy: { submittedAt: 'desc' } 
      }),
      this.prisma.calendarEvent.findMany({ where: { OR: [{ userId: studentId }, { courseId }] }, orderBy: { startAt: 'asc' } }),
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
