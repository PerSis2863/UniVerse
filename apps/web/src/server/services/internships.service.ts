import { BadRequestException, ForbiddenException, NotFoundException } from '../http';
import { pick } from '../pick';
import prisma from '@/lib/db';

export class InternshipsService {
  async findAll(query: any) {
    return prisma.internship.findMany({
      where: {
        isActive: true,
        ...(query.search && { OR: [{ title: { contains: query.search } }, { description: { contains: query.search } }] }),
        ...(query.type && { type: query.type }),
      },
      include: { company: true, _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' },
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

  async apply(internshipId: string, studentId: string, body: any) {
    // Applicants can only submit their cover letter and CV; status is set by reviewers.
    const data = pick(body, ['coverLetter', 'cvUrl'] as const);
    return prisma.internshipApplication.upsert({
      where: { internshipId_studentId: { internshipId, studentId } },
      create: { ...data, internshipId, studentId },
      update: data,
    });
  }

  async getMyApplications(studentId: string) {
    return prisma.internshipApplication.findMany({ where: { studentId }, include: { internship: { include: { company: true } } } });
  }

  async updateApplication(id: string, data: any, user: { id: string; role: string }) {
    const app = await prisma.internshipApplication.findUnique({ where: { id }, select: { internshipId: true, studentId: true } });
    if (!app) throw new NotFoundException();

    // Applicants can edit their cover letter / CV and withdraw; nothing else.
    if (app.studentId === user.id && user.role !== 'ADMIN') {
      if (data?.status !== undefined && data.status !== 'WITHDRAWN') throw new ForbiddenException('You can only withdraw your application.');
      return prisma.internshipApplication.update({
        where: { id },
        data: { ...pick(data, ['coverLetter', 'cvUrl'] as const), ...(data?.status === 'WITHDRAWN' ? { status: 'WITHDRAWN' as const } : {}) },
      });
    }

    // Reviewers (poster or admin) set the status.
    await this.assertCanManage(app.internshipId, user);
    const allowed = ['PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED'];
    if (!allowed.includes(data?.status)) throw new BadRequestException('Invalid status');
    return prisma.internshipApplication.update({ where: { id }, data: { status: data.status } });
  }

  private async getOrCreateCompany(companyName: string) {
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

  private static FIELDS = ['title', 'description', 'type', 'location', 'duration', 'isPaid', 'salary', 'openings', 'deadline', 'startDate', 'isActive'] as const;

  async create(userId: string, data: any) {
    const company = data?.company;
    const rest = pick(data, InternshipsService.FIELDS);
    const companyId = await this.getOrCreateCompany(company);
    return prisma.internship.create({
      data: {
        ...(rest as any),
        companyId: companyId as string,
        postedById: userId,
      }
    });
  }

  async update(id: string, data: any, user: { id: string; role: string }) {
    await this.assertCanManage(id, user);
    const company = data?.company;
    const updateData: any = pick(data, InternshipsService.FIELDS);
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
