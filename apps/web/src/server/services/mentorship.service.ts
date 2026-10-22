import { BadRequestException, ForbiddenException, NotFoundException } from '../http';
import type { Prisma } from '@prisma/client';
import { pick } from '../pick';
import { oneOf, type Body } from '../body';
import { inSchools, schoolsOf } from '../school-scope';

type Actor = { id: string; role: string; organizationId?: string | null; owner?: boolean };

/** An admin, for a student of their school (school-scope.ts). */
async function adminOf(actor: Actor, studentOrg: string | null | undefined) {
  return actor.role === 'ADMIN' && inSchools(await schoolsOf(actor), studentOrg);
}
import prisma from '@/lib/db';

export class MentorshipService {
  getMyRequests(userId: string, role: string) {
    const where = role === 'TEACHER' ? { teacherId: userId } : { studentId: userId };
    return prisma.mentorshipRequest.findMany({ where, include: { student: { select: { id: true, name: true, avatar: true } }, teacher: { select: { id: true, name: true, avatar: true } }, sessions: true } });
  }

  create(studentId: string, data: Body) {
    type New = Prisma.MentorshipRequestUncheckedCreateInput;
    return prisma.mentorshipRequest.create({ data: { ...pick<New>(data, ['teacherId', 'topic', 'message']), studentId } as New });
  }

  private async requestFor(id: string, actor: Actor) {
    const req = await prisma.mentorshipRequest.findUnique({ where: { id }, select: { studentId: true, teacherId: true, student: { select: { organizationId: true } } } });
    if (!req) throw new NotFoundException();
    const isTeacher = req.teacherId === actor.id;
    const isStudent = req.studentId === actor.id;
    if (isTeacher || isStudent) return { isTeacher, isStudent };
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    // Another school's request looks like it doesn't exist.
    if (!(await adminOf(actor, req.student.organizationId))) throw new NotFoundException();
    return { isTeacher: true, isStudent };
  }

  async updateStatus(id: string, actor: Actor, data: Body) {
    const { isTeacher, isStudent } = await this.requestFor(id, actor);
    const status = data.status;
    // Teachers accept/decline/complete; students can only cancel their own request.
    const allowed = isTeacher ? (['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const) : isStudent ? (['CANCELLED'] as const) : [];
    if (!oneOf(allowed, status)) throw new BadRequestException('Invalid status');
    return prisma.mentorshipRequest.update({ where: { id }, data: { status } });
  }

  async addSession(requestId: string, actor: Actor, data: Body) {
    const { isTeacher } = await this.requestFor(requestId, actor);
    if (!isTeacher) throw new ForbiddenException('Only the mentor can schedule sessions.');
    type New = Prisma.MentorshipSessionUncheckedCreateInput;
    return prisma.mentorshipSession.create({ data: { ...pick<New>(data, ['scheduledAt', 'duration', 'meetingUrl', 'notes', 'isCompleted']), requestId } as New });
  }

  async getSessions(requestId: string, actor: Actor) {
    await this.requestFor(requestId, actor);
    return prisma.mentorshipSession.findMany({ where: { requestId } });
  }

  // ─── PHASE 3: INDUSTRY MENTORS ──────────────────────────────────

  // No emails: anyone signed in can list mentors (they're reached through bookings and chat).
  getIndustryMentors() {
    return prisma.mentorProfile.findMany({
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    });
  }

  createMentorProfile(userId: string, data: Body) {
    const fields = pick<Prisma.MentorProfileUncheckedCreateInput>(data, ['company', 'jobTitle', 'hoursCommitted', 'isAvailable']);
    return prisma.mentorProfile.upsert({
      where: { userId },
      update: fields,
      create: { ...fields, userId },
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

  createBooking(studentId: string, mentorId: string, data: Body) {
    type New = Prisma.MentorshipBookingUncheckedCreateInput;
    return prisma.mentorshipBooking.create({
      data: {
        ...pick<New>(data, ['date', 'time', 'topic']),
        studentId,
        mentorId,
        status: 'PENDING',
      } as New,
    });
  }

  async updateBookingStatus(id: string, actor: Actor, status: string) {
    const booking = await prisma.mentorshipBooking.findUnique({ where: { id }, select: { studentId: true, student: { select: { organizationId: true } }, mentor: { select: { userId: true } } } });
    if (!booking) throw new NotFoundException();
    const isMentor = booking.mentor.userId === actor.id || (await adminOf(actor, booking.student.organizationId));
    // Another school's booking looks like it doesn't exist to an admin.
    if (!isMentor && actor.role === 'ADMIN' && booking.studentId !== actor.id) throw new NotFoundException();
    const allowed = isMentor ? ['PENDING', 'CONFIRMED', 'DECLINED', 'COMPLETED', 'CANCELLED'] : booking.studentId === actor.id ? ['CANCELLED'] : [];
    if (!allowed.includes(status)) throw new ForbiddenException();
    return prisma.mentorshipBooking.update({
      where: { id },
      data: { status },
    });
  }
}
