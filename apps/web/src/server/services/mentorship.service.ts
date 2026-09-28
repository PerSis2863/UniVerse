import { BadRequestException, ForbiddenException, NotFoundException } from '../http';
import { pick } from '../pick';

type Actor = { id: string; role: string };
import prisma from '@/lib/db';

export class MentorshipService {
  getMyRequests(userId: string, role: string) {
    const where = role === 'TEACHER' ? { teacherId: userId } : { studentId: userId };
    return prisma.mentorshipRequest.findMany({ where, include: { student: { select: { id: true, name: true, avatar: true } }, teacher: { select: { id: true, name: true, avatar: true } }, sessions: true } });
  }

  create(studentId: string, data: any) { return prisma.mentorshipRequest.create({ data: { ...(pick(data, ['teacherId', 'topic', 'message'] as const) as any), studentId } }); }

  private async requestFor(id: string, actor: Actor) {
    const req = await prisma.mentorshipRequest.findUnique({ where: { id }, select: { studentId: true, teacherId: true } });
    if (!req) throw new NotFoundException();
    const isTeacher = req.teacherId === actor.id;
    const isStudent = req.studentId === actor.id;
    if (!isTeacher && !isStudent && actor.role !== 'ADMIN') throw new ForbiddenException();
    return { isTeacher: isTeacher || actor.role === 'ADMIN', isStudent };
  }

  async updateStatus(id: string, actor: Actor, data: any) {
    const { isTeacher, isStudent } = await this.requestFor(id, actor);
    const status = data?.status;
    // Teachers accept/decline/complete; students can only cancel their own request.
    const allowed = isTeacher ? ['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'] : isStudent ? ['CANCELLED'] : [];
    if (!allowed.includes(status)) throw new BadRequestException('Invalid status');
    return prisma.mentorshipRequest.update({ where: { id }, data: { status } });
  }

  async addSession(requestId: string, actor: Actor, data: any) {
    const { isTeacher } = await this.requestFor(requestId, actor);
    if (!isTeacher) throw new ForbiddenException('Only the mentor can schedule sessions.');
    return prisma.mentorshipSession.create({ data: { ...(pick(data, ['scheduledAt', 'duration', 'meetingUrl', 'notes', 'isCompleted'] as const) as any), requestId } });
  }

  async getSessions(requestId: string, actor: Actor) {
    await this.requestFor(requestId, actor);
    return prisma.mentorshipSession.findMany({ where: { requestId } });
  }

  // ─── PHASE 3: INDUSTRY MENTORS ──────────────────────────────────

  getIndustryMentors() {
    return prisma.mentorProfile.findMany({
      include: {
        user: { select: { id: true, name: true, avatar: true, email: true } },
      },
    });
  }

  createMentorProfile(userId: string, data: any) {
    return prisma.mentorProfile.upsert({
      where: { userId },
      update: pick(data, ['company', 'jobTitle', 'hoursCommitted', 'isAvailable'] as const),
      create: { ...pick(data, ['company', 'jobTitle', 'hoursCommitted', 'isAvailable'] as const), userId },
    });
  }

  getBookings(userId: string, role: string) {
    if (role === 'MENTOR' || role === 'TEACHER') { // Assuming teachers can also be mentors
      return prisma.mentorshipBooking.findMany({
        where: { mentor: { userId } },
        include: {
          student: { select: { id: true, name: true, email: true, avatar: true } },
          mentor: { include: { user: { select: { name: true } } } },
        },
      });
    }
    return prisma.mentorshipBooking.findMany({
      where: { studentId: userId },
      include: {
        mentor: { include: { user: { select: { name: true, avatar: true, email: true } } } },
      },
    });
  }

  createBooking(studentId: string, mentorId: string, data: any) {
    return prisma.mentorshipBooking.create({
      data: {
        ...(pick(data, ['date', 'time', 'topic'] as const) as any),
        studentId,
        mentorId,
        status: 'PENDING',
      },
    });
  }

  async updateBookingStatus(id: string, actor: Actor, status: string) {
    const booking = await prisma.mentorshipBooking.findUnique({ where: { id }, select: { studentId: true, mentor: { select: { userId: true } } } });
    if (!booking) throw new NotFoundException();
    const isMentor = booking.mentor.userId === actor.id || actor.role === 'ADMIN';
    const allowed = isMentor ? ['PENDING', 'CONFIRMED', 'DECLINED', 'COMPLETED', 'CANCELLED'] : booking.studentId === actor.id ? ['CANCELLED'] : [];
    if (!allowed.includes(status)) throw new ForbiddenException();
    return prisma.mentorshipBooking.update({
      where: { id },
      data: { status },
    });
  }
}
