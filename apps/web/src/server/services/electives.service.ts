import { ForbiddenException, NotFoundException, BadRequestException } from '../http';
import prisma from '@/lib/db';
import { oneOf, str, type Body } from '../body';
import { assertCanJoinCourse, courseWhereFor, studentCampuses } from '../campus-network';

export class ElectivesService {
  async getAvailableElectives(studentId: string) {
    // Return courses that the student hasn't requested or enrolled in
    // In a campus network: their campus's courses and those shared with it (src/server/campus-network.ts).
    const campuses = await studentCampuses(studentId);
    return prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        enrollments: { none: { studentId } },
        electiveRequests: { none: { studentId } },
        AND: [courseWhereFor(campuses)],
      },
      include: {
        teacher: { select: { id: true, name: true } },
      },
    });
  }

  async getMyElectives(studentId: string) {
    return prisma.electiveRequest.findMany({ where: { studentId }, include: { course: { include: { teacher: { select: { id: true, name: true } } } } } });
  }

  async selectElective(studentId: string, data: Body) {
    const courseId = str(data.courseId);
    if (!courseId) throw new BadRequestException('Pick a course.');
    const semesterId = str(data.semesterId) ?? '';
    await assertCanJoinCourse(courseId, studentId);
    return prisma.electiveRequest.upsert({
      where: { studentId_courseId_semesterId: { studentId, courseId, semesterId } },
      create: { courseId, semesterId, note: typeof data.note === 'string' ? data.note.slice(0, 500) : undefined, studentId },
      update: { status: 'PENDING' },
    });
  }

  async withdrawElective(id: string, studentId: string) {
    const res = await prisma.electiveRequest.updateMany({ where: { id, studentId }, data: { status: 'WITHDRAWN' } });
    if (!res.count) throw new NotFoundException();
    return { ok: true };
  }

  async getMyMajorRequests(studentId: string) {
    return prisma.majorChangeRequest.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } });
  }

  async submitMajorRequest(studentId: string, data: Body) {
    const cut = (v: unknown, n: number) => str(v)?.trim().slice(0, n) || undefined;
    const requestType = cut(data.requestType, 40);
    const requestedProgram = cut(data.requestedProgram, 120);
    if (!requestType || !requestedProgram) throw new BadRequestException('Choose the kind of request and the program you want.');
    return prisma.majorChangeRequest.create({
      data: { requestType, currentMajor: cut(data.currentMajor, 120), requestedProgram, reason: cut(data.reason, 2000), studentId },
    });
  }

  async reviewMajorRequest(id: string, reviewer: { id: string; role: string }, data: Body) {
    if (reviewer.role !== 'ADMIN') throw new ForbiddenException('Only admins can review major change requests.');
    // "APPROVED" is what this endpoint used to ask for; the status column calls it ACCEPTED.
    const status = data.status === 'APPROVED' ? 'ACCEPTED' : data.status;
    if (!oneOf(['PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED'] as const, status)) throw new BadRequestException('Invalid status');
    return prisma.majorChangeRequest.update({
      where: { id },
      data: { status, reviewNote: typeof data.reviewNote === 'string' ? data.reviewNote.slice(0, 1000) : undefined, reviewedById: reviewer.id },
    });
  }
}
