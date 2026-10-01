
import prisma from '@/lib/db';

export class ScholarshipsService {
  findAll() { return prisma.scholarship.findMany({ where: { isActive: true }, include: { _count: { select: { applications: true } } } }); }
  /** Admin view: every scholarship (open or closed) with its applicants' details. */
  findAllForAdmin() {
    return prisma.scholarship.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        _count: { select: { applications: true } },
        applications: {
          orderBy: { appliedAt: 'desc' },
          take: 200,
          select: {
            id: true, status: true, appliedAt: true, updatedAt: true,
            student: {
              select: {
                id: true, name: true, email: true, role: true, status: true, phone: true,
                studentProfile: { select: { department: true, year: true, gpa: true } },
              },
            },
          },
        },
      },
    });
  }
  apply(scholarshipId: string, studentId: string, data: any) {
    return prisma.scholarshipApplication.upsert({ where: { scholarshipId_studentId: { scholarshipId, studentId } }, create: { essay: typeof data?.essay === 'string' ? data.essay.slice(0, 5000) : undefined, scholarshipId, studentId }, update: { essay: typeof data?.essay === 'string' ? data.essay.slice(0, 5000) : undefined } });
  }
  getMyApplications(studentId: string) { return prisma.scholarshipApplication.findMany({ where: { studentId }, include: { scholarship: true } }); }
  create(data: any) { return prisma.scholarship.create({ data }); }
  updateApplication(id: string, data: any) { return prisma.scholarshipApplication.update({ where: { id }, data }); }
}
