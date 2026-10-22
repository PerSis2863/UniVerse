import { BadRequestException, NotFoundException } from '../http';
import { peopleWhere } from '../school-scope';

import prisma from '@/lib/db';
import type { Prisma, User } from '@prisma/client';
import { pick } from '../pick';
import { oneOf, type Body } from '../body';

type NewScholarship = Prisma.ScholarshipCreateInput;
const SCHOLARSHIP_FIELDS = ['name', 'description', 'amount', 'currency', 'provider', 'deadline', 'requirements', 'isActive'] as const satisfies readonly (keyof NewScholarship)[];

export class ScholarshipsService {
  findAll() { return prisma.scholarship.findMany({ where: { isActive: true }, include: { _count: { select: { applications: true } } } }); }
  /** Admin view: every scholarship (open or closed) with its applicants' details, only the admin's own school's applicants. */
  async findAllForAdmin(admin: User) {
    const mine = { student: await peopleWhere(admin) };
    return prisma.scholarship.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        _count: { select: { applications: { where: mine } } },
        applications: {
          where: mine,
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
  apply(scholarshipId: string, studentId: string, data: Body) {
    const essay = typeof data.essay === 'string' ? data.essay.slice(0, 5000) : undefined;
    return prisma.scholarshipApplication.upsert({ where: { scholarshipId_studentId: { scholarshipId, studentId } }, create: { essay, scholarshipId, studentId }, update: { essay } });
  }
  getMyApplications(studentId: string) { return prisma.scholarshipApplication.findMany({ where: { studentId }, include: { scholarship: true } }); }
  /** Only the scholarship's own fields (this used to pass the whole request body to the database). */
  create(data: Body) { return prisma.scholarship.create({ data: pick<NewScholarship>(data, SCHOLARSHIP_FIELDS) as NewScholarship }); }
  /** Admins decide an application of their own school's student: its status is the only thing they set. */
  async updateApplication(id: string, data: Body, admin: User) {
    if (!oneOf(['PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const, data.status)) throw new BadRequestException('Invalid status');
    const found = await prisma.scholarshipApplication.findFirst({ where: { id, student: await peopleWhere(admin) }, select: { id: true } });
    if (!found) throw new NotFoundException('Application not found');
    return prisma.scholarshipApplication.update({ where: { id }, data: { status: data.status } });
  }
}
