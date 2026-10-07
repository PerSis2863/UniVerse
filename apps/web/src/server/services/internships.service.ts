import { BadRequestException, ForbiddenException, NotFoundException } from '../http';
import type { Prisma } from '@prisma/client';
import { pick } from '../pick';
import { first, oneOf, str, type Body, type Query } from '../body';
import prisma from '@/lib/db';

export class InternshipsService {
  async findAll(query: Query) {
    const search = first(query.search);
    const type = first(query.type);
    return prisma.internship.findMany({
      where: {
        isActive: true,
        ...(search && { OR: [{ title: { contains: search } }, { description: { contains: search } }] }),
        ...(type && { type: type as Prisma.InternshipWhereInput['type'] }),
      },
      include: { company: true, _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin view: every internship (active or not) with who posted it and every applicant's details. */
  findAllForAdmin() {
    return prisma.internship.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        company: { select: { id: true, name: true } },
        postedBy: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { applications: true } },
        applications: {
          orderBy: { appliedAt: 'desc' },
          take: 200,
          select: {
            id: true, status: true, appliedAt: true, cvUrl: true,
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

  async findOne(id: string, user: { id: string; role: string }) {
    const item = await prisma.internship.findUnique({ where: { id }, include: { company: true } });
    if (!item) throw new NotFoundException();
    // Applicant details are only visible to admins and whoever posted the internship.
    if (user.role === 'ADMIN' || item.postedById === user.id) {
      const applications = await prisma.internshipApplication.findMany({
        where: { internshipId: id },
        include: { student: { select: { id: true, name: true, email: true, avatar: true } } },
      });
      return { ...item, applications };
    }
    return item;
  }

  private async assertCanManage(internshipId: string, user: { id: string; role: string }) {
    const item = await prisma.internship.findUnique({ where: { id: internshipId }, select: { postedById: true } });
    if (!item) throw new NotFoundException();
    if (user.role !== 'ADMIN' && item.postedById !== user.id) throw new ForbiddenException('Only the poster or an admin can do this.');
  }

  async apply(internshipId: string, studentId: string, body: Body) {
    // Applicants can only submit their cover letter and CV; status is set by reviewers.
    const data = pick<Prisma.InternshipApplicationUncheckedCreateInput>(body, ['coverLetter', 'cvUrl']);
    return prisma.internshipApplication.upsert({
      where: { internshipId_studentId: { internshipId, studentId } },
      create: { ...data, internshipId, studentId },
      update: data,
    });
  }

  async getMyApplications(studentId: string) {
    return prisma.internshipApplication.findMany({ where: { studentId }, include: { internship: { include: { company: true } } } });
  }

  async updateApplication(id: string, data: Body, user: { id: string; role: string }) {
    const app = await prisma.internshipApplication.findUnique({ where: { id }, select: { internshipId: true, studentId: true } });
    if (!app) throw new NotFoundException();

    // Applicants can edit their cover letter / CV and withdraw; nothing else.
    if (app.studentId === user.id && user.role !== 'ADMIN') {
      if (data.status !== undefined && data.status !== 'WITHDRAWN') throw new ForbiddenException('You can only withdraw your application.');
      return prisma.internshipApplication.update({
        where: { id },
        data: { ...pick<Prisma.InternshipApplicationUncheckedUpdateInput>(data, ['coverLetter', 'cvUrl']), ...(data.status === 'WITHDRAWN' ? { status: 'WITHDRAWN' as const } : {}) },
      });
    }

    // Reviewers (poster or admin) set the status.
    await this.assertCanManage(app.internshipId, user);
    const allowed = ['PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED'] as const;
    const status = data.status;
    if (!oneOf(allowed, status)) throw new BadRequestException('Invalid status');
    return prisma.internshipApplication.update({ where: { id }, data: { status } });
  }

  private async getOrCreateCompany(companyName: string | undefined) {
    if (!companyName) return null;
    let company = await prisma.company.findFirst({
      where: { name: { equals: companyName } }
    });
    if (!company) {
      company = await prisma.company.create({
        data: { name: companyName }
      });
    }
    return company.id;
  }

  private static FIELDS = ['title', 'description', 'type', 'location', 'duration', 'isPaid', 'salary', 'openings', 'deadline', 'startDate', 'isActive'] as const satisfies readonly (keyof Prisma.InternshipUncheckedCreateInput)[];

  async create(userId: string, data: Body) {
    type New = Prisma.InternshipUncheckedCreateInput;
    const companyId = await this.getOrCreateCompany(str(data.company));
    return prisma.internship.create({
      data: {
        ...pick<New>(data, InternshipsService.FIELDS),
        companyId: companyId as string,
        postedById: userId,
      } as New,
    });
  }

  async update(id: string, data: Body, user: { id: string; role: string }) {
    await this.assertCanManage(id, user);
    const company = str(data.company);
    const updateData = pick<Prisma.InternshipUncheckedUpdateInput>(data, InternshipsService.FIELDS);
    if (company) {
      updateData.companyId = await this.getOrCreateCompany(company);
    }
    return prisma.internship.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string, user: { id: string; role: string }) {
    await this.assertCanManage(id, user);
    return prisma.internship.delete({
      where: { id }
    });
  }
}
