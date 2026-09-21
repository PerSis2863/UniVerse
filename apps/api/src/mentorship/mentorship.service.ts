import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MentorshipService {
  constructor(private prisma: PrismaService) {}

  getMyRequests(userId: string, role: string) {
    const where = role === 'TEACHER' ? { teacherId: userId } : { studentId: userId };
    return this.prisma.mentorshipRequest.findMany({ where, include: { student: { select: { id: true, name: true, avatar: true } }, teacher: { select: { id: true, name: true, avatar: true } }, sessions: true } });
  }

  create(studentId: string, data: any) { return this.prisma.mentorshipRequest.create({ data: { studentId, ...data } }); }

  updateStatus(id: string, data: any) { return this.prisma.mentorshipRequest.update({ where: { id }, data }); }

  addSession(requestId: string, data: any) { return this.prisma.mentorshipSession.create({ data: { requestId, ...data } }); }

  getSessions(requestId: string) { return this.prisma.mentorshipSession.findMany({ where: { requestId } }); }

  // ─── PHASE 3: INDUSTRY MENTORS ──────────────────────────────────

  getIndustryMentors() {
    return this.prisma.mentorProfile.findMany({
      include: {
        user: { select: { id: true, name: true, avatar: true, email: true } },
      },
    });
  }

  createMentorProfile(userId: string, data: any) {
    return this.prisma.mentorProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  getBookings(userId: string, role: string) {
    if (role === 'MENTOR' || role === 'TEACHER') { // Assuming teachers can also be mentors
      return this.prisma.mentorshipBooking.findMany({
        where: { mentor: { userId } },
        include: {
          student: { select: { id: true, name: true, email: true, avatar: true } },
          mentor: { include: { user: { select: { name: true } } } },
        },
      });
    }
    return this.prisma.mentorshipBooking.findMany({
      where: { studentId: userId },
      include: {
        mentor: { include: { user: { select: { name: true, avatar: true, email: true } } } },
      },
    });
  }

  createBooking(studentId: string, mentorId: string, data: any) {
    return this.prisma.mentorshipBooking.create({
      data: {
        studentId,
        mentorId,
        ...data,
      },
    });
  }

  updateBookingStatus(id: string, status: string) {
    return this.prisma.mentorshipBooking.update({
      where: { id },
      data: { status },
    });
  }
}
