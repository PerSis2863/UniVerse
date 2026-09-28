import { ForbiddenException, NotFoundException, BadRequestException } from '../http';
import prisma from '@/lib/db';

export class ElectivesService {
  async getAvailableElectives(studentId: string) {
    // Return courses that the student hasn't requested or enrolled in
    return prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        enrollments: { none: { studentId } },
        electiveRequests: { none: { studentId } },
      },
      include: {
        teacher: { select: { id: true, name: true } },
      },
    });
  }

  async getMyElectives(studentId: string) {
    return prisma.electiveRequest.findMany({ where: { studentId }, include: { course: { include: { teacher: { select: { id: true, name: true } } } } } });
  }

  async selectElective(studentId: string, data: any) {
    return prisma.electiveRequest.upsert({
      where: { studentId_courseId_semesterId: { studentId, courseId: data.courseId, semesterId: data.semesterId ?? '' } },
      create: { courseId: data.courseId, semesterId: data.semesterId ?? '', note: typeof data.note === 'string' ? data.note.slice(0, 500) : undefined, studentId },
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

  async submitMajorRequest(studentId: string, data: any) {
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);
    return prisma.majorChangeRequest.create({
      data: { requestType: str(data.requestType, 40) as any, currentMajor: str(data.currentMajor, 120), requestedProgram: str(data.requestedProgram, 120) as any, reason: str(data.reason, 2000), studentId },
    });
  }

  async reviewMajorRequest(id: string, reviewer: { id: string; role: string }, data: any) {
    if (reviewer.role !== 'ADMIN') throw new ForbiddenException('Only admins can review major change requests.');
    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(data?.status)) throw new BadRequestException('Invalid status');
    return prisma.majorChangeRequest.update({
      where: { id },
      data: { status: data.status, reviewNote: typeof data.reviewNote === 'string' ? data.reviewNote.slice(0, 1000) : undefined, reviewedById: reviewer.id },
    });
  }
}
