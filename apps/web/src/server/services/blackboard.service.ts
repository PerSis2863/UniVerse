import { ForbiddenException, NotFoundException } from '../http';
import prisma from '@/lib/db';
import { teaches } from '@/lib/course-access';
import { inSchools, schoolsOf } from '../school-scope';

export class BlackboardService {
  async getBlackboardData(courseId: string, user: { id: string; role: string; organizationId?: string | null; owner?: boolean }) {
    const studentId = user.id;
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true, teacher: { select: { organizationId: true } } } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.teacherId !== studentId && !(await teaches(courseId, studentId))) {
      // Admins see their school's courses; another school's looks like it doesn't exist (school-scope.ts).
      if (user.role === 'ADMIN') {
        if (!inSchools(await schoolsOf(user), course.teacher?.organizationId)) throw new NotFoundException('Course not found');
      } else {
        const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId } } });
        if (!enrolled) throw new ForbiddenException('You are not enrolled in this course');
      }
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
